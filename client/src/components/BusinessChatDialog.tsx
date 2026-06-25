import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Shared 1:1 chat dialog between a business and a reviewer (role auto-resolved server-side). */
export default function BusinessChatDialog({
  open,
  onOpenChange,
  partnerId,
  partnerName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  partnerId: number | null;
  partnerName: string;
}) {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: msgs = [], isLoading } = trpc.businessMessage.list.useQuery(
    { partnerId: partnerId ?? -1 },
    { enabled: open && partnerId != null, refetchInterval: 5000 }
  );

  const markRead = trpc.businessMessage.markRead.useMutation({
    onSuccess: () => {
      utils.businessMessage.unreadCount.invalidate();
      utils.businessMessage.conversations.invalidate();
    },
  });

  const send = trpc.businessMessage.send.useMutation({
    onSuccess: () => {
      setText("");
      utils.businessMessage.list.invalidate({ partnerId: partnerId ?? -1 });
      utils.businessMessage.conversations.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  // mark read when opened / new messages arrive
  useEffect(() => {
    if (open && partnerId != null) markRead.mutate({ partnerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partnerId, msgs.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, open]);

  const submit = () => {
    if (!text.trim() || partnerId == null) return;
    send.mutate({ partnerId, content: text.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[70vh] max-h-[600px] flex-col sm:max-w-md p-0 gap-0">
        <DialogHeader className="border-b border-border/60 px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {partnerName.charAt(0)}
            </span>
            {partnerName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-2.5 overflow-y-auto bg-secondary/20 px-4 py-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : msgs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">아직 대화가 없어요. 먼저 인사를 건네보세요 🐻</p>
          ) : (
            msgs.map(m => (
              <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground border border-border/60"
                }`}>
                  {m.content}
                  <div className={`mt-0.5 text-[10px] ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {m.createdAt ? new Date(m.createdAt).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }) : ""}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 p-3">
          <Input
            placeholder="메시지를 입력하세요"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && submit()}
            className="h-10"
          />
          <Button size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled={send.isPending || !text.trim()} onClick={submit}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
