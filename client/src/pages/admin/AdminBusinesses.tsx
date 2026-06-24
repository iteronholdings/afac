import AdminLayout from "@/components/AdminLayout";
import DepositHistory from "@/components/DepositHistory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Building2, Loader2, Minus, Plus, Receipt, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Target = { id: number; name: string; balance: number; action: "charge" | "deduct" } | null;

export default function AdminBusinesses() {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.admin.listBusinesses.useQuery();
  const [target, setTarget] = useState<Target>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [logFor, setLogFor] = useState<{ id: number; name: string } | null>(null);
  const { data: log = [], isLoading: logLoading } = trpc.admin.depositLog.useQuery(
    { userId: logFor?.id ?? 0 },
    { enabled: !!logFor }
  );

  const adjust = trpc.admin.adjustDeposit.useMutation({
    onSuccess: (res) => {
      utils.admin.listBusinesses.invalidate();
      toast.success(`예치금이 ${res.balance.toLocaleString()}원이 되었습니다.`);
      close();
    },
    onError: (err) => toast.error(err.message),
  });

  const open = (t: NonNullable<Target>) => { setTarget(t); setAmount(""); setMemo(""); };
  const close = () => setTarget(null);

  const submit = () => {
    if (!target) return;
    const amt = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    if (!amt || amt <= 0) { toast.error("금액을 입력해 주세요."); return; }
    adjust.mutate({ userId: target.id, amount: amt, action: target.action, memo: memo.trim() || undefined });
  };

  return (
    <AdminLayout title="업체 관리" description="업체 계정과 예치금을 관리합니다.">
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-card py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted"><Building2 className="h-6 w-6 text-muted-foreground" /></div>
          <p className="font-semibold">등록된 업체가 없습니다</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="grid grid-cols-[1.5fr_1fr_1.2fr_1.3fr_auto] items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
            <div>업체명</div><div>코드</div><div>연락처</div><div className="text-right">예치금 잔액</div><div className="text-right">예치금 조정</div>
          </div>
          <div className="divide-y divide-border/50">
            {data.map(b => (
              <div key={b.id} className="grid grid-cols-[1.5fr_1fr_1.2fr_1.3fr_auto] items-center gap-3 px-4 py-3.5 text-sm">
                <div>
                  <p className="font-semibold text-foreground">{b.fullName}</p>
                  <p className="text-xs text-muted-foreground">{b.loginId}</p>
                </div>
                <div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">{b.memberCode ?? "-"}</span>
                </div>
                <div className="text-muted-foreground">{b.phone}</div>
                <div className="text-right text-base font-extrabold text-primary">{b.depositBalance.toLocaleString()}원</div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" className="h-8 gap-1 rounded-full bg-emerald-600 hover:bg-emerald-700" onClick={() => open({ id: b.id, name: b.fullName, balance: b.depositBalance, action: "charge" })}>
                    <Plus className="h-3.5 w-3.5" /> 추가
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full bg-card" onClick={() => open({ id: b.id, name: b.fullName, balance: b.depositBalance, action: "deduct" })}>
                    <Minus className="h-3.5 w-3.5" /> 차감
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-full" onClick={() => setLogFor({ id: b.id, name: b.fullName })}>
                    <Receipt className="h-3.5 w-3.5" /> 내역
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!target} onOpenChange={o => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              예치금 {target?.action === "charge" ? "추가" : "차감"}
            </DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{target.name}</span> · 현재 잔액{" "}
                <b className="text-foreground">{target.balance.toLocaleString()}원</b>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">{target.action === "charge" ? "추가" : "차감"} 금액 (원)</Label>
                <Input id="amount" inputMode="numeric" placeholder="예: 100000" value={amount}
                  onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="memo">메모 <span className="font-normal text-muted-foreground">(선택)</span></Label>
                <Input id="memo" placeholder="예: 무통장 입금 확인" value={memo} onChange={e => setMemo(e.target.value)} className="h-11" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>취소</Button>
            <Button onClick={submit} disabled={adjust.isPending}
              className={target?.action === "charge" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
              {adjust.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {target?.action === "charge" ? "추가하기" : "차감하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 예치금 내역 */}
      <Dialog open={!!logFor} onOpenChange={o => !o && setLogFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> {logFor?.name} · 예치금 내역
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {logLoading ? (
              <div className="space-y-2 py-4">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div>
            ) : (
              <DepositHistory tx={log} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
