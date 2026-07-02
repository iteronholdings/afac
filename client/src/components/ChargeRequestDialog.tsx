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
import { Check, Copy, FileText, Landmark, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * 예치금 입금 계좌 (정적, 수동 폴백용). PortOne 가상계좌가 설정되면 사용 안 함.
 * 실제 운영 계좌로 교체해서 사용하세요.
 */
export const DEPOSIT_ACCOUNT = {
  bank: "국민은행",
  number: "000000-00-000000",
  holder: "아르벤팩토리",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { PortOne?: any }
}

function loadPortOne(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.PortOne) return resolve(window.PortOne);
    const s = document.createElement("script");
    s.src = "https://cdn.portone.io/v2/browser-sdk.js";
    s.onload = () => resolve(window.PortOne);
    s.onerror = () => reject(new Error("결제 모듈을 불러오지 못했습니다."));
    document.head.appendChild(s);
  });
}

type Issued = { bank?: string | null; number?: string | null; holder?: string | null; due?: string | null; amount: number; credited: boolean };

export default function ChargeRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: config } = trpc.deposit.config.useQuery();
  const vbankEnabled = config?.vbankEnabled ?? false;

  const [amount, setAmount] = useState("");
  const [depositorName, setDepositorName] = useState("");
  const [taxInvoice, setTaxInvoice] = useState<"issue" | "none">("none");
  const [bizNumber, setBizNumber] = useState("");
  const [repName, setRepName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taxEmail, setTaxEmail] = useState("");
  const [processing, setProcessing] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

  // 이전에 입력한 세금계산서 정보 자동입력 (필드가 비어있을 때만 채움 → 수정 자유).
  const { data: lastTax } = trpc.deposit.lastTaxInfo.useQuery(undefined, { enabled: open });
  useEffect(() => {
    if (!open || !lastTax) return;
    if (bizNumber || repName || companyName || taxEmail) return; // 이미 입력 중이면 덮어쓰지 않음
    setBizNumber(lastTax.bizNumber);
    setRepName(lastTax.repName);
    setCompanyName(lastTax.companyName);
    setTaxEmail(lastTax.taxEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lastTax]);

  const reset = () => {
    setAmount("");
    setDepositorName("");
    setTaxInvoice("none");
    setBizNumber("");
    setRepName("");
    setCompanyName("");
    setTaxEmail("");
    setIssued(null);
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const manualMutation = trpc.deposit.requestCharge.useMutation({
    onSuccess: () => {
      toast.success("충전요청이 접수되었어요! 입금 확인 후 예치금에 반영됩니다 🐻");
      utils.deposit.myRequests.invalidate();
      reset();
      onOpenChange(false);
    },
    onError: err => toast.error(err.message),
  });
  const initVbank = trpc.deposit.initVbankCharge.useMutation();
  const syncVbank = trpc.deposit.syncVbank.useMutation();

  const amountNum = parseInt(amount.replace(/[^0-9]/g, ""), 10) || 0;

  /** 공통 입력 검증 → 통과 시 payload 반환. */
  const validate = () => {
    if (amountNum <= 0) { toast.error("충전 금액을 입력해 주세요."); return null; }
    if (!depositorName.trim()) { toast.error("입금자명을 입력해 주세요."); return null; }
    if (taxInvoice === "issue" && (!bizNumber.trim() || !repName.trim() || !companyName.trim() || !taxEmail.trim())) {
      toast.error("세금계산서 발급 정보를 모두 입력해 주세요."); return null;
    }
    return {
      amount: amountNum,
      depositorName: depositorName.trim(),
      taxInvoice,
      bizNumber: taxInvoice === "issue" ? bizNumber.trim() : undefined,
      repName: taxInvoice === "issue" ? repName.trim() : undefined,
      companyName: taxInvoice === "issue" ? companyName.trim() : undefined,
      taxEmail: taxInvoice === "issue" ? taxEmail.trim() : undefined,
    };
  };

  const submitManual = () => {
    const payload = validate();
    if (payload) manualMutation.mutate(payload);
  };

  const submitVbank = async () => {
    const payload = validate();
    if (!payload) return;
    setProcessing(true);
    try {
      const init = await initVbank.mutateAsync(payload);
      const PortOne = await loadPortOne();
      const resp = await PortOne.requestPayment({
        storeId: init.storeId,
        channelKey: init.channelKey,
        paymentId: init.paymentId,
        orderName: init.orderName,
        totalAmount: init.amount,
        currency: "CURRENCY_KRW",
        payMethod: "VIRTUAL_ACCOUNT",
        virtualAccount: { accountExpiry: { validHours: 72 } },
        customer: { fullName: payload.depositorName },
      });
      if (resp?.code != null) {
        toast.error(resp.message || "결제 요청이 취소되었습니다.");
        return;
      }
      const synced = await syncVbank.mutateAsync({ paymentId: init.paymentId });
      const r = synced.request;
      utils.deposit.myRequests.invalidate();
      setIssued({
        bank: r?.vbankBank, number: r?.vbankNumber, holder: r?.vbankHolder, due: r?.vbankDue,
        amount: init.amount, credited: synced.credited,
      });
      if (synced.credited) toast.success("입금이 확인되어 예치금에 반영됐어요! 🎉");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setProcessing(false);
    }
  };

  const copyAccount = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("계좌번호를 복사했어요.");
    } catch {
      toast.info(text);
    }
  };

  const busy = processing || manualMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> 예치금 충전{vbankEnabled ? "" : "요청"}
          </DialogTitle>
        </DialogHeader>

        {/* 가상계좌 발급 완료 화면 */}
        {issued ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
                <Landmark className="h-4 w-4" /> 가상계좌가 발급됐어요
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="leading-snug">
                  <p className="text-base font-extrabold text-foreground">{issued.bank} {issued.number}</p>
                  {issued.holder && <p className="text-xs text-muted-foreground">예금주 {issued.holder}</p>}
                </div>
                {issued.number && (
                  <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 rounded-full bg-card"
                    onClick={() => copyAccount(`${issued.bank} ${issued.number}`)}>
                    <Copy className="h-3.5 w-3.5" /> 복사
                  </Button>
                )}
              </div>
              <p className="mt-2 text-sm font-bold text-foreground">{issued.amount.toLocaleString()}원</p>
              {issued.due && (
                <p className="text-[11px] text-muted-foreground">입금 기한: {new Date(issued.due).toLocaleString("ko-KR")}</p>
              )}
            </div>
            <p className="rounded-xl bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              {issued.credited
                ? "✅ 입금이 확인되어 예치금에 반영됐습니다."
                : "위 계좌로 입금하시면 자동으로 예치금에 반영됩니다. (입금까지 다소 시간이 걸릴 수 있어요)"}
            </p>
            <DialogFooter>
              <Button onClick={() => close(false)} className="font-bold">확인</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {/* 안내 */}
              {vbankEnabled ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Landmark className="h-4 w-4 text-primary" /> 가상계좌 충전
                  </p>
                  <p className="mt-1">충전 금액을 입력하면 <b className="text-foreground">전용 가상계좌</b>가 발급됩니다. 입금하시면 <b className="text-foreground">자동으로 예치금에 반영</b>돼요.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Landmark className="h-4 w-4 text-primary" /> 입금 계좌
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="leading-snug">
                      <p className="text-base font-extrabold text-foreground">{DEPOSIT_ACCOUNT.bank} {DEPOSIT_ACCOUNT.number}</p>
                      <p className="text-xs text-muted-foreground">예금주 {DEPOSIT_ACCOUNT.holder}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 rounded-full bg-card"
                      onClick={() => copyAccount(`${DEPOSIT_ACCOUNT.bank} ${DEPOSIT_ACCOUNT.number}`)}>
                      <Copy className="h-3.5 w-3.5" /> 복사
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    위 계좌로 입금하신 뒤 아래 정보를 입력해 요청해 주세요. 운영팀이 입금을 확인하면 예치금에 반영됩니다.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="chargeAmount">충전 금액 (원) *</Label>
                <Input id="chargeAmount" inputMode="numeric" placeholder="예: 100000" value={amount}
                  onChange={e => setAmount(e.target.value)} className="h-11" />
                {amountNum > 0 && (
                  <p className="text-xs font-semibold text-primary">{amountNum.toLocaleString()}원 충전</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="depositorName">입금자명 *</Label>
                <Input id="depositorName" placeholder="통장에 찍히는 입금자명" value={depositorName} maxLength={20}
                  onChange={e => setDepositorName(e.target.value)} className="h-11" />
              </div>

              {/* 세금계산서 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-primary" /> 세금계산서
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {([["issue", "발급"], ["none", "미발급"]] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setTaxInvoice(v)}
                      className={`rounded-2xl border-2 py-2.5 text-sm font-bold transition-all ${
                        taxInvoice === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>

                {taxInvoice === "issue" && (
                  <div className="space-y-2 rounded-2xl border border-border/70 bg-secondary/30 p-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="bizNumber" className="text-xs text-muted-foreground">사업자 번호 *</Label>
                      <Input id="bizNumber" placeholder="000-00-00000" value={bizNumber} maxLength={20}
                        onChange={e => setBizNumber(e.target.value)} className="h-10 bg-card" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="repName" className="text-xs text-muted-foreground">대표자명 *</Label>
                        <Input id="repName" placeholder="홍길동" value={repName} maxLength={40}
                          onChange={e => setRepName(e.target.value)} className="h-10 bg-card" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="companyName" className="text-xs text-muted-foreground">상호 *</Label>
                        <Input id="companyName" placeholder="(주)아르벤" value={companyName} maxLength={100}
                          onChange={e => setCompanyName(e.target.value)} className="h-10 bg-card" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="taxEmail" className="text-xs text-muted-foreground">이메일 *</Label>
                      <Input id="taxEmail" type="email" inputMode="email" placeholder="tax@company.com" value={taxEmail} maxLength={120}
                        onChange={e => setTaxEmail(e.target.value)} className="h-10 bg-card" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      입력하신 정보로 세금계산서가 발행됩니다.
                      {lastTax && " (이전에 입력한 정보를 자동으로 불러왔어요 — 수정 가능)"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>취소</Button>
              <Button onClick={vbankEnabled ? submitVbank : submitManual} disabled={busy} className="gap-1.5 font-bold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : vbankEnabled ? <Check className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                {vbankEnabled ? "가상계좌 발급받기" : "충전요청 보내기"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
