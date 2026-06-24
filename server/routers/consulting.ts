import { z } from "zod";
import * as db from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

export const consultingRouter = router({
  /** Seller submits a 상위노출 컨설팅 의뢰. */
  create: protectedProcedure
    .input(
      z.object({
        platform: z.string().trim().min(1).max(30),
        productUrl: z.string().trim().max(2000).optional(),
        targetKeyword: z.string().trim().max(300).optional(),
        currentRank: z.string().trim().max(100).optional(),
        budget: z.string().trim().max(100).optional(),
        memo: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return db.createConsultingRequest({
        userId: ctx.user.id,
        platform: input.platform,
        productUrl: input.productUrl || null,
        targetKeyword: input.targetKeyword || null,
        currentRank: input.currentRank || null,
        budget: input.budget || null,
        memo: input.memo || null,
      });
    }),

  /** Admin: list all consulting requests with seller info. */
  list: adminProcedure.query(async () => {
    const rows = await db.listConsultingRequests();
    return Promise.all(
      rows.map(async r => {
        const user = await db.getUserById(r.userId);
        return {
          ...r,
          seller: user
            ? {
                id: user.id,
                fullName: user.fullName ?? user.name ?? "-",
                loginId: user.loginId ?? "-",
                phone: user.phone ?? "-",
                memberCode: user.memberCode ?? "-",
              }
            : null,
        };
      })
    );
  }),

  /** Admin: update a request's status. */
  setStatus: adminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["new", "contacted", "done"]) }))
    .mutation(async ({ input }) => db.setConsultingRequestStatus(input.id, input.status)),
});
