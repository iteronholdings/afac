import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { sendPushToUser } from "../webpush";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

/** Resolve (businessId, reviewerId) from the current user + the partner id. */
async function resolvePair(meId: number, meRole: string, partnerId: number) {
  const partner = await db.getUserById(partnerId);
  if (!partner) throw new TRPCError({ code: "NOT_FOUND", message: "상대방을 찾을 수 없습니다." });

  if (meRole === "business") {
    if (partner.role !== "user") throw new TRPCError({ code: "BAD_REQUEST", message: "리뷰어와만 채팅할 수 있습니다." });
    return { businessId: meId, reviewerId: partnerId };
  }
  // reviewer (user)
  if (partner.role !== "business") throw new TRPCError({ code: "BAD_REQUEST", message: "업체와만 채팅할 수 있습니다." });
  return { businessId: partnerId, reviewerId: meId };
}

export const businessMessageRouter = router({
  /** Conversation list for the current user (business sees reviewers, reviewer sees businesses). */
  conversations: protectedProcedure.query(async ({ ctx }) => {
    const asRole = ctx.user.role === "business" ? "business" : "user";
    const latest = await db.listBusinessConversations(ctx.user.id, asRole);
    return Promise.all(
      latest.map(async m => {
        const otherId = asRole === "business" ? m.reviewerId : m.businessId;
        const other = await db.getUserById(otherId);
        const msgs = await db.listBusinessMessages(m.businessId, m.reviewerId);
        const unread = msgs.filter(x => !x.readAt && x.fromUserId !== ctx.user.id).length;
        return {
          partnerId: otherId,
          partnerName: other?.fullName || other?.name || "알 수 없음",
          latestContent: m.content,
          latestAt: m.createdAt,
          unread,
        };
      })
    );
  }),

  /** Messages with a specific partner. */
  list: protectedProcedure
    .input(z.object({ partnerId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { businessId, reviewerId } = await resolvePair(ctx.user.id, ctx.user.role, input.partnerId);
      const msgs = await db.listBusinessMessages(businessId, reviewerId);
      return Promise.all(
        msgs.map(async m => {
          const sender = await db.getUserById(m.fromUserId);
          return {
            ...m,
            senderName: sender?.fullName || sender?.name || "알 수 없음",
            mine: m.fromUserId === ctx.user.id,
          };
        })
      );
    }),

  /** Send a message to a partner. */
  send: protectedProcedure
    .input(
      z.object({
        partnerId: z.number().int(),
        content: z.string().max(2000).optional(),
        imageUrl: z.string().optional(),
      }).refine(d => d.content?.trim() || d.imageUrl, { message: "내용 또는 이미지를 입력해 주세요." })
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, reviewerId } = await resolvePair(ctx.user.id, ctx.user.role, input.partnerId);
      const created = await db.createBusinessMessage({
        businessId,
        reviewerId,
        fromUserId: ctx.user.id,
        content: input.content?.trim() || null,
        imageUrl: input.imageUrl || null,
      });

      // 수신자(상대방)에게 웹푸시
      const preview = input.content?.trim()?.slice(0, 50) || "📷 이미지";
      const senderName = ctx.user.fullName || ctx.user.name || "상대방";
      const partner = await db.getUserById(input.partnerId);
      const url = partner?.role === "business" ? "/client/dashboard" : "/my";
      void sendPushToUser(input.partnerId, { title: `💬 ${senderName}`, body: preview, url });
      return created;
    }),

  /** Mark a conversation as read. */
  markRead: protectedProcedure
    .input(z.object({ partnerId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, reviewerId } = await resolvePair(ctx.user.id, ctx.user.role, input.partnerId);
      await db.markBusinessMessagesRead(businessId, reviewerId, ctx.user.id);
    }),

  /** Total unread count for the current user. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return db.countUnreadBusinessMessages(ctx.user.id);
  }),

  // === 관리자 열람 전용 ===

  /** 모든 업체↔리뷰어 대화쌍(최신 메시지 + 양측 이름). */
  adminConversations: adminProcedure.query(async () => {
    const latest = await db.listAllBusinessConversations();
    return Promise.all(
      latest.map(async m => {
        const biz = await db.getUserById(m.businessId);
        const rev = await db.getUserById(m.reviewerId);
        return {
          businessId: m.businessId,
          reviewerId: m.reviewerId,
          businessName: biz?.fullName || biz?.name || "알 수 없음",
          reviewerName: rev?.fullName || rev?.name || "알 수 없음",
          latestContent: m.content,
          latestAt: m.createdAt,
        };
      })
    );
  }),

  /** 특정 업체↔리뷰어 대화 내역(열람 전용). */
  adminThread: adminProcedure
    .input(z.object({ businessId: z.number().int(), reviewerId: z.number().int() }))
    .query(async ({ input }) => {
      const msgs = await db.listBusinessMessages(input.businessId, input.reviewerId);
      return Promise.all(
        msgs.map(async m => {
          const sender = await db.getUserById(m.fromUserId);
          return {
            ...m,
            senderName: sender?.fullName || sender?.name || "알 수 없음",
            senderRole: sender?.role ?? "user",
          };
        })
      );
    }),
});
