import { isCompleteAddress, PARTICIPATION_DEADLINE_DAYS, participationDeadline } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { notifyReviewerChatSms } from "../chatNotify";
import { storageExists } from "../storage";
import * as db from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { assignPacketsForCampaign } from "./campaign";
import { superviseGeneratedDraft, superviseManualDraft } from "../reviewSupervisor";
import { distributeTodayStatus } from "../schedule";

/**
 * 사진 패킷 배정(대용량 ZIP 분해·R2 업로드, 수십초~수분 소요)을 **백그라운드**로 실행한다.
 * 가입 요청을 블로킹하지 않아 가입은 즉시 응답(타임아웃 방지). 캠페인별로 직렬화해
 * 동시 가입 시 중복 처리를 막고, 새 가입분은 직전 실행 뒤 한 번 더 돌려 누락 없이 배정한다.
 * (Railway는 상주 Node 프로세스라 응답 후에도 백그라운드 프라미스가 계속 실행됨)
 */
const assignChains = new Map<number, Promise<void>>();
function scheduleAssignPacket(campaignId: number) {
  const prev = assignChains.get(campaignId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const campaign = await db.getCampaignById(campaignId);
      if (campaign?.photoGuideZip) await assignPacketsForCampaign(campaign);
    })
    .catch(e => console.error("[bg packet assign] failed for campaign", campaignId, e));
  assignChains.set(campaignId, next);
  void next.finally(() => {
    if (assignChains.get(campaignId) === next) assignChains.delete(campaignId);
  });
}

/**
 * 새 참여자에게 AI 리뷰 원고 초안을 생성·저장한다. (사진·글자 리뷰어 대상, 별점 제외)
 * best-effort. reviewType이 photo면 사진형, 그 외(text·구캠페인 null)는 글자형 톤.
 */
async function tryAssignReviewDraft(participationId: number, reviewType: string | null | undefined, campaignId: number) {
  if (reviewType === "star") return; // 별점 리뷰어는 원고 없음
  try {
    const campaign = await db.getCampaignById(campaignId);
    if (!campaign) return;
    const type = reviewType === "photo" ? "photo" : "text";
    // 팀장 검수를 통과한 원고만 배정한다. (캠페인이 "n자 내외"를 정했으면 그 분량으로)
    const qc = superviseGeneratedDraft({
      type,
      title: campaign.title,
      keyword: campaign.keyword,
      targetChars: type === "photo" ? campaign.photoDraftChars : campaign.textDraftChars,
    });
    if (qc.verdict === "flagged") console.warn(`[팀장검수] p${participationId} 경고:`, qc.warnings);
    await db.updateParticipation(participationId, { reviewDraft: qc.text, reviewDraftQc: qc.verdict });
  } catch (e) {
    console.error("[review draft] skipped:", e);
  }
}

