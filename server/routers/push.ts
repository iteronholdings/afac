import { z } from "zod";
import * as db from "../db";
import * as webpush from "../webpush";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

export const pushRouter = router({
  /** 프론트가 푸시 구독에 쓸 VAPID 공개키 + 활성 여부. */
  publicKey: publicProcedure.query(() => ({
    key: webpush.getPublicKey(),
    enabled: webpush.isConfigured(),
  })),

  /** 브라우저 푸시 구독 저장. */
  subscribe: protectedProcedure
    .input(z.object({
      endpoint: z.string().url().max(512),
      p256dh: z.string().max(255),
      auth: z.string().max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.savePushSubscription({
        userId: ctx.user.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      });
      return { success: true as const };
    }),

  /** 구독 해지. */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().max(512) }))
    .mutation(async ({ input }) => {
      await db.deletePushSubscriptionByEndpoint(input.endpoint);
      return { success: true as const };
    }),
});
