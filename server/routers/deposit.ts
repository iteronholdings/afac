import crypto from "crypto";
import { z } from "zod";
import * as db from "../db";
import { creditVbankIfPaid } from "../depositCredit";
import * as portone from "../portone";
import { businessProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";

/** 충전 입력 공통 스키마 (수동·가상계좌 공용). */
const chargeInput = z.object({
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
});

/** 입력에서 세금계산서 관련 필드를 정규화. */
function taxFields(input: z.infer<typeof chargeInput>) {
  const issuing = input.taxInvoice === "issue";
  return {
    taxInvoice: input.taxInvoice,
    bizNumber: issuing ? input.bizNumber || null : null,
    repName: issuing ? input.repName || null : null,
    companyName: issuing ? input.companyName || null : null,
    taxEmail: issuing ? input.taxEmail || null : null,
  };
}

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

  /** 프론트가 가상계좌 자동충전을 쓸 수 있는지 + 필요한 공개 키. */
  config: publicProcedure.query(() => ({
    vbankEnabled: portone.isConfigured(),
    storeId: portone.getStoreId(),
    channelKey: portone.getChannelKey(),
  })),

  /** [수동] 업체가 입금 후 충전요청을 등록. 관리자 승인 시 예치금에 반영. */
  requestCharge: businessProcedure
    .input(chargeInput)
    .mutation(async ({ ctx, input }) => {
      const created = await db.createDepositRequest({
        userId: ctx.user.id,
        amount: input.amount,
        depositorName: input.depositorName,
        method: "manual",
        ...taxFields(input),
        status: "pending",
      });
      return created;
    }),

  /** [가상계좌] 충전건을 만들고 PortOne 결제용 식별자를 발급. */
  initVbankCharge: businessProcedure
    .input(chargeInput)
    .mutation(async ({ ctx, input }) => {
      if (!portone.isConfigured()) {
        throw new Error("가상계좌 결제가 아직 설정되지 않았습니다.");
      }
      const paymentId = `dep_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
      // 입금 기한: 3일 뒤
      const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await db.createDepositRequest({
        userId: ctx.user.id,
        amount: input.amount,
        depositorName: input.depositorName,
        method: "vbank",
        paymentId,
        vbankDue: due.toISOString(),
        ...taxFields(input),
        status: "pending",
      });
      return {
        paymentId,
        storeId: portone.getStoreId(),
        channelKey: portone.getChannelKey(),
        orderName: "예치금 충전",
        amount: input.amount,
        due: due.toISOString(),
      };
    }),

  /** [가상계좌] 발급/입금 상태를 PortOne에서 동기화. 입금됐으면 즉시 반영. */
  syncVbank: businessProcedure
    .input(z.object({ paymentId: z.string().max(80) }))
    .mutation(async ({ ctx, input }) => {
      const reqRow = await db.getDepositRequestByPaymentId(input.paymentId);
      if (!reqRow || reqRow.userId !== ctx.user.id) {
        throw new Error("충전건을 찾을 수 없습니다.");
      }
      const payment = await portone.getPayment(input.paymentId);
      if (payment?.method) {
        await db.setDepositRequestVbank(reqRow.id, {
          vbankBank: (payment.method.bank as string) ?? null,
          vbankNumber: (payment.method.accountNumber as string) ?? null,
          vbankHolder: (payment.method.remitteeName as string) ?? null,
        });
      }
      const credit = await creditVbankIfPaid(input.paymentId);
      const fresh = await db.getDepositRequestByPaymentId(input.paymentId);
      return { request: fresh, paymentStatus: payment?.status ?? null, credited: credit.credited };
    }),

  /** 현재 업체의 충전요청 내역. */
  myRequests: protectedProcedure.query(async ({ ctx }) => {
    return db.listDepositRequestsByUser(ctx.user.id);
  }),
});
