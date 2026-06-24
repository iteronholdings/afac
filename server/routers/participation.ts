import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

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
        const campaign = await db.getCampaignById(p.campaignId);
        return { ...p, campaign };
      })
    );
  }),

  // Reviewer: apply to a campaign.
  join: protectedProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") {
        throw new TRPCError({ code: "FORBIDDEN", message: "리뷰어 계정만 캠페인에 참여할 수 있습니다." });
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

      const taken = await db.countActiveParticipations(input.campaignId);
      if (taken >= campaign.slots) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "모집 인원이 마감되었습니다." });
      }

      return db.createParticipation({
        campaignId: input.campaignId,
        userId: ctx.user.id,
        status: "applied",
      });
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
