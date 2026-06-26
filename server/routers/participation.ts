import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { assignPacketsForCampaign } from "./campaign";
import { generateReviewDraft } from "../reviewDraft";

/**
 * 사진 리뷰어가 가입하면 업로드된 가이드 ZIP에서 본인 몫 패킷을 자동 배정한다.
 * best-effort: ZIP 미업로드/오류 등은 가입 자체를 막지 않는다.
 */
async function tryAutoAssignPacket(campaignId: number) {
  try {
    const campaign = await db.getCampaignById(campaignId);
    if (campaign?.photoGuideZip) await assignPacketsForCampaign(campaign);
  } catch (e) {
    console.error("[auto-assign packet] skipped:", e);
  }
}

/**
 * 새 참여자에게 AI 리뷰 원고 초안을 생성·저장한다. (사진·글자 리뷰어 대상, 별점 제외)
 * best-effort. reviewType이 photo면 사진형, 그 외(text·구캠페인 null)는 글자형 톤.
 */
/**
 * 배분(distribute) 캠페인의 schedule({날짜:정원})에서, 기존 참여자들의 배정 날짜를
 * 집계해 아직 정원이 안 찬 가장 이른 날짜를 반환한다. 모두 차면 null.
 * schedule이 없거나(단일 진행) 비면 null(날짜 미배정).
 */
function pickAssignedDate(
  scheduleJson: string | null | undefined,
  parts: { status: string; assignedDate?: string | null }[],
): string | null {
  if (!scheduleJson) return null;
  let sched: Record<string, number>;
  try { sched = JSON.parse(scheduleJson); } catch { return null; }
  const dates = Object.keys(sched).filter(d => (Number(sched[d]) || 0) > 0).sort();
  if (dates.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const p of parts) {
    if (p.status === "rejected" || !p.assignedDate) continue;
    counts[p.assignedDate] = (counts[p.assignedDate] || 0) + 1;
  }
  for (const d of dates) {
    if ((counts[d] || 0) < Number(sched[d])) return d;
  }
  return null; // 모든 날짜 마감
}

async function tryAssignReviewDraft(participationId: number, reviewType: string | null | undefined, campaignId: number) {
  if (reviewType === "star") return; // 별점 리뷰어는 원고 없음
  try {
    const campaign = await db.getCampaignById(campaignId);
    if (!campaign) return;
    const type = reviewType === "photo" ? "photo" : "text";
    const draft = generateReviewDraft({ type, title: campaign.title, keyword: campaign.keyword });
    await db.updateParticipation(participationId, { reviewDraft: draft });
  } catch (e) {
    console.error("[review draft] skipped:", e);
  }
}

/**
 * Workflow status transitions:
 * applied → purchased → reviewed → approved → paid
 * Reviewers drive: applied (apply), purchased (upload purchase proof),
 *                  reviewed (upload review proof).
 * Admins drive: approved (지급확정), paid (입금완료/종료), rejected.
 */
