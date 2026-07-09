import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageOff, XCircle } from "lucide-react";
import { useState } from "react";

/** 인증샷 등록 시각 → "7/9 오후 2:32" 형식 (KST 고정). */
function formatProofTime(time: Date | string | null | undefined): string | null {
  if (!time) return null;
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

export function ProofThumb({
  url,
  label,
  time,
  onReject,
}: {
  url: string | null | undefined;
  label: string;
  /** 이 인증샷이 등록된 시각 — 있으면 썸네일·확대 보기에 표시. */
  time?: Date | string | null;
  onReject?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const timeText = formatProofTime(time);

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/40 py-4 text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        <span className="text-[11px]">{label} 미등록</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative overflow-hidden rounded-xl border border-border/70"
      >
        <img src={url} alt={label} className="h-24 w-full object-cover transition group-hover:scale-105" />
        <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center text-[11px] font-medium leading-tight text-white">
          {label}
          {timeText && <span className="block text-[10px] font-normal text-white/80">{timeText} 등록</span>}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            {timeText && (
              <p className="text-sm text-muted-foreground">등록 시각 · {timeText}</p>
            )}
          </DialogHeader>
          <img src={url} alt={label} className="max-h-[70vh] w-full rounded-xl object-contain" />
          {onReject && (
            <Button
              variant="outline"
              className="w-full gap-1.5 bg-card font-semibold text-destructive hover:text-destructive"
              onClick={() => { setOpen(false); onReject(); }}
            >
              <XCircle className="h-4 w-4" /> 이 인증샷 반려하기 (재등록 요청)
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
