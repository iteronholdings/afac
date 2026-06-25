import ChargeRequestDialog from "@/components/ChargeRequestDialog";
import ClientLayout from "@/components/ClientLayout";
import DepositHistory from "@/components/DepositHistory";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Wallet } from "lucide-react";
import { useState } from "react";

const REQ_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "승인 대기", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "반영 완료", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "거절", cls: "bg-destructive/10 text-destructive" },
};

export default function ClientDeposit() {
  const { data, isLoading } = trpc.deposit.me.useQuery();
  const { data: requests = [] } = trpc.deposit.myRequests.useQuery();
  const [chargeOpen, setChargeOpen] = useState(false);
  const balance = data?.balance ?? 0;

  return (
    <ClientLayout title="예치금" description="예치금 잔액과 충전·차감·결제 내역을 확인하세요.">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* 잔액 카드 */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-[0_12px_32px_-12px_var(--primary)]">
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
          <div className="relative">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-foreground/85">
              <Wallet className="h-4 w-4" /> 현재 예치금 잔액
            </p>
            <p className="mt-1 text-3xl font-extrabold">{balance.toLocaleString()}원</p>
            <Button
              onClick={() => setChargeOpen(true)}
              className="mt-4 rounded-full bg-white font-bold text-primary hover:bg-white/90"
            >
              예치금 충전요청
            </Button>
          </div>
        </div>

        {/* 충전요청 현황 */}
        {requests.length > 0 && (
          <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
            <h3 className="mb-3 font-bold text-foreground">충전요청 현황</h3>
            <div className="space-y-2">
              {requests.map(r => {
                const meta = REQ_STATUS[r.status] ?? REQ_STATUS.pending;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/40 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{r.amount.toLocaleString()}원</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}
                        {r.depositorName ? ` · 입금자 ${r.depositorName}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 내역 */}
        <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
          <h3 className="mb-3 font-bold text-foreground">거래 내역</h3>
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : (
            <DepositHistory tx={data?.transactions ?? []} emptyText="아직 예치금 거래 내역이 없어요." />
          )}
        </div>
      </div>

      <ChargeRequestDialog open={chargeOpen} onOpenChange={setChargeOpen} />
    </ClientLayout>
  );
}
