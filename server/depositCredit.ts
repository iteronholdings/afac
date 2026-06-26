/**
 * 가상계좌 입금 확인 → 예치금 반영 (멱등).
 * 웹훅과 프론트 동기화(syncVbank) 양쪽에서 호출되며, 이미 반영된 건은 건너뛴다.
 * 보안: PortOne API에서 결제건을 재조회해 상태/금액을 직접 검증한다.
 */
import * as db from "./db";
import { getPayment } from "./portone";

export async function creditVbankIfPaid(paymentId: string): Promise<{
  credited: boolean;
  reason?: string;
  status?: string;
}> {
  const reqRow = await db.getDepositRequestByPaymentId(paymentId);
  if (!reqRow) return { credited: false, reason: "no_request" };
  if (reqRow.status === "approved") return { credited: false, reason: "already_credited" };

  const payment = await getPayment(paymentId);
  if (!payment) return { credited: false, reason: "payment_not_found" };
  if (payment.status !== "PAID") return { credited: false, status: payment.status };

  const paid = payment.amount?.total ?? 0;
  if (paid !== reqRow.amount) {
    console.warn(`[deposit] amount mismatch for ${paymentId}: paid ${paid} vs requested ${reqRow.amount}`);
    return { credited: false, reason: "amount_mismatch" };
  }

  await db.adjustDeposit({
    userId: reqRow.userId,
    amount: reqRow.amount,
    type: "charge",
    memo: `가상계좌 충전${reqRow.depositorName ? ` (${reqRow.depositorName})` : ""}`,
  });
  await db.markDepositRequestPaid(reqRow.id);
  return { credited: true };
}
