export type ParticipationStatus =
  | "applied"
  | "purchased"
  | "reviewed"
  | "approved"
  | "paid"
  | "rejected";

export const STATUS_LABEL: Record<ParticipationStatus, string> = {
  applied: "참여 신청",
  purchased: "구매 인증 완료",
  reviewed: "리뷰 인증 완료",
  approved: "지급 확정",
  paid: "입금 완료",
  rejected: "반려",
};

/** Short label for compact badges. */
export const STATUS_SHORT: Record<ParticipationStatus, string> = {
  applied: "신청",
  purchased: "구매완료",
  reviewed: "리뷰완료",
  approved: "지급확정",
  paid: "입금완료",
  rejected: "반려",
};

/** Tailwind classes for status badges (soft, rounded). */
export const STATUS_BADGE: Record<ParticipationStatus, string> = {
  applied: "bg-slate-100 text-slate-600",
  purchased: "bg-sky-100 text-sky-700",
  reviewed: "bg-violet-100 text-violet-700",
  approved: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

/** Ordered workflow steps for stepper UIs (excludes rejected). */
export const WORKFLOW_STEPS: ParticipationStatus[] = [
  "applied",
  "purchased",
  "reviewed",
  "approved",
  "paid",
];

export function statusIndex(status: ParticipationStatus): number {
  const idx = WORKFLOW_STEPS.indexOf(status);
  return idx === -1 ? 0 : idx;
}

/** Format KRW integer amount: 12000 → "12,000원". */
export function formatKRW(amount: number | null | undefined): string {
  const n = typeof amount === "number" ? amount : 0;
  return `${n.toLocaleString("ko-KR")}원`;
}

/** Total payout = product price (reimbursement) + commission. */
export function totalPayout(productPrice: number, commission: number): number {
  return (productPrice || 0) + (commission || 0);
}
