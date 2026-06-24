import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Loader2, Rocket, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Platform = "coupang" | "naver";

type Form = {
  platform: Platform;
  productUrl: string;
  targetKeyword: string;
  currentRank: string;
  budget: string;
  memo: string;
};

const INIT: Form = {
  platform: "coupang",
  productUrl: "",
  targetKeyword: "",
  currentRank: "",
  budget: "",
  memo: "",
};

export default function ClientConsulting() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<Form>(INIT);

  const createMutation = trpc.consulting.create.useMutation({
    onSuccess: () => {
      toast.success("상위노출 컨설팅 의뢰가 접수되었어요! 담당자가 곧 연락드릴게요 🐻");
      navigate("/client/dashboard");
    },
    onError: (err: unknown) => {
      const msg = err instanceof TRPCClientError ? err.message : "의뢰 접수에 실패했습니다.";
      toast.error(msg);
    },
  });

  const set = (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productUrl.trim()) { toast.error("상품 URL을 입력해 주세요."); return; }
    if (!form.targetKeyword.trim()) { toast.error("목표 키워드를 입력해 주세요."); return; }

    const platformLabel = form.platform === "coupang" ? "쿠팡" : "네이버 스마트스토어";
    createMutation.mutate({
      platform: platformLabel,
      productUrl: form.productUrl.trim(),
      targetKeyword: form.targetKeyword.trim(),
      currentRank: form.currentRank.trim() || undefined,
      budget: form.budget.trim() || undefined,
      memo: form.memo.trim() || undefined,
    });
  };

  return (
    <ClientLayout
      title="상위노출 컨설팅 의뢰 🚀"
      description="상품을 상단에 올리는 맞춤 전략을 받아보세요."
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {/* intro banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-[0_12px_32px_-12px_var(--primary)]">
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl">🚀</span>
            <div>
              <p className="text-lg font-extrabold">키워드 상위노출, 전문가가 도와드려요</p>
              <p className="mt-0.5 text-sm text-primary-foreground/85">
                의뢰를 남기면 담당 실무자가 1:1로 검토 후 연락드립니다.
              </p>
            </div>
          </div>
        </div>

        {/* form */}
        <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
          {/* platform */}
          <div>
            <Label className="mb-2 block font-bold">플랫폼 *</Label>
            <div className="grid grid-cols-2 gap-3">
              {(["coupang", "naver"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, platform: p }))}
                  className={`rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                    form.platform === p
                      ? p === "coupang"
                        ? "border-orange-500 bg-orange-500 text-white"
                        : "border-green-500 bg-green-500 text-white"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {p === "coupang" ? "쿠팡" : "네이버 스마트스토어"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="productUrl" className="font-bold">상품 URL *</Label>
            <Input id="productUrl" placeholder="https://..." value={form.productUrl} onChange={set("productUrl")} className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="targetKeyword" className="font-bold">목표 키워드 *</Label>
            <Input id="targetKeyword" placeholder="예: 수분크림 추천, 남자지갑" value={form.targetKeyword} onChange={set("targetKeyword")} className="h-11" />
            <p className="text-xs text-muted-foreground">상위에 올리고 싶은 검색 키워드를 적어주세요.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="currentRank" className="font-bold">
                현재 순위 <span className="font-normal text-muted-foreground">(선택)</span>
              </Label>
              <Input id="currentRank" placeholder="예: 3페이지 / 87위" value={form.currentRank} onChange={set("currentRank")} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget" className="font-bold">
                희망 예산 <span className="font-normal text-muted-foreground">(선택)</span>
              </Label>
              <Input id="budget" placeholder="예: 월 50만원" value={form.budget} onChange={set("budget")} className="h-11" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="memo" className="font-bold">
              추가 요청사항 <span className="font-normal text-muted-foreground">(선택)</span>
            </Label>
            <Textarea
              id="memo"
              placeholder="목표 기간, 경쟁사, 특이사항 등 자유롭게 적어주세요."
              rows={4}
              value={form.memo}
              onChange={set("memo")}
              className="resize-none"
            />
          </div>

          <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3 text-xs font-medium text-primary">
            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
            의뢰가 접수되면 운영팀이 순서대로 검토 후 1:1로 연락드려요.
          </div>

          <Button type="submit" disabled={createMutation.isPending} className="h-11 w-full gap-1.5 rounded-full text-base font-bold">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            컨설팅 의뢰하기
          </Button>
        </form>
      </div>
    </ClientLayout>
  );
}
