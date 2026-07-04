import PrivacyConsent from "@/components/PrivacyConsent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { IdCard, Loader2, Lock, Phone, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type FormState = {
  loginId: string;
  password: string;
  passwordConfirm: string;
  fullName: string;
  phone: string;
};

export default function ClientSignup() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<FormState>({
    loginId: "", password: "", passwordConfirm: "", fullName: "", phone: "",
  });
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("회원가입이 완료되었습니다. 환영합니다!");
      navigate("/client/dashboard");
    },
    onError: (error: unknown) => {
      const message = error instanceof TRPCClientError ? error.message : "회원가입에 실패했습니다.";
      toast.error(message);
    },
  });

  const update = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.loginId || !form.password || !form.fullName || !form.phone) {
      toast.error("모든 항목을 입력해 주세요.");
      return;
    }
    if (form.password.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      toast.error("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (!privacyAgreed) {
      toast.error("개인정보처리방침에 동의해 주세요.");
      return;
    }
    signupMutation.mutate({
      loginId: form.loginId.trim(),
      password: form.password,
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      role: "business",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-primary">업체 회원가입</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            캠페인을 등록하고 리뷰어를 모집해 마케팅하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="loginId">아이디</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="loginId" autoComplete="username" placeholder="영문, 숫자 4~20자" value={form.loginId} onChange={update("loginId")} className="h-11 pl-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" type="password" autoComplete="new-password" placeholder="6자 이상" value={form.password} onChange={update("password")} className="h-11 pl-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="passwordConfirm" type="password" autoComplete="new-password" placeholder="비밀번호 재입력" value={form.passwordConfirm} onChange={update("passwordConfirm")} className="h-11 pl-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fullName">업체명 / 담당자명</Label>
            <div className="relative">
              <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="fullName" autoComplete="name" placeholder="업체명 또는 담당자 실명" value={form.fullName} onChange={update("fullName")} className="h-11 pl-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">전화번호</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="phone" type="tel" autoComplete="tel" placeholder="예: 010-1234-5678" value={form.phone} onChange={update("phone")} className="h-11 pl-9" />
            </div>
          </div>

          <PrivacyConsent checked={privacyAgreed} onChange={setPrivacyAgreed} />

          <Button type="submit" className="h-11 w-full text-base font-semibold" disabled={signupMutation.isPending || !privacyAgreed}>
            {signupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            업체로 가입하기
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link href="/client/login" className="font-semibold text-primary hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
