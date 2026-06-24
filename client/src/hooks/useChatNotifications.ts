import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo } from "react";

const LS_KEY = (participationId: number) => `chat_read_${participationId}`;

export function markChatRead(participationId: number) {
  localStorage.setItem(LS_KEY(participationId), new Date().toISOString());
}

export function useChatNotifications(participationIds: number[]) {
  const { isAuthenticated } = useAuth();

  // stable key — only recompute when participationIds list changes
  const idsKey = participationIds.join(",");

  const checks = useMemo(
    () =>
      participationIds.map(id => ({
        participationId: id,
        since: localStorage.getItem(LS_KEY(id)) ?? new Date(0).toISOString(),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey]
  );

  const { data } = trpc.message.unreadCounts.useQuery(
    { checks },
    {
      enabled: isAuthenticated && participationIds.length > 0,
      refetchInterval: 5000,
    }
  );

  return useMemo(() => {
    const unread = new Set<number>();
    data?.forEach(({ participationId, count }) => {
      if (count > 0) unread.add(participationId);
    });
    return unread;
  }, [data]);
}
