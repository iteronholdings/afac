import AuthLayout from "@/components/AuthLayout";
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

const initialState: FormState = {
  loginId: "",
  password: "",
  passwordConfirm: "",
  fullName: "",
  phone: "",
};

export default function Signup() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<FormState>(initialState);

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("회원가입이 완료되었습니다. 환영합니다!");
      navigate("/");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof TRPCClientError
          ? error.message
          : "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.";
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

    signupMutation.mutate({
      loginId: form.loginId.trim(),
      password: form.password,
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
    });
  };

  return (
    <AuthLayout
      title="회원가입"
      subtitle="간단한 정보 입력으로 리뷰어 활동을 시작하세요."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary hover:underline"
          >
            로그인
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="loginId">아이디</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="loginId"
              autoComplete="username"
              placeholder="영문, 숫자 4~20자"
              value={form.loginId}
              onChange={update("loginId")}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="6자 이상 입력하세요"
              value={form.password}
              onChange={update("password")}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력하세요"
              value={form.passwordConfirm}
              onChange={update("passwordConfirm")}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">성명</Label>
          <div className="relative">
            <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="fullName"
              autoComplete="name"
              placeholder="실명을 입력하세요"
              value={form.fullName}
              onChange={update("fullName")}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">전화번호</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="예: 010-1234-5678"
              value={form.phone}
              onChange={update("phone")}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="mt-2 h-11 w-full text-base font-semibold"
          disabled={signupMutation.isPending}
        >
          {signupMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          가입하고 시작하기
        </Button>
      </form>
    </AuthLayout>
  );
}
