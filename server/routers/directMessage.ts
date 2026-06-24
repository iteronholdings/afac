import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

export const directMessageRouter = router({
  /** List messages in a conversation. Reviewer gets own; admin specifies reviewerId. */
  list: protectedProcedure
    .input(z.object({ reviewerId: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const reviewerId =
        ctx.user.role === "admin" ? input.reviewerId ?? ctx.user.id : ctx.user.id;
      if (ctx.user.role !== "admin" && input.reviewerId && input.reviewerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const msgs = await db.listDirectMessages(reviewerId);
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

  /** Send a message. Reviewer always sends to 운영팀; admin must specify reviewerId. */
  send: protectedProcedure
    .input(
      z.object({
        reviewerId: z.number().int().optional(),
        content: z.string().max(2000).optional(),
        imageUrl: z.string().optional(),
      }).refine(d => d.content?.trim() || d.imageUrl, { message: "내용 또는 이미지를 입력해 주세요." })
    )
    .mutation(async ({ ctx, input }) => {
      const reviewerId =
        ctx.user.role === "admin" ? input.reviewerId! : ctx.user.id;
      if (ctx.user.role === "admin" && !input.reviewerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "reviewerId가 필요합니다." });
      }
      return db.createDirectMessage({
        reviewerId,
        fromUserId: ctx.user.id,
        content: input.content?.trim() || null,
        imageUrl: input.imageUrl || null,
      });
    }),

  /** Mark messages in a conversation as read. */
  markRead: protectedProcedure
    .input(z.object({ reviewerId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const reviewerId =
        ctx.user.role === "admin" ? input.reviewerId ?? 0 : ctx.user.id;
      await db.markDirectMessagesRead(reviewerId, ctx.user.id);
    }),

  /** Admin only: list all reviewer conversations with latest message + unread count. */
  conversations: adminProcedure.query(async ({ ctx }) => {
    const latest = await db.listDirectConversations();
    return Promise.all(
      latest.map(async m => {
        const reviewer = await db.getUserById(m.reviewerId);
        const unread = await db.countUnreadDirectMessages(m.reviewerId, ctx.user.id);
        return {
          reviewerId: m.reviewerId,
          reviewerName: reviewer?.fullName || reviewer?.name || "알 수 없음",
          reviewerLoginId: reviewer?.loginId ?? "",
          latestContent: m.content,
          latestAt: m.createdAt,
          unread,
        };
      })
    );
  }),

  /** Unread count for the current user's conversation. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "admin") {
      // total unread across all conversations
      const convs = await db.listDirectConversations();
      let total = 0;
      for (const m of convs) {
        total += await db.countUnreadDirectMessages(m.reviewerId, ctx.user.id);
      }
      return total;
    }
    return db.countUnreadDirectMessages(ctx.user.id, ctx.user.id);
  }),
});
