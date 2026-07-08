import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Zap } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 첫 캠페인 참여 전 필수 동의 팝업.
 * '신청 즉시 검색·구매 진행' 약속에 체크해야만 신청이 진행된다.
 * (참여 이력이 0건인 리뷰어에게만 표시 — 첫 참여 후엔 다시 뜨지 않음)
 */
export default function FirstJoinConsentDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    if (open) setAgreed(false); // 열릴 때마다 체크 초기화
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" /> 첫 참여 전 꼭 확인해 주세요
          </DialogTitle>
          <DialogDescription>아르벤팩토리 캠페인의 가장 중요한 규칙이에요.</DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          캠페인은 <b>신청 즉시</b> 키워드 검색과 상품 구매까지 <b>바로 진행</b>해 주셔야 해요.
          미뤄두면 캠페인 진행에 차질이 생기고 다른 리뷰어의 자리도 낭비됩니다.
          지금 바로 진행이 어렵다면 다음에 신청해 주세요.
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="text-sm leading-snug text-foreground">
            네, <b>신청하자마자 바로 검색하고 구매까지</b> 진행하겠습니다.{" "}
            <span className="font-semibold text-destructive">(필수)</span>
          </span>
        </label>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="bg-card" onClick={onCancel}>다음에 할게요</Button>
          <Button className="font-bold" disabled={!agreed} onClick={onConfirm}>
            동의하고 참여 신청
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
