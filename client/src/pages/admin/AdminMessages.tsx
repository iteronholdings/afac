import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Building2, Loader2, MessageCircle, Send, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function roleLabel(role?: string) {
  return role === "business" ? "업체" : role === "admin" ? "운영팀" : "리뷰어";
}

export default function AdminMessages() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: convs = [], isLoading } = trpc.directMessage.conversations.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConv = convs.find(c => c.reviewerId === activeId);
  const { data: msgs = [] } = trpc.directMessage.list.useQuery(
    { reviewerId: activeId ?? undefined },
    { enabled: activeId != null, refetchInterval: 3000 },
  );

  const markRead = trpc.directMessage.markRead.useMutation({
    onSuccess: () => {
      utils.directMessage.conversations.invalidate();
      utils.directMessage.unreadCount.invalidate();
    },
  });
  const send = trpc.directMessage.send.useMutation({
    onSuccess: () => {
      setText("");
      utils.directMessage.list.invalidate();
      utils.directMessage.conversations.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (activeId != null) markRead.mutate({ reviewerId: activeId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, msgs.length]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, activeId]);

  const submit = () => {
    if (activeId == null || !text.trim()) return;
    send.mutate({ reviewerId: activeId, content: text.trim() });
  };

  return (
    <AdminLayout title="1:1 문의" description="회원(업체·리뷰어)의 문의를 확인하고 답변하세요.">
      <div className="grid h-[72vh] grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* 대화 목록 */}
        <div className={`flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card ${activeId != null ? "hidden lg:flex" : "flex"}`}>
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 font-bold text-foreground">
            <MessageCircle className="h-4 w-4 text-primary" /> 문의 목록
            {convs.length > 0 && <span className="text-sm font-normal text-muted-foreground">{convs.length}</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : convs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                <MessageCircle className="h-8 w-8 opacity-30" /> 아직 문의가 없습니다.
              </div>
            ) : (
              convs.map(c => {
                const active = c.reviewerId === activeId;
                const isBiz = c.reviewerRole === "business";
                return (
                  <button
                    key={c.reviewerId}
                    onClick={() => setActiveId(c.reviewerId)}
                    className={`flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors ${active ? "bg-primary/10" : "hover:bg-muted/40"}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isBiz ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                      {c.reviewerName.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-foreground">{c.reviewerName}</span>
                          <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${isBiz ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                            {roleLabel(c.reviewerRole)}
                          </span>
                        </div>
                        {c.unread > 0 && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                            {c.unread > 9 ? "9+" : c.unread}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{c.latestContent ?? "📷 이미지"}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 대화 스레드 */}
        <div className={`flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card ${activeId == null ? "hidden lg:flex" : "flex"}`}>
          {activeId == null ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-30" /> 왼쪽에서 문의를 선택하세요.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                <button onClick={() => setActiveId(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted lg:hidden">←</button>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {activeConv?.reviewerName.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    {activeConv?.reviewerName}
                    <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] font-bold text-secondary-foreground">{roleLabel(activeConv?.reviewerRole)}</span>
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {activeConv?.reviewerRole === "business" ? <Building2 className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                    {activeConv?.reviewerLoginId}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-4">
                {msgs.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">대화가 없습니다.</p>
                ) : (
                  msgs.map(m => {
                    const mine = m.fromUserId === user?.id;
                    return (
                      <div key={m.id} className={`flex flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}>
                        <span className="px-1 text-[11px] text-muted-foreground">{mine ? "운영팀" : m.senderName}</span>
                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-card text-foreground"}`}>
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

              <div className="shrink-0 border-t border-border/60 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                    placeholder="답변 입력..."
                    rows={1}
                    className="max-h-32 flex-1 resize-none rounded-xl border border-border/70 bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button onClick={submit} disabled={!text.trim() || send.isPending} className="gap-1.5 rounded-xl font-bold">
                    {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 전송
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
