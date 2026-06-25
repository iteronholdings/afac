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
import { Copy, Landmark, Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * 예치금 입금 계좌 (정적). 실제 운영 계좌로 교체해서 사용하세요.
 * (무통장입금 자동반영은 추후 — 지금은 이 계좌로 입금 후 충전요청 → 관리자 승인.)
 */
export const DEPOSIT_ACCOUNT = {
  bank: "국민은행",
  number: "000000-00-000000",
  holder: "아르벤팩토리",
};

export default function ChargeRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState("");
  const [depositorName, setDepositorName] = useState("");
  const [memo, setMemo] = useState("");

  const mutation = trpc.deposit.requestCharge.useMutation({
    onSuccess: () => {
      toast.success("충전요청이 접수되었어요! 입금 확인 후 예치금에 반영됩니다 🐻");
      utils.deposit.myRequests.invalidate();
      setAmount("");
      setDepositorName("");
      setMemo("");
      onOpenChange(false);
    },
    onError: err => toast.error(err.message),
  });

  const amountNum = parseInt(amount.replace(/[^0-9]/g, ""), 10) || 0;

  const submit = () => {
    if (amountNum <= 0) {
      toast.error("충전 금액을 입력해 주세요.");
      return;
    }
    mutation.mutate({
      amount: amountNum,
      depositorName: depositorName.trim() || undefined,
      memo: memo.trim() || undefined,
    });
  };

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(`${DEPOSIT_ACCOUNT.bank} ${DEPOSIT_ACCOUNT.number}`);
      toast.success("계좌번호를 복사했어요.");
    } catch {
      toast.info(`${DEPOSIT_ACCOUNT.bank} ${DEPOSIT_ACCOUNT.number}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> 예치금 충전요청
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 입금 계좌 안내 */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Landmark className="h-4 w-4 text-primary" /> 입금 계좌
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="leading-snug">
                <p className="text-base font-extrabold text-foreground">
                  {DEPOSIT_ACCOUNT.bank} {DEPOSIT_ACCOUNT.number}
                </p>
                <p className="text-xs text-muted-foreground">예금주 {DEPOSIT_ACCOUNT.holder}</p>
              </div>
              <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 rounded-full bg-card" onClick={copyAccount}>
                <Copy className="h-3.5 w-3.5" /> 복사
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              위 계좌로 입금하신 뒤 아래 정보를 입력해 요청해 주세요. 운영팀이 입금을 확인하면 예치금에 반영됩니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="chargeAmount">충전 금액 (원) *</Label>
            <Input
              id="chargeAmount"
              inputMode="numeric"
              placeholder="예: 100000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              className="h-11"
            />
            {amountNum > 0 && (
              <p className="text-xs font-semibold text-primary">{amountNum.toLocaleString()}원 충전요청</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="depositorName">입금자명 <span className="font-normal text-muted-foreground">(선택)</span></Label>
            <Input
              id="depositorName"
              placeholder="통장에 찍히는 입금자명"
              value={depositorName}
              onChange={e => setDepositorName(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="chargeMemo">메모 <span className="font-normal text-muted-foreground">(선택)</span></Label>
            <Input
              id="chargeMemo"
              placeholder="예: 세금계산서 요청"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              className="h-11"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={submit} disabled={mutation.isPending} className="gap-1.5 font-bold">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            충전요청 보내기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
