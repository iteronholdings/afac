import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKRW, mallName } from "@/lib/workflow";
import { PARTICIPATION_DEADLINE_DAYS } from "@shared/const";
import { Camera, Copy, PartyPopper, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export type StartNowInfo = {
  title: string;
  keyword: string;
  category?: string | null;
  productPrice: number;
  /** 서버가 배정한 리뷰 유형 (photo/text/star) — 유형별 안내 한 줄에 사용. */
  reviewType?: string | null;
};

/** 참여 완료 직후 리뷰어를 바로 검색→구매 절차로 안내하는 다이얼로그. */
export default function StartNowDialog({ info, onClose }: {
  info: StartNowInfo | null;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  if (!info) return null;

  const mall = mallName(info.category);
  const copyKeyword = async () => {
    try {
      await navigator.clipboard.writeText(info.keyword);
      toast.success("키워드를 복사했어요. 이제 검색하러 가세요!");
    } catch {
      toast.info(info.keyword);
    }
  };

  const typeLine =
    info.reviewType === "photo" ? "사진 리뷰 배정 — 배정된 사진 묶음과 리뷰 원고를 내 활동에서 받아 사용하세요."
    : info.reviewType === "text" ? "글자 리뷰 배정 — 리뷰 원고를 내 활동에서 복사해 사용하세요."
    : info.reviewType === "star" ? "별점 리뷰 배정 — 구매 후 별점만 남기면 됩니다."
    : null;

  const Step = ({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-secondary/30 p-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
      <div className="min-w-0 flex-1 text-sm">
        <span className="mr-1 inline-flex align-middle text-primary">{icon}</span>
        {children}
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" /> 참여 완료! 지금 바로 진행하세요
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5">
          <Step n={1} icon={<Search className="h-4 w-4" />}>
            <b className="text-foreground">{mall}</b>에서 아래 키워드로 검색하세요.
            <div className="mt-1.5 flex items-center gap-2">
              <span className="rounded-xl bg-card px-3 py-1.5 font-bold text-foreground ring-1 ring-border">{info.keyword}</span>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-full bg-card" onClick={copyKeyword}>
                <Copy className="h-3.5 w-3.5" /> 복사
              </Button>
            </div>
          </Step>

          <Step n={2} icon={<ShoppingCart className="h-4 w-4" />}>
            <b className="text-foreground">상품가 {formatKRW(info.productPrice)}</b>짜리 상품을 찾아 구매하세요.
            <p className="mt-0.5 text-xs text-muted-foreground">필수 절차: 체류 2분 → 상세페이지 스크롤 → 장바구니 담기 → 하트 → 구매</p>
          </Step>

          <Step n={3} icon={<Camera className="h-4 w-4" />}>
            검색·구매 인증샷을 <b className="text-foreground">내 활동</b>에서 등록하면 끝!
            {typeLine && <p className="mt-0.5 text-xs text-muted-foreground">{typeLine}</p>}
            <p className="mt-0.5 text-xs font-semibold text-amber-700">
              ⏰ 참여일로부터 {PARTICIPATION_DEADLINE_DAYS}일 안에 리뷰 인증샷까지 등록해 주세요.
            </p>
          </Step>
        </div>

        <DialogFooter>
          <Button className="h-11 w-full rounded-xl font-bold" onClick={() => { onClose(); navigate("/my"); }}>
            내 활동에서 진행하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
