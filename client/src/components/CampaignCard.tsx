import { Badge } from "@/components/ui/badge";
import { formatKRW, totalPayout } from "@/lib/workflow";
import { ImageIcon, Search, Users } from "lucide-react";

export type CampaignCardData = {
  id: number;
  title: string;
  category?: string | null;
  keyword: string;
  thumbnailUrl?: string | null;
  productPrice: number;
  commission: number;
  slots: number;
  taken: number;
  remaining: number;
  status: string;
};

export default function CampaignCard({
  campaign,
  footer,
  onClick,
}: {
  campaign: CampaignCardData;
  footer?: React.ReactNode;
  onClick?: () => void;
}) {
  const soldOut = campaign.remaining <= 0;
  const pct = Math.round((campaign.taken / campaign.slots) * 100);

  return (
    <div
      onClick={onClick}
      className={`group flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {/* 썸네일 */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {campaign.thumbnailUrl ? (
          <img
            src={campaign.thumbnailUrl}
            alt={campaign.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
        {campaign.category && (
          <Badge className="absolute left-3 top-3 rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background/90">
            {campaign.category}
          </Badge>
        )}
        {soldOut && campaign.status === "open" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
            <span className="rounded-full bg-foreground/80 px-4 py-1.5 text-sm font-semibold text-background">
              모집 마감
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold leading-snug text-foreground">{campaign.title}</h3>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            No.{campaign.id}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Search className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{campaign.keyword}</span>
        </div>

        {/* 모집 현황 — 핵심 정보 */}
        <div className="mt-auto space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Users className="h-4 w-4 text-primary" />
              {soldOut ? (
                <span className="text-muted-foreground">모집 마감</span>
              ) : (
                <>
                  <span className="text-primary font-bold">{campaign.remaining}자리</span>
                  <span className="text-muted-foreground">남음</span>
                </>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {campaign.taken}/{campaign.slots}명 모집
            </span>
          </div>

          {/* 진행률 바 */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${soldOut ? "bg-muted-foreground/40" : "bg-primary"}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>

          {/* 수수료 — 보조 정보 */}
          <div className="flex items-center justify-between pt-0.5 text-xs text-muted-foreground">
            <span>수수료 {formatKRW(campaign.commission)}</span>
            <span>상품비 {formatKRW(campaign.productPrice)}</span>
          </div>
        </div>

        {footer && <div className="pt-1">{footer}</div>}
      </div>
    </div>
  );
}
