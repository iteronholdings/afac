import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

type Tx = {
  id: number;
  amount: number;
  type: "charge" | "deduct" | "campaign" | "refund" | string;
  balanceAfter: number;
  memo: string | null;
  createdAt: string | Date | null;
};

const TYPE_LABEL: Record<string, string> = {
  charge: "충전",
  deduct: "차감",
  campaign: "캠페인 결제",
  refund: "환불",
};

export default function DepositHistory({ tx, emptyText = "거래 내역이 없습니다." }: { tx: Tx[]; emptyText?: string }) {
  if (tx.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="divide-y divide-border/50">
      {tx.map(t => {
        const plus = t.amount >= 0;
        return (
          <div key={t.id} className="flex items-center gap-3 py-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${plus ? "bg-emerald-100 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
              {plus ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {TYPE_LABEL[t.type] ?? t.type}
                {t.memo && <span className="ml-1.5 font-normal text-muted-foreground">· {t.memo}</span>}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t.createdAt ? new Date(t.createdAt).toLocaleString("ko-KR") : "-"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-sm font-bold ${plus ? "text-emerald-600" : "text-destructive"}`}>
                {plus ? "+" : "−"}{Math.abs(t.amount).toLocaleString()}원
              </p>
              <p className="text-[11px] text-muted-foreground">잔액 {t.balanceAfter.toLocaleString()}원</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
