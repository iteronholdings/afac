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
      await logoutMutation.mutateAsync();
      await utils.auth.me.invalidate();
      navigate(redirectTo);
    },
  };
}
