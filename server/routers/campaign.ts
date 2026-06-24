import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, businessProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";

const campaignInput = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(200),
  category: z.string().trim().max(50).optional(),
  keyword: z.string().trim().min(1, "검색 키워드를 입력해 주세요.").max(200),
  thumbnailUrl: z.string().trim().optional(),
  productUrl: z.string().trim().optional(),
  description: z.string().trim().max(2000).optional(),
  productPrice: z.number().int().min(0),
  commission: z.number().int().min(0),
  slots: z.number().int().min(1).max(10000),
});

export const campaignRouter = router({
  // Public: list open campaigns for homepage preview (max 3).
  listPreview: publicProcedure.query(async () => {
    const rows = await db.listCampaigns({ onlyOpen: true });
    const withCounts = await Promise.all(
      rows.slice(0, 3).map(async c => {
        const taken = await db.countActiveParticipations(c.id);
        return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
  }),

  // Protected: list open campaigns for reviewers (with remaining slots).
  // 로그인 사용자만 목록 조회 가능.
  listOpen: protectedProcedure.query(async () => {
    const rows = await db.listCampaigns({ onlyOpen: true });
    const withCounts = await Promise.all(
      rows.map(async c => {
        const taken = await db.countActiveParticipations(c.id);
        return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
  }),

  // Protected: campaign detail. 로그인한 사용자만 조회 가능.
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const c = await db.getCampaignById(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      const taken = await db.countActiveParticipations(c.id);
      return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
    }),

  // Admin: list all campaigns (incl. closed) with participation counts.
  listAll: adminProcedure.query(async () => {
    const rows = await db.listCampaigns();
    const withCounts = await Promise.all(
      rows.map(async c => {
        const taken = await db.countActiveParticipations(c.id);
        return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
  }),

  // Admin: create.
  create: adminProcedure
    .input(campaignInput)
    .mutation(async ({ ctx, input }) => {
      const created = await db.createCampaign({
        ...input,
        createdBy: ctx.user.id,
      });
      return created;
    }),

  // Admin: update.
  update: adminProcedure
    .input(campaignInput.partial().extend({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const existing = await db.getCampaignById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      return db.updateCampaign(id, rest);
    }),

  // Admin: delete campaign (and its participations).
  remove: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const existing = await db.getCampaignById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      await db.deleteCampaign(input.id);
      return { id: input.id };
    }),

  // Admin: toggle status (open/closed/pending/rejected).
  setStatus: adminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["pending", "open", "closed", "rejected"]) }))
    .mutation(async ({ input }) => {
      const existing = await db.getCampaignById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      return db.updateCampaign(input.id, { status: input.status });
    }),

  // Business: request a new campaign (starts as pending, admin must approve).
  request: businessProcedure
    .input(campaignInput)
    .mutation(async ({ ctx, input }) => {
      const created = await db.createCampaign({
        ...input,
        status: "pending",
        createdBy: ctx.user.id,
      });
      return created;
    }),

  // Business: list own campaigns with participation counts.
  myBusiness: businessProcedure.query(async ({ ctx }) => {
    const rows = await db.listCampaignsByOwner(ctx.user.id);
    const withCounts = await Promise.all(
      rows.map(async c => {
        const taken = await db.countActiveParticipations(c.id);
        return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
  }),

  // Business: list participations for a campaign they own (with proof photos).
  campaignParticipants: businessProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const campaign = await db.getCampaignById(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      // Admin can see any campaign; business can only see their own.
      if (ctx.user.role !== "admin" && campaign.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
      }
      const parts = await db.listParticipationsByCampaign(input.campaignId);
      // Attach reviewer info (name, phone) per participation.
      const withUser = await Promise.all(
        parts.map(async p => {
          const reviewer = await db.getUserById(p.userId);
          return {
            ...p,
            reviewer: reviewer
              ? { id: reviewer.id, fullName: reviewer.fullName, phone: reviewer.phone }
              : null,
          };
        })
      );
      return withUser;
    }),
});
