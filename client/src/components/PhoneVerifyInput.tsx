import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * 회원가입 전화번호 입력 + SMS 인증.
 * 서버에 솔라피 키가 없으면(auth.smsConfig=false) 인증 UI 없이 일반 입력으로 동작한다.
 */
export default function PhoneVerifyInput({
  phone,
  onPhoneChange,
  verified,
  onVerifiedChange,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
  verified: boolean;
  onVerifiedChange: (v: boolean) => void;
}) {
  const { data: cfg } = trpc.auth.smsConfig.useQuery();
  const enabled = cfg?.phoneVerificationEnabled ?? false;

  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0); // 재발송 대기(초)

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const send = trpc.auth.sendPhoneCode.useMutation({
    onSuccess: () => {
      setSent(true);
      setCooldown(60);
      toast.success("인증번호를 보냈어요. 문자를 확인해 주세요.");
    },
    onError: e => toast.error(e.message),
  });
  const verify = trpc.auth.verifyPhoneCode.useMutation({
    onSuccess: () => {
      onVerifiedChange(true);
      toast.success("전화번호 인증이 완료됐어요.");
    },
    onError: e => toast.error(e.message),
  });

  const changePhone = (v: string) => {
    onPhoneChange(v);
    if (verified) onVerifiedChange(false); // 번호 바꾸면 재인증
    setSent(false);
    setCode("");
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="phone">전화번호{enabled && <span className="ml-1 text-xs font-normal text-muted-foreground">(인증 필수)</span>}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="phone" type="tel" autoComplete="tel" placeholder="예: 010-1234-5678"
            value={phone} onChange={e => changePhone(e.target.value)} disabled={verified}
            className="h-11 pl-9"
          />
        </div>
        {enabled && !verified && (
          <Button type="button" variant="outline" className="h-11 shrink-0 bg-card font-semibold"
            disabled={send.isPending || cooldown > 0 || phone.replace(/\D/g, "").length < 10}
            onClick={() => send.mutate({ phone })}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
              : cooldown > 0 ? `재발송 ${cooldown}초`
              : sent ? "재발송" : "인증번호 받기"}
          </Button>
        )}
      </div>

      {enabled && verified && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> 인증 완료
        </p>
      )}

      {enabled && !verified && sent && (
        <div className="flex gap-2">
          <Input
            inputMode="numeric" maxLength={6} placeholder="인증번호 6자리"
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (code.length === 6) verify.mutate({ phone, code }); } }}
            className="h-11 flex-1 tracking-widest"
          />
          <Button type="button" className="h-11 shrink-0 font-bold"
            disabled={verify.isPending || code.length !== 6}
            onClick={() => verify.mutate({ phone, code })}>
            {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "확인"}
          </Button>
        </div>
      )}
    </div>
  );
}
