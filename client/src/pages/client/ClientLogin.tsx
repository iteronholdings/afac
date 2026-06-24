import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function ClientLogin() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  const logoutMutation = trpc.auth.logout.useMutation();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      const me = await utils.auth.me.fetch();
      // 업체 전용 포털 — 리뷰어 계정은 거부하고 리뷰어 포털로 안내.
      if (me?.role === "user") {
        await logoutMutation.mutateAsync();
        await utils.auth.me.invalidate();
        toast.error("리뷰어 계정입니다. 리뷰어 포털(/afreviewer/login)에서 로그인해 주세요.");
        return;
      }
      toast.success("로그인되었습니다.");
      if (me?.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/client/dashboard");
      }
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-primary">업체 포털</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            캠페인 요청 및 진행 현황을 확인하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            autoComplete="username"
            placeholder="아이디"
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
            className="h-11"
          />
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="h-11"
          />

          <Button
            type="submit"
            className="h-11 w-full text-base font-semibold"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            로그인
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          아직 계정이 없으신가요?{" "}
          <Link href="/client/signup" className="font-semibold text-primary hover:underline">
            업체 회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
