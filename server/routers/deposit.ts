import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";

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
});
