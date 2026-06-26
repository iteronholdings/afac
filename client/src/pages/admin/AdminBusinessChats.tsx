import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Building2, Loader2, MessagesSquare, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Pair = { businessId: number; reviewerId: number } | null;

export default function AdminBusinessChats() {
  const { data: convs = [], isLoading } = trpc.businessMessage.adminConversations.useQuery(undefined, {
    refetchInterval: 7000,
  });
  const [active, setActive] = useState<Pair>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConv = convs.find(c => active && c.businessId === active.businessId && c.reviewerId === active.reviewerId);
  const { data: msgs = [] } = trpc.businessMessage.adminThread.useQuery(
    { businessId: active?.businessId ?? 0, reviewerId: active?.reviewerId ?? 0 },
    { enabled: !!active, refetchInterval: 4000 },
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, active]);

  return (
    <AdminLayout title="업체–리뷰어 대화" description="업체와 리뷰어가 주고받은 대화를 열람합니다. (읽기 전용)">
      <div className="grid h-[72vh] grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* 대화쌍 목록 */}
        <div className={`flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card ${active ? "hidden lg:flex" : "flex"}`}>
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 font-bold text-foreground">
            <MessagesSquare className="h-4 w-4 text-primary" /> 대화 목록
            {convs.length > 0 && <span className="text-sm font-normal text-muted-foreground">{convs.length}</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : convs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                <MessagesSquare className="h-8 w-8 opacity-30" /> 아직 업체–리뷰어 대화가 없습니다.
              </div>
            ) : (
              convs.map(c => {
                const on = active?.businessId === c.businessId && active?.reviewerId === c.reviewerId;
                return (
                  <button
                    key={`${c.businessId}:${c.reviewerId}`}
                    onClick={() => setActive({ businessId: c.businessId, reviewerId: c.reviewerId })}
                    className={`flex w-full flex-col gap-1 border-b border-border/40 px-4 py-3 text-left transition-colors ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Building2 className="h-3.5 w-3.5 text-primary" /> {c.businessName}
                      <span className="text-muted-foreground">↔</span>
                      <UserRound className="h-3.5 w-3.5 text-secondary-foreground" /> {c.reviewerName}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{c.latestContent ?? "📷 이미지"}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 대화 스레드 (읽기 전용) */}
        <div className={`flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card ${!active ? "hidden lg:flex" : "flex"}`}>
          {!active ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <MessagesSquare className="h-10 w-10 opacity-30" /> 왼쪽에서 대화를 선택하세요.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                <button onClick={() => setActive(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted lg:hidden">←</button>
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Building2 className="h-4 w-4 text-primary" /> {activeConv?.businessName}
                  <span className="text-muted-foreground">↔</span>
                  <UserRound className="h-4 w-4 text-secondary-foreground" /> {activeConv?.reviewerName}
                </p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-4">
                {msgs.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">대화가 없습니다.</p>
                ) : (
                  msgs.map(m => {
                    const isBiz = m.senderRole === "business";
                    return (
                      <div key={m.id} className={`flex flex-col gap-0.5 ${isBiz ? "items-end" : "items-start"}`}>
                        <span className="px-1 text-[11px] text-muted-foreground">
                          {m.senderName} · {isBiz ? "업체" : "리뷰어"}
                        </span>
                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isBiz ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-card text-foreground"}`}>
                          {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                          {m.imageUrl && (
                            <img src={m.imageUrl} alt="첨부" className="mt-1 max-w-full cursor-pointer rounded-xl" onClick={() => window.open(m.imageUrl!, "_blank")} />
                          )}
                        </div>
                        <span className="px-1 text-[10px] text-muted-foreground/60">
                          {new Date(m.createdAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
              <div className="shrink-0 border-t border-border/60 px-4 py-2.5 text-center text-[11px] text-muted-foreground">
                👁️ 열람 전용 — 관리자는 이 대화에 참여하지 않습니다.
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
