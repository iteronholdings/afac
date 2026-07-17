import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearAutoLogin,
  clearLoginId,
  hasAutoLogin,
  loadAutoLogin,
  loadLoginId,
  saveAutoLogin,
  saveLoginId,
} from "@/lib/autoLogin";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Loader2, Lock, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [loginId, setLoginId] = useState(() => loadLoginId());
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(() => !!loadLoginId());
  const [autoLogin, setAutoLogin] = useState(() => hasAutoLogin("reviewer"));
  // 자동 로그인 시도 중 여부 (실패 시 저장 해제하고 수동 입력으로 전환)
  const [autoTrying, setAutoTrying] = useState(() => hasAutoLogin("reviewer"));
  const autoAttempted = useRef(false);

  const logoutMutation = trpc.auth.logout.useMutation();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (_d, vars) => {
      const me = await utils.auth.me.fetch();
      // 리뷰어 전용 포털 — 업체 계정은 거부하고 업체 포털로 안내.
      if (me?.role === "business") {
        await logoutMutation.mutateAsync();
        await utils.auth.me.invalidate();
        clearAutoLogin();
        setAutoTrying(false);
        toast.error("업체 계정입니다. 업체 포털(/client/login)에서 로그인해 주세요.");
        return;
      }
      // 저장 옵션 반영 (자동 로그인 성공 시에는 기존 저장 유지)
      if (rememberId) saveLoginId(vars.loginId); else clearLoginId();
      if (autoLogin) saveAutoLogin("reviewer", vars.loginId, vars.password);
      else clearAutoLogin();
      toast.success("로그인되었습니다.");
      navigate(me?.role === "admin" ? "/admin" : "/home");
    },
    onError: (error: unknown) => {
      // 자동 로그인 실패(비밀번호 변경 등) → 저장 해제하고 수동 입력으로.
      if (autoAttempted.current && autoTrying) {
        clearAutoLogin();
        setAutoTrying(false);
        setAutoLogin(false);
        toast.error("자동 로그인에 실패했어요. 다시 로그인해 주세요.");
        return;
      }
      const message =
        error instanceof TRPCClientError
          ? error.message
          : "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      toast.error(message);
    },
  });

  // 이미 로그인된 상태로 로그인 페이지에 오면 바로 포털 홈으로.
  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery();
  useEffect(() => {
    if (meLoading) return;
    if (me) {
      if (me.role === "business") return; // 업체는 이 포털 대상 아님 — 폼 유지
      navigate(me.role === "admin" ? "/admin" : "/home");
      return;
    }
    // 미로그인 + 자동 로그인 저장돼 있으면 1회 자동 시도.
    if (!autoAttempted.current) {
      const saved = loadAutoLogin("reviewer");
      if (saved) {
        autoAttempted.current = true;
        setLoginId(saved.loginId);
        loginMutation.mutate(saved);
      } else {
        setAutoTrying(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoading, me]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      toast.error("아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    loginMutation.mutate({ loginId: loginId.trim(), password });
  };

  // 자동 로그인 진행 중 화면
  if (autoTrying && (meLoading || loginMutation.isPending || !!me)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gradient-to-b from-secondary/40 to-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">자동 로그인 중이에요…</p>
      </div>
    );
  }

  return (
    <AuthLayout
      title="다시 오신 것을 환영합니다"
      subtitle="아르벤팩토리에 로그인하고 활동을 이어가세요."
      footer={
        <>
          아직 회원이 아니신가요?{" "}
          <Link href="/afreviewer/signup" className="font-semibold text-primary hover:underline">
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

        {/* 아이디 저장 · 자동 로그인 */}
        <div className="flex items-center gap-5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={rememberId} onCheckedChange={v => setRememberId(v === true)} />
            아이디 저장
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={autoLogin} onCheckedChange={v => setAutoLogin(v === true)} />
            자동 로그인
          </label>
        </div>

        <Button
          type="submit"
          className="h-11 w-full text-base font-semibold"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          로그인
        </Button>
      </form>
    </AuthLayout>
  );
}
