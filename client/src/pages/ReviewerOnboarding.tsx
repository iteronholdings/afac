import { useAuth } from "@/_core/hooks/useAuth";
import BrandLogo from "@/components/BrandLogo";
import ReviewerGuide from "@/components/ReviewerGuide";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

/**
 * 리뷰어 첫 진입 시 절차 안내를 읽고 동의하는 화면.
 * 동의하기 전에는 캠페인 참여 등 리뷰어 활동을 할 수 없다(서버에서도 차단).
 */
export default function ReviewerOnboarding() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [agreed, setAgreed] = useState(false);

  // 업체/관리자이거나 이미 동의한 리뷰어는 이 화면이 필요 없음.
  useEffect(() => {
    if (!user) return;
    if (user.role === "business") navigate("/client/dashboard");
    else if (user.role === "admin") navigate("/admin");
    else if (user.reviewerAgreedAt) navigate("/home");
  }, [user, navigate]);

  const agreeMutation = trpc.auth.agreeReviewerTerms.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("동의가 완료되었어요. 이제 캠페인에 참여할 수 있어요! 🐻");
      navigate("/home");
    },
    onError: err => toast.error(err.message),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <div className="container max-w-2xl py-10 pb-32">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo size={44} textClassName="text-xl" />
          <h1 className="mt-5 text-2xl font-extrabold text-foreground">리뷰어 활동 안내</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {user?.fullName || user?.name}님, 시작하기 전에 아래 진행 절차를 꼭 확인해 주세요.
          </p>
        </div>

        <div className="rounded-3xl border border-border/70 bg-card/60 p-5 shadow-sm sm:p-6">
          <ReviewerGuide />
        </div>

        {/* 동의 영역 */}
        <div className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={agreed}
              onCheckedChange={v => setAgreed(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed text-foreground">
              위 <b>리뷰어 활동 절차와 유의사항</b>을 모두 읽고 이해했으며, 이에 따라 성실히 활동할 것에 동의합니다.
            </span>
          </label>

          <Button
            className="mt-5 h-12 w-full rounded-2xl text-base font-bold"
            disabled={!agreed || agreeMutation.isPending}
            onClick={() => agreeMutation.mutate()}
          >
            {agreeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            동의하고 시작하기
          </Button>
        </div>
      </div>
    </div>
  );
}
