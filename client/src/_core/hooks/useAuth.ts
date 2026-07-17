import { clearAutoLogin } from "@/lib/autoLogin";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export function useAuth() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: user, isLoading: loading } = trpc.auth.me.useQuery();

  const logoutMutation = trpc.auth.logout.useMutation();

  return {
    user: user ?? null,
    loading,
    isLoading: loading,
    isAuthenticated: !!user,
    /** Log out, then redirect to `redirectTo` (defaults to "/"). */
    logout: async (redirectTo: string = "/") => {
      clearAutoLogin(); // 명시적 로그아웃 → 자동 로그인 해제 (재로그인 루프 방지)
      await logoutMutation.mutateAsync();
      await utils.auth.me.invalidate();
      navigate(redirectTo);
    },
  };
}
