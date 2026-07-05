import { useAuth } from "@/_core/hooks/useAuth";
import KakaoInquiryButton from "@/components/KakaoInquiryButton";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Building2, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function Bubble({ mine, name, content, imageUrl, at }: { mine: boolean; name: string; content?: string | null; imageUrl?: string | null; at: string | Date }) {
  return (
    <div className={`flex flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}>
      <span className="px-1 text-[11px] text-muted-foreground">{name}</span>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-card text-foreground"}`}>
        {content && <p className="whitespace-pre-wrap break-words">{content}</p>}
        {imageUrl && <img src={imageUrl} alt="첨부" className="mt-1 max-w-full cursor-pointer rounded-xl" onClick={() => window.open(imageUrl, "_blank")} />}
      </div>
      <span className="px-1 text-[10px] text-muted-foreground/60">{new Date(at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</span>
    </div>
  );
}

/** 업체 문의: 리뷰어 ↔ 업체 (대화 목록 + 스레드) */
function BizTab() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: convs = [], isLoading } = trpc.businessMessage.conversations.useQuery(undefined, { refetchInterval: 6000 });
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: msgs = [] } = trpc.businessMessage.list.useQuery({ partnerId: partnerId ?? 0 }, { enabled: partnerId != null, refetchInterval: 4000 });
  const markRead = trpc.businessMessage.markRead.useMutation({ onSuccess: () => { utils.businessMessage.conversations.invalidate(); utils.businessMessage.unreadCount.invalidate(); } });
  const send = trpc.businessMessage.send.useMutation({ onSuccess: () => { setText(""); utils.businessMessage.list.invalidate(); utils.businessMessage.conversations.invalidate(); }, onError: e => toast.error(e.message) });
  useEffect(() => { if (partnerId != null) markRead.mutate({ partnerId }); /* eslint-disable-next-line */ }, [partnerId, msgs.length]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, partnerId]);
  const submit = () => { if (partnerId == null || !text.trim()) return; send.mutate({ partnerId, content: text.trim() }); };
  const active = convs.find(c => c.partnerId === partnerId);
  return (
    <div className="grid h-[64vh] grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <div className={`flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card ${partnerId != null ? "hidden lg:flex" : "flex"}`}>
        <div className="border-b border-border/60 px-4 py-3 font-bold text-foreground">업체 {convs.length > 0 && <span className="text-sm font-normal text-muted-foreground">{convs.length}</span>}</div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            : convs.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground"><Building2 className="h-8 w-8 opacity-30" /> 아직 업체 대화가 없어요.</div>
            : convs.map(c => (
              <button key={c.partnerId} onClick={() => setPartnerId(c.partnerId)} className={`flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors ${c.partnerId === partnerId ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">{c.partnerName.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-semibold text-foreground">{c.partnerName}</span>
                    {c.unread > 0 && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{c.unread > 9 ? "9+" : c.unread}</span>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{c.latestContent ?? "📷 이미지"}</p>
                </div>
              </button>
            ))}
        </div>
      </div>
      <div className={`flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card ${partnerId == null ? "hidden lg:flex" : "flex"}`}>
        {partnerId == null ? <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Building2 className="h-10 w-10 opacity-30" /> 왼쪽에서 업체를 선택하세요.</div>
          : <>
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <button onClick={() => setPartnerId(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted lg:hidden">←</button>
              <span className="font-semibold text-foreground">{active?.partnerName ?? "업체"}</span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-4">
              {msgs.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">대화가 없습니다.</p>
                : msgs.map(m => <Bubble key={m.id} mine={m.fromUserId === user?.id} name={m.fromUserId === user?.id ? "나" : m.senderName} content={m.content} imageUrl={m.imageUrl} at={m.createdAt} />)}
              <div ref={bottomRef} />
            </div>
            <div className="shrink-0 border-t border-border/60 p-3">
              <div className="flex items-end gap-2">
                <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder="메시지 입력..." rows={1} className="max-h-32 flex-1 resize-none rounded-xl border border-border/70 bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                <Button onClick={submit} disabled={!text.trim() || send.isPending} className="gap-1.5 rounded-xl font-bold">{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 전송</Button>
              </div>
            </div>
          </>}
      </div>
    </div>
  );
}

export default function ReviewerMessages() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <SiteHeader />
      <main className="container max-w-5xl py-8 pb-28">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mb-1 text-2xl font-bold text-foreground">메시지</h1>
            <p className="text-sm text-muted-foreground">업체와의 대화를 확인하고 답장하세요.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">운영팀(관리자) 문의는 카카오 채널로!</span>
            <KakaoInquiryButton size="sm" />
          </div>
        </div>
        <BizTab />
      </main>
    </div>
  );
}
