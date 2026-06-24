import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageOff } from "lucide-react";
import { useState } from "react";

export function ProofThumb({
  url,
  label,
}: {
  url: string | null | undefined;
  label: string;
}) {
  const [open, setOpen] = useState(false);

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
        <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center text-[11px] font-medium text-white">
          {label}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <img src={url} alt={label} className="max-h-[70vh] w-full rounded-xl object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
