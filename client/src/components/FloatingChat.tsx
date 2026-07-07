import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ImagePlus,
  Loader2,
  MessageCircle,
  Send,
  X,
  ChevronLeft,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

export default function FloatingChat() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  // admin: which reviewer's conversation is open (null = list view)
  const [activeReviewerId, setActiveReviewerId] = useState<number | null>(null);
  const [activeReviewerName, setActiveReviewerName] = useState<string | null>(null);

  // Listen for external "open this reviewer's chat" events (e.g. from AdminMembers / AdminParticipations)
  useEffect(() => {
    const handler = (e: Event) => {
      const { reviewerId, reviewerName } = (e as CustomEvent<{ reviewerId: number; reviewerName?: string }>).detail;
      setOpen(true);
      setActiveReviewerId(reviewerId);
      setActiveReviewerName(reviewerName ?? null);
    };
    window.addEventListener("open-dm", handler);
    return () => window.removeEventListener("open-dm", handler);
  }, []);

  if (!isAuthenticated || !user) return null;
  // 업체 계정은 카카오 채널·업체 메시지를 사용 — 운영팀 채팅 FAB은 리뷰어·관리자 전용.
  if (user.role === "business") return null;

  const isAdmin = user.role === "admin";

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <ChatPanel
          isAdmin={isAdmin}
          userId={user.id}
          activeReviewerId={activeReviewerId}
          activeReviewerName={activeReviewerName}
          setActiveReviewerId={(id) => { setActiveReviewerId(id); if (!id) setActiveReviewerName(null); }}
          onClose={() => setOpen(false)}
        />
      )}
      <FloatingButton isAdmin={isAdmin} open={open} onToggle={() => setOpen(v => !v)} />
    </div>
  );
}

function FloatingButton({
  isAdmin,
  open,
  onToggle,
}: {
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { data: unread = 0 } = trpc.directMessage.unreadCount.useQuery(undefined, {
    refetchInterval: 5000,
  });

  return (
    <button
      onClick={onToggle}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 hover:shadow-xl"
    >
      {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      {!open && unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

function ChatPanel({
  isAdmin,
  userId,
  activeReviewerId,
  activeReviewerName,
  setActiveReviewerId,
  onClose,
}: {
  isAdmin: boolean;
  userId: number;
  activeReviewerId: number | null;
  activeReviewerName: string | null;
  setActiveReviewerId: (id: number | null) => void;
  onClose: () => void;
}) {
  if (isAdmin && activeReviewerId === null) {
    return (
      <ConversationList
        onSelect={setActiveReviewerId}
        onClose={onClose}
      />
    );
  }

  const reviewerId = isAdmin ? activeReviewerId! : userId;

  return (
    <ChatWindow
      reviewerId={reviewerId}
      isAdmin={isAdmin}
      initialReviewerName={activeReviewerName}
      onBack={isAdmin ? () => setActiveReviewerId(null) : undefined}
      onClose={onClose}
    />
  );
}

function ConversationList({
  onSelect,
  onClose,
}: {
  onSelect: (reviewerId: number) => void;
  onClose: () => void;
}) {
  const { data: convs = [], isLoading } = trpc.directMessage.conversations.useQuery(undefined, {
    refetchInterval: 5000,
  });

  return (
    <div className="flex h-[min(480px,72vh)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3.5">
        <h3 className="font-bold text-foreground">문의 채팅</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : convs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground px-4">
            <MessageCircle className="h-8 w-8 opacity-30" />
            <p>아직 문의 내역이 없습니다.</p>
          </div>
        ) : (
          convs.map(c => (
            <button
              key={c.reviewerId}
              onClick={() => onSelect(c.reviewerId)}
              className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {c.reviewerName.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-sm font-semibold text-foreground">{c.reviewerName}</p>
                  {c.unread > 0 && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {c.unread > 9 ? "9+" : c.unread}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {c.latestContent ?? "이미지"}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ChatWindow({
  reviewerId,
  isAdmin,
  initialReviewerName,
  onBack,
  onClose,
}: {
  reviewerId: number;
  isAdmin: boolean;
  initialReviewerName?: string | null;
  onBack?: () => void;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: msgs = [] } = trpc.directMessage.list.useQuery(
    { reviewerId: isAdmin ? reviewerId : undefined },
    { refetchInterval: 3000 }
  );

  const markRead = trpc.directMessage.markRead.useMutation({
    onSuccess: () => {
      utils.directMessage.unreadCount.invalidate();
      utils.directMessage.conversations.invalidate();
    },
  });

  useEffect(() => {
    markRead.mutate({ reviewerId: isAdmin ? reviewerId : undefined });
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const sendMutation = trpc.directMessage.send.useMutation({
    onSuccess: () => {
      setText("");
      setImageUrl(null);
      utils.directMessage.list.invalidate();
      utils.directMessage.conversations.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const handleFile = async (file: File) => {
    if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
      toast.error("PNG, JPG, WEBP 이미지만 가능합니다.");
      return;
    }
    setUploading(true);
    try {
      setImageUrl(await compressImage(file));
    } catch {
      toast.error("이미지 처리에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const handleSend = () => {
    if (!text.trim() && !imageUrl) return;
    sendMutation.mutate({
      reviewerId: isAdmin ? reviewerId : undefined,
      content: text.trim() || undefined,
      imageUrl: imageUrl ?? undefined,
    });
  };

  // get reviewer name from messages, or use the name passed in externally, or fallback
  const reviewerName = msgs.find(m => m.senderRole !== "admin")?.senderName ?? initialReviewerName ?? "리뷰어";

  return (
    <div className="flex h-[min(480px,72vh)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-3.5">
        {onBack && (
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {isAdmin ? reviewerName.charAt(0) : "운"}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isAdmin ? reviewerName : "운영팀"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isAdmin ? "리뷰어 문의" : "아르벤팩토리 운영팀"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {msgs.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            아직 대화가 없습니다. 문의 사항을 남겨보세요.
          </p>
        )}
        {msgs.map(m => {
          const isMine = m.fromUserId === user?.id;
          return (
            <div key={m.id} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
              <span className="px-1 text-[11px] text-muted-foreground">
                {m.senderRole === "admin" ? `운영팀 · ${m.senderName}` : m.senderName}
              </span>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                isMine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted text-foreground"
              }`}>
                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                {m.imageUrl && (
                  <img
                    src={m.imageUrl}
                    alt="첨부"
                    className="mt-1 max-w-full cursor-pointer rounded-xl"
                    onClick={() => window.open(m.imageUrl!, "_blank")}
                  />
                )}
              </div>
              <span className="px-1 text-[10px] text-muted-foreground/60">
                {new Date(m.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {imageUrl && (
        <div className="shrink-0 border-t border-border/60 px-3 py-2">
          <div className="relative inline-block">
            <img src={imageUrl} alt="첨부" className="h-16 rounded-xl object-cover" />
            <button
              onClick={() => setImageUrl(null)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border/60 px-2 py-2">
        <div className="flex items-end gap-1.5">
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          </button>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="메시지 입력..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border/70 bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 max-h-24"
            style={{ minHeight: "32px" }}
          />
          <button
            onClick={handleSend}
            disabled={(!text.trim() && !imageUrl) || sendMutation.isPending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
