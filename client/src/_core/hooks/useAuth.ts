import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export function useAuth() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: user, isLoading: loading } = trpc.auth.me.useQuery();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/");
    },
  });

  return {
    user: user ?? null,
    loading,
    isLoading: loading,
    isAuthenticated: !!user,
    logout: () => logoutMutation.mutate(),
  };
}