/** 인증샷 제출 기한(참여 후 7일, 연장 반영) 초과 시 제출 차단. */
function assertNotExpired(p: { appliedAt: Date | string; deadlineAt?: Date | string | null }) {
  if (Date.now() > participationDeadline(p.appliedAt, p.deadlineAt).getTime()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `제출 기한(참여 후 ${PARTICIPATION_DEADLINE_DAYS}일)이 지났습니다. 계속 진행하려면 운영팀 채팅으로 문의해 주세요.`,
    });
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
        // Drop the business's full guide ZIP from the reviewer payload; expose 존재 플래그만.
        const camp = campaign ? (({ photoGuideZip, ...c }) => ({ ...c, hasGuideZip: !!photoGuideZip }))(campaign) : campaign;
        return { ...rest, hasPacket: !!assignedPacket, campaign: camp };
      })
    );
  }),

  /** 배정된 사진 묶음 다운로드 — 본인(리뷰어) 또는 관리자(검수용). */
  myPacket: protectedProcedure
    .input(z.object({ participationId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p || (p.userId !== ctx.user.id && ctx.user.role !== "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
      }
      const name = p.assignedName ?? "guide.zip";
      const packet = p.assignedPacket;
      // R2 키(`r2:<key>`)면 스토리지 프록시 URL을, 레거시면 base64 데이터 URL을 반환.
      if (packet && packet.startsWith("r2:")) {
        const key = packet.slice(3);
        // 파일이 이미 삭제된 경우(과거 완료 처리 등) raw NoSuchKey XML 대신 안내 메시지로 처리.
        if (!(await storageExists(key).catch(() => true))) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "배정된 사진 파일을 찾을 수 없어요. 업체에 사진 재업로드를 요청해 주세요.",
          });
        }
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

      const me = await db.getUserById(ctx.user.id);

      // 택배 수령 주소가 없거나 구형식(우편번호 없음)이면 참여 불가 — 접속 시 등록 모달로 유도됨.
      if (!isCompleteAddress(me?.address)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "택배 수령 주소를 우편번호 검색으로 먼저 등록해 주세요. (프로필 → 내 정보)" });
      }

      // 중복 계정(부계정) 차단: 같은 전화번호로 이미 참여 중이면 거절.
      if (me?.phone) {
        const dup = await db.countCampaignParticipantsByPhone(input.campaignId, me.phone, ctx.user.id);
        if (dup > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "동일한 전화번호로 이미 참여한 캠페인입니다. (중복 참여 불가)" });
        }
      }

      // 배분 캠페인은 **오늘 배분된 정원**에만 참여 가능 (미래 날짜 선점 금지 → 진행일 펑크 방지).
      const partsForDate = await db.listParticipationsByCampaign(input.campaignId);
      const dist = distributeTodayStatus(campaign.schedule, partsForDate, campaign.slots);
      let assignedDate: string | null = null;
      if (dist.isDistribute) {
        if (dist.reason === "not_today") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "오늘은 이 캠페인의 모집 날짜가 아닙니다. 진행 날짜에 다시 참여해 주세요." });
        }
        if (dist.reason === "full_today") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "오늘 모집 인원이 마감되었습니다. 다음 진행일에 다시 참여해 주세요." });
        }
        assignedDate = dist.today; // 항상 오늘 날짜로 배정
      }

      // 리뷰 유형별 정원 (사진 → 글자 → 별점 순으로 선착순 자동배정)
      // 사진 정원은 업로드된 ZIP의 실제 인분 수(photoUnitCount)를 넘지 못한다 —
      // 예: 사진 10명 신청 + 7인분 업로드 → 사진 배정은 7명까지, 나머지는 글자/별점으로.
      const photoCap = campaign.photoUnitCount == null
        ? (campaign.photoCount ?? 0)
        : Math.min(campaign.photoCount ?? 0, campaign.photoUnitCount);
      const caps = {
        photo: photoCap,
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
          deadlineAt: new Date(Date.now() + PARTICIPATION_DEADLINE_DAYS * 86_400_000),
        });
        scheduleAssignPacket(input.campaignId); // 패킷은 백그라운드 배정(가입 즉시 응답)
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
        deadlineAt: new Date(Date.now() + PARTICIPATION_DEADLINE_DAYS * 86_400_000),
      });
      if (assigned === "photo") scheduleAssignPacket(input.campaignId); // 패킷은 백그라운드 배정(가입 즉시 응답)
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
      assertNotExpired(p);
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
      assertNotExpired(p);
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
      assertNotExpired(p);
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
      // 경량 조회: 인증샷·패킷·원고(LONGTEXT)는 SQL 단계에서 제외하고 존재 플래그만.
      // N+1 제거: 회원·캠페인도 한 번씩만 읽어 매핑. 인증샷은 proofsByCampaign으로 지연 로딩.
      const [parts, allUsers, allCampaigns] = await Promise.all([
        db.listParticipationsLite({ campaignId: input?.campaignId }),
        db.listAllUsers(),
        db.listCampaignsLite(),
      ]);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const campMap = new Map(allCampaigns.map(c => [c.id, c]));
      return parts.map(p => {
        const c = campMap.get(p.campaignId);
        const u = userMap.get(p.userId);
        return {
          ...p,
          hasSearchProof: !!p.hasSearchProof,
          hasPurchaseProof: !!p.hasPurchaseProof,
          hasReviewProof: !!p.hasReviewProof,
          hasPacket: !!p.hasPacket,
          campaign: c ?? null,
          user: u
            ? { id: u.id, fullName: u.fullName, loginId: u.loginId, phone: u.phone, address: u.address ?? null }
            : null,
        };
      });
    }),

  /** Admin: 캠페인 참여자들의 인증샷 (참여현황 목록을 가볍게 유지하기 위한 지연 로딩). */
  /** 업체(캠페인 소유)·관리자: 리뷰어에게 배정된 리뷰 원고 수정. */
  updateReviewDraft: protectedProcedure
    .input(z.object({
      participationId: z.number().int(),
      reviewDraft: z.string().trim().min(1, "원고 내용을 입력해 주세요.").max(4000, "원고가 너무 깁니다. (4000자 이내)"),
    }))
    .mutation(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "참여 내역을 찾을 수 없습니다." });
      const campaign = await db.getCampaignById(p.campaignId);
      if (ctx.user.role !== "admin") {
        if (!campaign || campaign.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
        }
      }
      // 사람이 직접 쓴 원고도 팀장 검수를 거친다 — 이모지·특수문자는 정리하고, 위험 표현은 경고.
      const qc = superviseManualDraft(input.reviewDraft, {
        type: p.reviewType === "photo" ? "photo" : "text",
        title: campaign?.title,
        keyword: campaign?.keyword,
      });
      await db.updateParticipation(input.participationId, { reviewDraft: qc.text, reviewDraftQc: qc.verdict });
      return { success: true as const, verdict: qc.verdict, warnings: qc.warnings };
    }),

  proofsByCampaign: adminProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .query(async ({ input }) => db.listProofsByCampaign(input.campaignId)),

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

  /** Admin: 제출 기한 7일 연장 — 지금 시점과 기존 마감 중 늦은 쪽에 +7일. 리뷰어에게 채팅 안내. */
  extendDeadline: adminProcedure
    .input(z.object({ participationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "참여 내역을 찾을 수 없습니다." });
      const current = participationDeadline(p.appliedAt, p.deadlineAt).getTime();
      const next = new Date(Math.max(current, Date.now()) + PARTICIPATION_DEADLINE_DAYS * 86_400_000);
      await db.updateParticipation(input.participationId, { deadlineAt: next });
      try {
        const campaign = await db.getCampaignById(p.campaignId);
        const dstr = `${next.getMonth() + 1}/${next.getDate()}`;
        await db.createDirectMessage({
          reviewerId: p.userId,
          fromUserId: ctx.user.id,
          content: `[자동 안내] '${campaign?.title ?? "캠페인"}'의 제출 기한이 ${PARTICIPATION_DEADLINE_DAYS}일 연장되었습니다. (새 마감: ${dstr}) 기한 내에 리뷰 인증샷까지 등록해 주세요.`,
        });
        void notifyReviewerChatSms(p.userId);
      } catch (e) {
        console.error("[extendDeadline] 안내 메시지 실패:", e);
      }
      return { deadlineAt: next };
    }),

  /**
   * Admin: 인증샷 반려 — 해당 인증샷을 지우고 그 단계 직전 상태로 되돌려 재등록을 요구한다.
   * 리뷰어에게는 운영팀 채팅으로 자동 안내를 보낸다.
   */
  rejectProof: adminProcedure
    .input(z.object({
      participationId: z.number().int(),
      kind: z.enum(["search", "purchase", "review"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "참여 내역을 찾을 수 없습니다." });
      if (["approved", "paid", "rejected"].includes(p.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "지급 확정·완료된 참여는 인증샷을 반려할 수 없습니다. 상태를 먼저 되돌려 주세요." });
      }
      const plan = {
        search: { has: p.searchProofUrl, patch: { searchProofUrl: null, status: "applied" as const }, label: "검색 인증샷" },
        purchase: { has: p.purchaseProofUrl, patch: { purchaseProofUrl: null, status: "searched" as const }, label: "구매 인증샷" },
        review: { has: p.reviewProofUrl, patch: { reviewProofUrl: null, status: "purchased" as const }, label: "리뷰 인증샷" },
      }[input.kind];
      if (!plan.has) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "반려할 인증샷이 없습니다." });
      }
      await db.updateParticipation(input.participationId, plan.patch);
      // 리뷰어에게 운영팀 채팅으로 재등록 안내 (실패해도 반려 자체는 유지)
      try {
        const campaign = await db.getCampaignById(p.campaignId);
        await db.createDirectMessage({
          reviewerId: p.userId,
          fromUserId: ctx.user.id,
          content: `[자동 안내] '${campaign?.title ?? "캠페인"}'의 ${plan.label}이 반려되었습니다. 내 활동에서 다시 등록해 주세요.`,
        });
        void notifyReviewerChatSms(p.userId);
      } catch (e) {
        console.error("[rejectProof] 리뷰어 안내 메시지 실패:", e);
      }
      return { success: true as const };
    }),

  // Admin: 참여 삭제 — 반려와 달리 행을 지워 정원·사진 유닛을 즉시 회수한다.
  remove: adminProcedure
    .input(z.object({ participationId: z.number().int() }))
    .mutation(async ({ input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "참여 내역을 찾을 수 없습니다." });
      if (p.status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "입금 완료된 참여는 정산 이력 보존을 위해 삭제할 수 없습니다." });
      }
      await db.deleteParticipation(input.participationId);
      return { success: true as const };
    }),
});
