import { ImageUploader } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type CampaignFormValue = {
  id?: number;
  title: string;
  category: string;
  keyword: string;
  thumbnailUrl: string | null;
  productUrl: string;
  description: string;
  productPrice: number;
  commission: number;
  slots: number;
};

const EMPTY: CampaignFormValue = {
  title: "",
  category: "",
  keyword: "",
  thumbnailUrl: null,
  productUrl: "",
  description: "",
  productPrice: 0,
  commission: 0,
  slots: 1,
};

export function CampaignFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<CampaignFormValue> | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CampaignFormValue>(EMPTY);
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, ...initial, thumbnailUrl: initial?.thumbnailUrl ?? null });
    }
  }, [open, initial]);

  const createMutation = trpc.campaign.create.useMutation();
  const updateMutation = trpc.campaign.update.useMutation();
  const saving = createMutation.isPending || updateMutation.isPending;

  const setField = <K extends keyof CampaignFormValue>(k: K, v: CampaignFormValue[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error("제목을 입력해 주세요.");
    if (!form.keyword.trim()) return toast.error("검색 키워드를 입력해 주세요.");

    const payload = {
      title: form.title.trim(),
      category: form.category.trim() || undefined,
      keyword: form.keyword.trim(),
      thumbnailUrl: form.thumbnailUrl || undefined,
      productUrl: form.productUrl.trim() || undefined,
      description: form.description.trim() || undefined,
      productPrice: Number(form.productPrice) || 0,
      commission: Number(form.commission) || 0,
      slots: Number(form.slots) || 1,
    };

    try {
      if (isEdit && initial?.id) {
        await updateMutation.mutateAsync({ id: initial.id, ...payload });
        toast.success("캠페인이 수정되었습니다.");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("캠페인이 등록되었습니다.");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "캠페인 수정" : "새 캠페인 등록"}</DialogTitle>
          <DialogDescription>
            리뷰어에게 노출될 캠페인 정보를 입력하세요. 검색 키워드는 리뷰어가 상품을 찾을 때 사용합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>썸네일 이미지</Label>
            <ImageUploader
              value={form.thumbnailUrl}
              onChange={url => setField("thumbnailUrl", url)}
              purpose="thumbnail"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">제목 *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={e => setField("title", e.target.value)}
              placeholder="예: 유기농 수제 비누 체험단"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category">카테고리</Label>
              <Input
                id="category"
                value={form.category}
                onChange={e => setField("category", e.target.value)}
                placeholder="뷰티 / 리빙 / 푸드"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slots">모집 인원 *</Label>
              <Input
                id="slots"
                type="number"
                min={1}
                value={form.slots}
                onChange={e => setField("slots", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="keyword">검색 키워드 *</Label>
            <Input
              id="keyword"
              value={form.keyword}
              onChange={e => setField("keyword", e.target.value)}
              placeholder="예: 유기농 천연비누"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="productPrice">상품가 (원) *</Label>
              <Input
                id="productPrice"
                type="number"
                min={0}
                value={form.productPrice}
                onChange={e => setField("productPrice", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commission">수수료 (원) *</Label>
              <Input
                id="commission"
                type="number"
                min={0}
                value={form.commission}
                onChange={e => setField("commission", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="productUrl">상품 링크 (선택)</Label>
            <Input
              id="productUrl"
              value={form.productUrl}
              onChange={e => setField("productUrl", e.target.value)}
              placeholder="https://"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">상세 안내 (선택)</Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={e => setField("description", e.target.value)}
              placeholder="리뷰 작성 가이드, 미션 안내 등을 적어주세요."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="bg-card" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "수정 저장" : "등록하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
