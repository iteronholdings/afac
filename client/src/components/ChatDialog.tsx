import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"] as const;

function compressImage(file: File, maxPx = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ChatDialog({
  open,
  onOpenChange,
  participationId,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  participationId: number;
  title: string;
}) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: msgs = [], refetch } = trpc.message.list.useQuery(
    { participationId },
    { enabled: open, refetchInterval: open ? 3000 : false }
  );

  const sendMutation = trpc.message.send.useMutation({
    onSuccess: () => {
      setText("");
      setImageUrl(null);
      refetch();
    },
    onError: err => toast.error(err.message),
  });

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, open]);

  const handleFile = async (file: File) => {
    if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
      toast.error("PNG, JPG, WEBP 이미지만 가능합니다.");
      return;
    }
    setUploading(true);
    try {
      const url = await compressImage(file);
      setImageUrl(url);
    } catch {
      toast.error("이미지 처리에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const handleSend = () => {
    if (!text.trim() && !imageUrl) return;
    sendMutation.mutate({ participationId, content: text.trim() || undefined, imageUrl: imageUrl ?? undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[680px] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">{title} — 채팅 문의</DialogTitle>
        </DialogHeader>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgs.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">
              아직 대화가 없습니다. 문의 사항을 남겨보세요.
            </p>
          )}
          {msgs.map(m => {
            const isMine = m.senderId === user?.id;
            return (
              <div key={m.id} className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
                <span className="text-[11px] text-muted-foreground px-1">
                  {m.senderRole === "admin" ? "관리자" : m.senderName}
                </span>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  isMine
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-muted text-foreground"
                }`}>
                  {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                  {m.imageUrl && (
                    <img
                      src={m.imageUrl}
                      alt="첨부 이미지"
                      className="mt-1.5 max-w-full rounded-xl cursor-pointer"
                      onClick={() => window.open(m.imageUrl!, "_blank")}
                    />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/60 px-1">
                  {new Date(m.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* 이미지 미리보기 */}
        {imageUrl && (
          <div className="shrink-0 border-t border-border/60 px-4 py-2">
            <div className="relative inline-block">
              <img src={imageUrl} alt="첨부" className="h-20 rounded-xl object-cover" />
              <button
                onClick={() => setImageUrl(null)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* 입력창 */}
        <div className="shrink-0 border-t border-border/60 px-3 py-3">
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED_MIME.join(",")}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            </button>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border/70 bg-card px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 max-h-32 overflow-y-auto"
              style={{ minHeight: "36px" }}
            />
            <Button
              size="icon"
              className="shrink-0 h-9 w-9 rounded-xl"
              disabled={(!text.trim() && !imageUrl) || sendMutation.isPending}
              onClick={handleSend}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
