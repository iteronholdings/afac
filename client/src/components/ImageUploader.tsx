import { trpc } from "@/lib/trpc";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Purpose = "purchase" | "review" | "thumbnail";

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"] as const;
type AllowedMime = (typeof ALLOWED)[number];

export function ImageUploader({
  value,
  onChange,
  purpose,
  label,
  aspect = "video",
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  purpose: Purpose;
  label?: string;
  aspect?: "video" | "square";
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.upload.image.useMutation();

  const handleFile = async (file: File) => {
    if (!ALLOWED.includes(file.type as AllowedMime)) {
      toast.error("PNG, JPG, WEBP, GIF 이미지만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast.error("이미지 용량은 6MB 이하여야 합니다.");
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await uploadMutation.mutateAsync({
        dataUrl,
        mimeType: file.type as AllowedMime,
        purpose,
      });
      onChange(res.url);
      toast.success("이미지가 업로드되었습니다.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "업로드에 실패했습니다.";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const aspectClass = aspect === "square" ? "aspect-square" : "aspect-video";

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {value ? (
        <div className="group relative overflow-hidden rounded-2xl border border-border/70">
          <img src={value} alt="업로드된 이미지" className={`w-full object-cover ${aspectClass}`} />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
            aria-label="이미지 삭제"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-primary/50 hover:bg-muted/70 ${aspectClass}`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">업로드 중...</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm">이미지 선택 (최대 6MB)</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
