import { z } from "zod";
import * as db from "../db";
import { businessProcedure, protectedProcedure, router } from "../_core/trpc";

export const depositRouter = router({
  /** 현재 로그인한 업체의 예치금 잔액 + 거래 내역. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.getUserById(ctx.user.id);
    const transactions = await db.listDepositTransactions(ctx.user.id);
    return {
      balance: user?.depositBalance ?? 0,
      transactions,
    };
  }),

  /** 업체가 입금 후 충전요청을 등록. 관리자 승인 시 예치금에 반영된다. */
  requestCharge: businessProcedure
    .input(z.object({
      amount: z.number().int().positive("충전 금액을 입력해 주세요.").max(100_000_000),
      depositorName: z.string().trim().max(60).optional(),
      memo: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const created = await db.createDepositRequest({
        userId: ctx.user.id,
        amount: input.amount,
        depositorName: input.depositorName || null,
        memo: input.memo || null,
        status: "pending",
      });
      return created;
    }),

  /** 현재 업체의 충전요청 내역. */
  myRequests: protectedProcedure.query(async ({ ctx }) => {
    return db.listDepositRequestsByUser(ctx.user.id);
  }),
});
