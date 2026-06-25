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
      depositorName: z.string().trim().min(1, "입금자명을 입력해 주세요.").max(20, "입금자명은 최대 20자입니다."),
      taxInvoice: z.enum(["issue", "none"]).default("none"),
      bizNumber: z.string().trim().max(20).optional(),
      repName: z.string().trim().max(40).optional(),
      companyName: z.string().trim().max(100).optional(),
      taxEmail: z.string().trim().max(120).optional(),
    }).superRefine((val, ctx) => {
      if (val.taxInvoice === "issue") {
        const fields: [keyof typeof val, string][] = [
          ["bizNumber", "사업자 번호"],
          ["repName", "대표자명"],
          ["companyName", "상호"],
          ["taxEmail", "이메일"],
        ];
        for (const [key, label] of fields) {
          if (!String(val[key] ?? "").trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${label}을(를) 입력해 주세요.` });
          }
        }
        if (val.taxEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.taxEmail)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxEmail"], message: "올바른 이메일을 입력해 주세요." });
        }
      }
    }))
    .mutation(async ({ ctx, input }) => {
      const issuing = input.taxInvoice === "issue";
      const created = await db.createDepositRequest({
        userId: ctx.user.id,
        amount: input.amount,
        depositorName: input.depositorName,
        taxInvoice: input.taxInvoice,
        bizNumber: issuing ? input.bizNumber || null : null,
        repName: issuing ? input.repName || null : null,
        companyName: issuing ? input.companyName || null : null,
        taxEmail: issuing ? input.taxEmail || null : null,
        status: "pending",
      });
      return created;
    }),

  /** 현재 업체의 충전요청 내역. */
  myRequests: protectedProcedure.query(async ({ ctx }) => {
    return db.listDepositRequestsByUser(ctx.user.id);
  }),
});