export const participationRouter = router({
  // Reviewer: my participations enriched with campaign info.
  mine: protectedProcedure.query(async ({ ctx }) => {
    const parts = await db.listParticipationsByUser(ctx.user.id);
    return Promise.all(
      parts.map(async p => {
        // Strip the heavy assigned-packet base64; expose a flag instead.
        const { assignedPacket, ...rest } = p;
        const campaign = await db.getCampaignById(p.campaignId);
        // Drop the business's full guide ZIP from the reviewer payload.
        const camp = campaign ? (({ photoGuideZip, ...c }) => c)(campaign) : campaign;
        return { ...rest, hasPacket: !!assignedPacket, campaign: camp };
      })
    );
  }),

  /** Reviewer: download their assigned photo-review packet for a participation. */
  myPacket: protectedProcedure
    .input(z.object({ participationId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p || p.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
      }
      const name = p.assignedName ?? "guide.zip";
      const packet = p.assignedPacket;
      // R2 키(`r2:<key>`)면 스토리지 프록시 URL을, 레거시면 base64 데이터 URL을 반환.
      if (packet && packet.startsWith("r2:")) {
        const key = packet.slice(3);
        return { name, url: `/manus-storage/${key}?dl=${encodeURIComponent(name)}`, dataUrl: null };
      }
      return { name, url: null, dataUrl: packet ?? null };
    }),

  // Reviewer: apply to a campaign.
  join: protectedProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") {
        throw new TRPCError({ code: "FORBIDDEN", message: "리뷰어 계정만 캠페인에 참여할 수 있습니다." });
      }
      if (!ctx.user.reviewerAgreedAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "리뷰어 절차 안내에 먼저 동의해 주세요." });
      }
      const campaign = await db.getCampaignById(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      if (campaign.status !== "open") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "마감된 캠페인입니다." });
      }

      const existing = await db.getParticipation(input.campaignId, ctx.user.id);
      if (existing && existing.status !== "rejected") {
        throw new TRPCError({ code: "CONFLICT", message: "이미 참여 신청한 캠페인입니다." });
      }

      // 중복 계정(부계정) 차단: 같은 전화번호로 이미 참여 중이면 거절.
      const me = await db.getUserById(ctx.user.id);
      if (me?.phone) {
        const dup = await db.countCampaignParticipantsByPhone(input.campaignId, me.phone, ctx.user.id);
        if (dup > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "동일한 전화번호로 이미 참여한 캠페인입니다. (중복 참여 불가)" });
        }
      }

      // 배분 캠페인이면 진행 날짜를 자동 배정(선착순, 이른 날짜부터). 단일 진행이면 null.
      const partsForDate = await db.listParticipationsByCampaign(input.campaignId);
      const assignedDate = pickAssignedDate(campaign.schedule, partsForDate);
      if (campaign.schedule && assignedDate === null) {
        // 배분 캠페인인데 모든 날짜가 마감된 경우.
        let hasDates = false;
        try { hasDates = Object.values(JSON.parse(campaign.schedule)).some(v => Number(v) > 0); } catch { /* ignore */ }
        if (hasDates) throw new TRPCError({ code: "BAD_REQUEST", message: "모든 진행 날짜의 모집이 마감되었습니다." });
      }

      // 리뷰 유형별 정원 (사진 → 글자 → 별점 순으로 선착순 자동배정)
      const caps = {
        photo: campaign.photoCount ?? 0,
        text: campaign.textCount ?? 0,
        star: campaign.starCount ?? 0,
      } as const;
      const totalCap = caps.photo + caps.text + caps.star;

      // 유형 구분이 없는 (구) 캠페인은 기존 방식대로 총 정원만 체크.
      if (totalCap === 0) {
        const taken = partsForDate.filter(p => p.status !== "rejected").length;
        if (taken >= campaign.slots) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "모집 인원이 마감되었습니다." });
        }
        const created = await db.createParticipation({
          campaignId: input.campaignId,
          userId: ctx.user.id,
          status: "applied",
          assignedDate,
        });
        await tryAutoAssignPacket(input.campaignId); // 구 캠페인(유형 무관)도 패킷 자동배정
        if (created) await tryAssignReviewDraft(created.id, null, input.campaignId); // 원고 자동생성
        return created;
      }

      // 현재 유형별 충원 현황 집계 (반려 제외)
      const parts = partsForDate;
      const takenByType = { photo: 0, text: 0, star: 0 };
      for (const p of parts) {
        if (p.status === "rejected") continue;
        if (p.reviewType && p.reviewType in takenByType) {
          takenByType[p.reviewType as keyof typeof takenByType]++;
        }
      }

      // 사진 → 글자 → 별점 순으로 첫 빈 슬롯에 배정
      const order = ["photo", "text", "star"] as const;
      const assigned = order.find(t => takenByType[t] < caps[t]) ?? null;
      if (!assigned) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "모집 인원이 마감되었습니다." });
      }

      const created = await db.createParticipation({
        campaignId: input.campaignId,
        userId: ctx.user.id,
        status: "applied",
        reviewType: assigned,
        assignedDate,
      });
      if (assigned === "photo") await tryAutoAssignPacket(input.campaignId); // 사진 리뷰어 패킷 자동배정
      if (created) await tryAssignReviewDraft(created.id, assigned, input.campaignId); // 원고 자동생성
      return created;
    }),

  // Reviewer: upload search proof → status searched.
  submitSearchProof: protectedProcedure
    .input(z.object({ participationId: z.number().int(), proofUrl: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p || p.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "참여 내역을 찾을 수 없습니다." });
      }
      if (!["applied", "searched"].includes(p.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "현재 단계에서는 검색 인증을 등록할 수 없습니다." });
      }
      return db.updateParticipation(input.participationId, {
        searchProofUrl: input.proofUrl,
        status: "searched",
        searchedAt: new Date(),
      });
    }),

  // Reviewer: upload purchase proof → status purchased.
  submitPurchaseProof: protectedProcedure
    .input(z.object({ participationId: z.number().int(), proofUrl: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p || p.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "참여 내역을 찾을 수 없습니다." });
      }
      if (!["searched", "purchased"].includes(p.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "검색 인증 후에 구매 인증을 등록할 수 있습니다." });
      }
      return db.updateParticipation(input.participationId, {
        purchaseProofUrl: input.proofUrl,
        status: "purchased",
        purchasedAt: new Date(),
      });
    }),

  // Reviewer: upload review proof → status reviewed.
  submitReviewProof: protectedProcedure
    .input(z.object({ participationId: z.number().int(), proofUrl: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p || p.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "참여 내역을 찾을 수 없습니다." });
      }
      if (!["purchased", "reviewed"].includes(p.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "구매 인증 후에 리뷰 인증을 등록할 수 있습니다." });
      }
      return db.updateParticipation(input.participationId, {
        reviewProofUrl: input.proofUrl,
        status: "reviewed",
        reviewedAt: new Date(),
      });
    }),

  // Admin: list all participations (optionally by campaign), enriched with user + campaign.
  listAll: adminProcedure
    .input(z.object({ campaignId: z.number().int().optional() }).optional())
    .query(async ({ input }) => {
      const parts = await db.listParticipations({ campaignId: input?.campaignId });
      return Promise.all(
        parts.map(async p => {
          const campaign = await db.getCampaignById(p.campaignId);
          const user = await db.getUserById(p.userId);
          return {
            ...p,
            campaign,
            user: user
              ? { id: user.id, fullName: user.fullName, loginId: user.loginId, phone: user.phone }
              : null,
          };
        })
      );
    }),

  // Admin: set status (approved / paid / rejected / back to a prior step).
  setStatus: adminProcedure
    .input(
      z.object({
        participationId: z.number().int(),
        status: z.enum(["applied", "searched", "purchased", "reviewed", "approved", "paid", "rejected"]),
        adminMemo: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "참여 내역을 찾을 수 없습니다." });

      const patch: Record<string, unknown> = { status: input.status };
      if (input.adminMemo !== undefined) patch.adminMemo = input.adminMemo;
      if (input.status === "approved") patch.approvedAt = new Date();
      if (input.status === "paid") patch.paidAt = new Date();

      return db.updateParticipation(input.participationId, patch);
    }),
});
