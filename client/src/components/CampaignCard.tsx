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

  return (
    <div
      onClick={onClick}
      className={`group flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
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
        <div className="absolute left-3 top-3 flex gap-1.5">
          {campaign.category && (
            <Badge className="rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background/90">
              {campaign.category}
            </Badge>
          )}
        </div>
        {soldOut && campaign.status === "open" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
            <span className="rounded-full bg-foreground/80 px-4 py-1.5 text-sm font-semibold text-background">
              모집 마감
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="line-clamp-2 font-semibold leading-snug text-foreground">{campaign.title}</h3>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Search className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{campaign.keyword}</span>
        </div>

        <div className="mt-auto space-y-2.5 pt-1">
          <div className="flex items-end justify-between">
            <span className="text-xs text-muted-foreground">총 지급 예정액</span>
            <span className="text-lg font-bold text-primary">
              {formatKRW(totalPayout(campaign.productPrice, campaign.commission))}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              상품비 {formatKRW(campaign.productPrice)} + 수수료 {formatKRW(campaign.commission)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>
              모집 {campaign.taken}/{campaign.slots}명
              {!soldOut && <span className="text-primary"> · {campaign.remaining}자리 남음</span>}
            </span>
          </div>
        </div>

        {footer && <div className="pt-1">{footer}</div>}
      </div>
    </div>
  );
}
