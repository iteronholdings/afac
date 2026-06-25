import { Search, ShoppingCart, Camera, PenLine, BadgeCheck, Wallet } from "lucide-react";

/**
 * 리뷰어 활동 절차 안내 본문 (presentational).
 * 온보딩 동의 화면(ReviewerOnboarding)과 홈의 "절차 안내" 탭에서 공용으로 사용.
 */

const STEPS: { icon: typeof Search; title: string; desc: string }[] = [
  { icon: Search, title: "1. 캠페인 참여 신청", desc: "진행 중인 캠페인에서 원하는 상품을 골라 '참여하기'로 신청합니다. 모집 인원이 마감되기 전에 신청해 주세요." },
  { icon: ShoppingCart, title: "2. 키워드 검색 후 구매", desc: "안내된 검색 키워드로 쇼핑몰에서 상품을 직접 검색해 구매합니다. (링크 구매 캠페인은 안내된 링크로 구매)" },
  { icon: Camera, title: "3. 인증샷 등록", desc: "'내 활동'에서 검색 → 구매 → 리뷰 순서로 각 단계의 인증샷(스크린샷)을 차례로 업로드합니다." },
  { icon: PenLine, title: "4. 리뷰 작성", desc: "구매한 상품에 대해 캠페인 가이드에 맞춰 리뷰(판매자/상품/배송)를 정성껏 작성하고 인증샷을 등록합니다." },
  { icon: BadgeCheck, title: "5. 운영팀 검수·승인", desc: "등록한 인증 내역을 운영팀이 확인합니다. 누락·오류가 있으면 반려될 수 있으니 안내에 맞게 진행해 주세요." },
  { icon: Wallet, title: "6. 정산 지급", desc: "승인이 완료되면 상품비 환급 + 리뷰 수수료가 가입 시 등록한 정산 계좌로 입금됩니다." },
];

const RULES: string[] = [
  "구매·검색·리뷰 인증샷은 캡처 원본 그대로 등록해 주세요. 편집·합성 시 지급이 거절될 수 있습니다.",
  "캠페인별 안내된 키워드·진행 방식을 반드시 지켜 주세요.",
  "리뷰는 솔직하고 성의 있게 작성해 주세요. 부적절·허위 리뷰는 활동이 제한될 수 있습니다.",
  "정산은 운영팀 승인 후 진행되며, 인증 누락 시 지연되거나 지급되지 않을 수 있습니다.",
];

export default function ReviewerGuide() {
  return (
    <div className="space-y-6">
      {/* 절차 단계 */}
      <div className="space-y-3">
        {STEPS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-3 rounded-2xl border border-border/70 bg-card p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-foreground">{title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 꼭 지켜주세요 */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="mb-2 font-bold text-amber-800">⚠️ 꼭 지켜주세요</p>
        <ul className="space-y-1.5">
          {RULES.map(rule => (
            <li key={rule} className="flex gap-2 text-sm leading-relaxed text-amber-900">
              <span className="select-none text-amber-500">•</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
