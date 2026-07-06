import AdminLayout from "@/components/AdminLayout";
import DepositHistory from "@/components/DepositHistory";
import PasswordResetButton from "@/components/PasswordResetButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { memberMatchesQuery } from "@/lib/memberSearch";
import { trpc } from "@/lib/trpc";
import { BadgePercent, Building2, Loader2, Minus, Plus, Receipt, RotateCcw, Search, UserX, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Target = { id: number; name: string; balance: number; action: "charge" | "deduct" } | null;

/** 기본 건당 리뷰 단가 (서버 campaign.request와 동일). */
const DEFAULT_REVIEW_FEE = 2400;

export default function AdminBusinesses() {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.admin.listBusinesses.useQuery();

  // 검색(업체명/아이디/전화번호/코드) + 활동/탈퇴 탭
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"active" | "withdrawn">("active");
  const { shown, activeCount, withdrawnCount } = useMemo(() => {
    const matched = data.filter(b => memberMatchesQuery(b, query));
    return {
      shown: matched.filter(b => (tab === "withdrawn" ? !!b.withdrawnAt : !b.withdrawnAt)),
      activeCount: matched.filter(b => !b.withdrawnAt).length,
      withdrawnCount: matched.filter(b => !!b.withdrawnAt).length,
    };
  }, [data, query, tab]);

  // 강제 탈퇴(블랙) / 복구
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: number; name: string } | null>(null);
  const withdrawMutation = trpc.admin.withdrawMember.useMutation({
    onSuccess: () => {
      utils.admin.listBusinesses.invalidate();
      toast.success("탈퇴 처리했습니다. 해당 계정은 로그인과 동일 번호 재가입이 차단됩니다.");
    },
    onError: err => toast.error(err.message),
  });
  const restoreMutation = trpc.admin.restoreMember.useMutation({
    onSuccess: () => {
      utils.admin.listBusinesses.invalidate();
      toast.success("계정을 복구했습니다. 다시 로그인할 수 있습니다.");
    },
    onError: err => toast.error(err.message),
  });

  const [target, setTarget] = useState<Target>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [logFor, setLogFor] = useState<{ id: number; name: string } | null>(null);
  const { data: log = [], isLoading: logLoading } = trpc.admin.depositLog.useQuery(
    { userId: logFor?.id ?? 0 },
    { enabled: !!logFor }
  );

  const { data: chargeReqs = [] } = trpc.admin.listDepositRequests.useQuery();
  const pendingReqs = chargeReqs.filter(r => r.status === "pending");

  const adjust = trpc.admin.adjustDeposit.useMutation({
    onSuccess: (res) => {
      utils.admin.listBusinesses.invalidate();
      toast.success(`예치금이 ${res.balance.toLocaleString()}원이 되었습니다.`);
      close();
    },
    onError: (err) => toast.error(err.message),
  });

  const processReq = trpc.admin.processDepositRequest.useMutation({
    onSuccess: (_res, vars) => {
      utils.admin.listDepositRequests.invalidate();
      utils.admin.listBusinesses.invalidate();
      toast.success(vars.action === "approve" ? "충전요청을 승인하고 예치금에 반영했습니다." : "충전요청을 거절했습니다.");
    },
    onError: (err) => toast.error(err.message),
  });

  const open = (t: NonNullable<Target>) => { setTarget(t); setAmount(""); setMemo(""); };
  const close = () => setTarget(null);

  // VIP 리뷰 단가 설정
  const [feeFor, setFeeFor] = useState<{ id: number; name: string; current: number | null } | null>(null);
  const [feeInput, setFeeInput] = useState("");
  const setFee = trpc.admin.setReviewFee.useMutation({
    onSuccess: (_res, vars) => {
      utils.admin.listBusinesses.invalidate();
      toast.success(vars.fee == null ? "기본 단가(2,400원)로 복원했습니다." : `리뷰 단가를 ${vars.fee.toLocaleString()}원으로 설정했습니다.`);
      setFeeFor(null);
    },
    onError: err => toast.error(err.message),
  });
  const submitFee = () => {
    if (!feeFor) return;
    const fee = parseInt(feeInput.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(fee) || fee <= 0) { toast.error("단가를 입력해 주세요."); return; }
    setFee.mutate({ userId: feeFor.id, fee });
  };

  const submit = () => {
    if (!target) return;
    const amt = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    if (!amt || amt <= 0) { toast.error("금액을 입력해 주세요."); return; }
    adjust.mutate({ userId: target.id, amount: amt, action: target.action, memo: memo.trim() || undefined });
  };

  return (
    <AdminLayout
      title="업체 관리"
      description="업체 계정과 예치금을 관리합니다."
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="업체명·아이디·전화번호 검색"
            className="h-9 w-56 bg-card pl-9"
          />
        </div>
      }
    >
      {/* 활동 / 탈퇴 탭 */}
      <div className="mb-4 flex gap-2">
        {([["active", `활동 업체 ${activeCount}`], ["withdrawn", `탈퇴 업체 ${withdrawnCount}`]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setTab(v)}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-all ${
              tab === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 예치금 충전요청 */}
      {pendingReqs.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-amber-900">
            <Wallet className="h-4 w-4" /> 예치금 충전요청
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{pendingReqs.length}</span>
          </h3>
          <div className="space-y-2">
            {pendingReqs.map(r => (
              <div key={r.id} className="rounded-xl border border-amber-200/70 bg-card px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {r.business?.fullName ?? "-"}{" "}
                      <span className="text-xs font-normal text-muted-foreground">({r.business?.loginId ?? "-"})</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <span>{new Date(r.createdAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</span>
                      {r.depositorName && <span>· 입금자 {r.depositorName}</span>}
                      <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${r.taxInvoice === "issue" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                        세금계산서 {r.taxInvoice === "issue" ? "발급" : "미발급"}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-extrabold text-primary">{r.amount.toLocaleString()}원</span>
                    <Button
                      size="sm"
                      className="h-8 gap-1 rounded-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={processReq.isPending}
                      onClick={() => processReq.mutate({ id: r.id, action: "approve" })}
                    >
                      <Plus className="h-3.5 w-3.5" /> 승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 rounded-full bg-card"
                      disabled={processReq.isPending}
                      onClick={() => processReq.mutate({ id: r.id, action: "reject" })}
                    >
                      <Minus className="h-3.5 w-3.5" /> 거절
                    </Button>
                  </div>
                </div>

                {r.taxInvoice === "issue" && (
                  <div className="mt-2 grid gap-x-4 gap-y-1 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs sm:grid-cols-2">
                    <div><span className="text-muted-foreground">사업자번호</span> <span className="font-semibold text-foreground">{r.bizNumber ?? "-"}</span></div>
                    <div><span className="text-muted-foreground">대표자명</span> <span className="font-semibold text-foreground">{r.repName ?? "-"}</span></div>
                    <div><span className="text-muted-foreground">상호</span> <span className="font-semibold text-foreground">{r.companyName ?? "-"}</span></div>
                    <div className="min-w-0 truncate"><span className="text-muted-foreground">이메일</span> <span className="font-semibold text-foreground">{r.taxEmail ?? "-"}</span></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-card py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted"><Building2 className="h-6 w-6 text-muted-foreground" /></div>
          <p className="font-semibold">{query ? "검색 결과가 없습니다" : tab === "withdrawn" ? "탈퇴 처리된 업체가 없습니다" : "등록된 업체가 없습니다"}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
          <div className="grid grid-cols-[1.4fr_0.7fr_1fr_0.9fr_1fr_410px] items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
            <div>업체명</div><div>코드</div><div>연락처</div><div className="text-right">리뷰 단가</div><div className="text-right">예치금 잔액</div><div className="text-right">예치금 조정</div>
          </div>
          <div className="divide-y divide-border/50">
            {shown.map(b => (
              <div key={b.id} className="grid grid-cols-[1.4fr_0.7fr_1fr_0.9fr_1fr_410px] items-center gap-3 px-4 py-3.5 text-sm">
                <div>
                  <p className="font-semibold text-foreground">{b.fullName}</p>
                  <p className="text-xs text-muted-foreground">{b.loginId}</p>
                  {b.withdrawnAt && (
                    <p className="text-xs font-semibold text-destructive">탈퇴 {new Date(b.withdrawnAt).toLocaleDateString("ko-KR")}</p>
                  )}
                </div>
                <div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">{b.memberCode ?? "-"}</span>
                </div>
                <div className="text-muted-foreground">{b.phone}</div>
                <div className="text-right">
                  <button
                    type="button"
                    title="클릭해서 단가 변경"
                    onClick={() => { setFeeFor({ id: b.id, name: b.fullName, current: b.customReviewFee }); setFeeInput(b.customReviewFee != null ? String(b.customReviewFee) : ""); }}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                      b.customReviewFee != null
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <BadgePercent className="h-3 w-3" />
                    {(b.customReviewFee ?? DEFAULT_REVIEW_FEE).toLocaleString()}원
                    {b.customReviewFee != null && <span>⭐</span>}
                  </button>
                </div>
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
                  <PasswordResetButton userId={b.id} name={b.fullName} />
                  {b.withdrawnAt ? (
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full bg-card" disabled={restoreMutation.isPending}
                      onClick={() => restoreMutation.mutate({ userId: b.id })}>
                      <RotateCcw className="h-3.5 w-3.5" /> 복구
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full bg-card text-destructive hover:text-destructive" disabled={withdrawMutation.isPending}
                      onClick={() => setWithdrawTarget({ id: b.id, name: b.fullName })}>
                      <UserX className="h-3.5 w-3.5" /> 탈퇴
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          </div>
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

      {/* VIP 리뷰 단가 설정 */}
      <Dialog open={!!feeFor} onOpenChange={o => !o && setFeeFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgePercent className="h-5 w-5 text-primary" /> 리뷰 단가 설정
            </DialogTitle>
          </DialogHeader>
          {feeFor && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{feeFor.name}</span> · 현재{" "}
                <b className="text-foreground">{(feeFor.current ?? DEFAULT_REVIEW_FEE).toLocaleString()}원</b>
                {feeFor.current == null && <span className="text-xs text-muted-foreground"> (기본가)</span>}
                {feeFor.current != null && <span className="text-xs font-bold text-amber-700"> ⭐우대가</span>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reviewFee">건당 리뷰 단가 (원)</Label>
                <Input id="reviewFee" inputMode="numeric" placeholder={`기본 ${DEFAULT_REVIEW_FEE.toLocaleString()}`} value={feeInput}
                  onChange={e => setFeeInput(e.target.value)} onKeyDown={e => e.key === "Enter" && submitFee()} className="h-11" />
                <p className="text-[11px] text-muted-foreground">
                  이 업체가 캠페인 결제 시 적용되는 건당 리뷰 비용입니다. (리뷰어 작업수당 1,000원은 동일)
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              className="text-muted-foreground"
              disabled={setFee.isPending || feeFor?.current == null}
              onClick={() => feeFor && setFee.mutate({ userId: feeFor.id, fee: null })}
            >
              기본가로 복원
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFeeFor(null)}>취소</Button>
              <Button onClick={submitFee} disabled={setFee.isPending} className="font-bold">
                {setFee.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                저장
              </Button>
            </div>
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

      {/* 강제 탈퇴(블랙) 확인 */}
      <AlertDialog open={withdrawTarget !== null} onOpenChange={o => !o && setWithdrawTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업체를 탈퇴(블랙) 처리할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{withdrawTarget?.name}</span> 업체는 즉시 로그아웃되며,
              로그인과 동일 전화번호로의 재가입이 차단됩니다. 예치금·캠페인 기록은 그대로 보존되고,
              탈퇴 업체 탭에서 언제든 복구할 수 있어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={withdrawMutation.isPending}
              onClick={() => {
                if (withdrawTarget) withdrawMutation.mutate({ userId: withdrawTarget.id });
                setWithdrawTarget(null);
              }}
            >
              탈퇴 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
