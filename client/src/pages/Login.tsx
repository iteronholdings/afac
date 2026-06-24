import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Loader2, Lock, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("로그인되었습니다.");
      navigate("/");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof TRPCClientError
          ? error.message
          : "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      toast.error("아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    loginMutation.mutate({ loginId: loginId.trim(), password });
  };

  return (
    <AuthLayout
      title="다시 오신 것을 환영합니다"
      subtitle="아르벤팩토리에 로그인하고 활동을 이어가세요."
      footer={
        <>
          아직 회원이 아니신가요?{" "}
          <Link
            href="/signup"
            className="font-semibold text-primary hover:underline"
          >
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="loginId">아이디</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="loginId"
              autoComplete="username"
              placeholder="아이디를 입력하세요"
              value={loginId}
              onChange={e => setLoginId(e.target.value)}
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
              autoComplete="current-password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="h-11 w-full text-base font-semibold"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          로그인
        </Button>
      </form>
    </AuthLayout>
  );
}
