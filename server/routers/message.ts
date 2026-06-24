import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const messageRouter = router({
  // 채팅 메시지 목록 조회 (참여자 본인 또는 관리자만)
  list: protectedProcedure
    .input(z.object({ participationId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && p.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const msgs = await db.listMessages(input.participationId);
      // 각 메시지에 발신자 이름 첨부
      return Promise.all(
        msgs.map(async m => {
          const sender = await db.getUserById(m.senderId);
          return {
            ...m,
            senderName: sender?.fullName || sender?.name || "알 수 없음",
            senderRole: sender?.role ?? "user",
          };
        })
      );
    }),

  // 메시지 전송
  send: protectedProcedure
    .input(
      z.object({
        participationId: z.number().int(),
        content: z.string().max(2000).optional(),
        imageUrl: z.string().optional(),
      }).refine(d => (d.content?.trim() || d.imageUrl), {
        message: "내용 또는 이미지를 입력해 주세요.",
      })
    )
    .mutation(async ({ ctx, input }) => {
      const p = await db.getParticipationById(input.participationId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && p.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.createMessage({
        participationId: input.participationId,
        senderId: ctx.user.id,
        content: input.content?.trim() || null,
        imageUrl: input.imageUrl || null,
      });
    }),
});
