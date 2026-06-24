import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Building2, Check, IdCard, Loader2, Lock, Phone, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type Role = "user" | "business";

type FormState = {
  loginId: string;
  password: string;
  passwordConfirm: string;
  fullName: string;
  phone: string;
};

const ROLES: { value: Role; icon: React.ElementType; label: string; desc: string }[] = [
  {
    value: "user",
    icon: User,
    label: "리뷰어",
    desc: "캠페인에 참여해 상품을 구매하고\n리뷰를 남기면 수수료를 받아요",
  },
  {
    value: "business",
    icon: Building2,
    label: "업체",
    desc: "캠페인을 등록하고\n리뷰어를 모집해 마케팅해요",
  },
];

export default function Signup() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [role, setRole] = useState<Role | null>(null);
  const [form, setForm] = useState<FormState>({
    loginId: "", password: "", passwordConfirm: "", fullName: "", phone: "",
  });

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("회원가입이 완료되었습니다. 환영합니다!");
      navigate("/");
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
    if (!role) {
      toast.error("리뷰어 또는 업체를 먼저 선택해 주세요.");
      return;
    }
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
      role: role!,
    });
  };

  return (
    <AuthLayout
      title="회원가입"
      subtitle={role ? (role === "user" ? "리뷰어로 활동을 시작하세요." : "업체로 캠페인을 관리하세요.") : "어떤 목적으로 사용하실 건가요?"}
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            로그인
          </Link>
        </>
      }
    >
      {/* 역할 선택 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {ROLES.map(r => {
          const Icon = r.icon;
          const selected = role === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={`relative flex flex-col items-center gap-2.5 rounded-2xl border-2 px-4 py-5 text-center transition-all ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/40"
              }`}
            >
              {selected && (
                <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </span>
              )}
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className={`font-bold ${selected ? "text-primary" : "text-foreground"}`}>{r.label}</p>
                <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 가입 폼 */}
      <form onSubmit={handleSubmit} className={`space-y-4 transition-opacity ${!role ? "pointer-events-none opacity-40" : ""}`}>
        <div className="space-y-2">
          <Label htmlFor="loginId">아이디</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="loginId" autoComplete="username" placeholder="영문, 숫자 4~20자" value={form.loginId} onChange={update("loginId")} className="h-11 pl-9" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="password" type="password" autoComplete="new-password" placeholder="6자 이상" value={form.password} onChange={update("password")} className="h-11 pl-9" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="passwordConfirm" type="password" autoComplete="new-password" placeholder="비밀번호 재입력" value={form.passwordConfirm} onChange={update("passwordConfirm")} className="h-11 pl-9" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">{role === "business" ? "업체명 / 담당자명" : "성명"}</Label>
          <div className="relative">
            <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="fullName" autoComplete="name" placeholder={role === "business" ? "업체명 또는 담당자 실명" : "실명 입력"} value={form.fullName} onChange={update("fullName")} className="h-11 pl-9" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">전화번호</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="phone" type="tel" autoComplete="tel" placeholder="예: 010-1234-5678" value={form.phone} onChange={update("phone")} className="h-11 pl-9" />
          </div>
        </div>

        <Button type="submit" className="mt-2 h-11 w-full text-base font-semibold" disabled={!role || signupMutation.isPending}>
          {signupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {role ? `${role === "user" ? "리뷰어" : "업체"}로 가입하기` : "역할을 먼저 선택해 주세요"}
        </Button>
      </form>
    </AuthLayout>
  );
}
