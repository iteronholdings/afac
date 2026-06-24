import { useAuth } from "@/_core/hooks/useAuth";
import CampaignCard from "@/components/CampaignCard";
import SiteHeader from "@/components/SiteHeader";
import WorkflowStepper from "@/components/WorkflowStepper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  formatKRW,
  ParticipationStatus,
  STATUS_BADGE,
  STATUS_LABEL,
  totalPayout,
} from "@/lib/workflow";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  ImageIcon,
  Search,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: campaigns, isLoading: campaignsLoading } = trpc.campaign.listOpen.useQuery();
  const { data: myParts, isLoading: partsLoading } = trpc.participation.mine.useQuery();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = campaigns?.find(c => c.id === selectedId) ?? null;

  const joinedCampaignIds = new Set(
    (myParts ?? []).filter(p => p.status !== "rejected").map(p => p.campaignId)
  );

  const joinMutation = trpc.participation.join.useMutation({
    onSuccess: () => {
      utils.participation.mine.invalidate();
      utils.campaign.listOpen.invalidate();
      toast.success("참여 신청 완료! 아래 '내 활동'에서 진행해 주세요.");
      setSelectedId(null);
    },
    onError: err => toast.error(err.message),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <SiteHeader />

      <main className="container max-w-5xl py-10 space-y-14">

        {/* 진행 중인 캠페인 */}
        <section>
          <div className="mb-6 flex items-end justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-2">
                <Sparkles className="h-3.5 w-3.5" /> 진행 중인 캠페인
              </span>
              <h2 className="text-2xl font-bold text-foreground">
                {user?.fullName || user?.name}님, 참여할 캠페인을 골라보세요
              </h2>
            </div>
            <Link href="/campaigns">
              <Button variant="ghost" size="sm" className="shrink-0 text-primary font-medium">
                전체 보기 <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {campaignsLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted" />
              ))}
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-card py-14 text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-muted-foreground">현재 모집 중인 캠페인이 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {campaigns.slice(0, 6).map(c => {
                const joined = joinedCampaignIds.has(c.id);
                return (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    onClick={() => setSelectedId(c.id)}
                    footer={
                      joined ? (
                        <Button variant="outline" className="w-full bg-card" disabled>
                          <CheckCircle2 className="mr-1.5 h-4 w-4 text-primary" /> 참여 중
                        </Button>
                      ) : (
                        <Button
                          className="w-full rounded-xl font-semibold"
                          disabled={c.remaining <= 0}
                          onClick={e => { e.stopPropagation(); setSelectedId(c.id); }}
                        >
                          {c.remaining <= 0 ? "모집 마감" : "참여하기"}
                        </Button>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* 내 활동 */}
        <section>
          <div className="mb-6 flex items-end justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-2">
                <ClipboardList className="h-3.5 w-3.5" /> 내 활동
              </span>
              <h2 className="text-2xl font-bold text-foreground">참여 진행 현황</h2>
            </div>
            {myParts && myParts.length > 0 && (
              <Link href="/my">
                <Button variant="ghost" size="sm" className="shrink-0 text-primary font-medium">
                  전체 보기 <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>

          {partsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-3xl bg-muted" />
              ))}
            </div>
          ) : !myParts || myParts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-card py-14 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-muted-foreground">아직 참여한 캠페인이 없습니다</p>
              <p className="text-sm text-muted-foreground">위 캠페인에 참여하면 여기서 진행 상황을 확인할 수 있어요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myParts.slice(0, 5).map(p => {
                const status = p.status as ParticipationStatus;
                const c = p.campaign;
                return (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm"
                  >
                    <div className="flex gap-4 p-4">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
                        {c?.thumbnailUrl ? (
                          <img src={c.thumbnailUrl} alt={c.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold leading-snug text-foreground truncate">
                            {c?.title ?? "삭제된 캠페인"}
                          </h3>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </div>
                        {c && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Search className="h-3 w-3 text-primary" /> {c.keyword}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Wallet className="h-3 w-3 text-primary" />
                              {formatKRW(totalPayout(c.productPrice, c.commission))}
                            </span>
                          </div>
                        )}
                        <div className="mt-1">
                          <WorkflowStepper status={status} />
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-border/60 bg-secondary/30 px-4 py-2.5 flex justify-end">
                      <Link href="/my">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-primary font-medium">
                          인증샷 등록 / 상세 보기 <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Campaign apply dialog */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selected.title}</DialogTitle>
                <DialogDescription>
                  아래 안내에 따라 참여를 신청한 뒤, 직접 상품을 구매하고 리뷰를 작성해 주세요.
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-hidden rounded-2xl bg-muted">
                {selected.thumbnailUrl ? (
                  <img src={selected.thumbnailUrl} alt={selected.title} className="max-h-60 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-border/70 bg-secondary/40 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <Search className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">검색 키워드</p>
                    <p className="text-muted-foreground">
                      쇼핑몰에서 <b className="text-foreground">"{selected.keyword}"</b> (으)로 검색해 구매해 주세요.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">
                    모집 {selected.taken}/{selected.slots}명 · 잔여 {selected.remaining}자리
                  </span>
                </div>
              </div>

              {selected.description && (
                <p className="whitespace-pre-line text-sm text-muted-foreground">{selected.description}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border/70 p-3 text-center">
                  <p className="text-xs text-muted-foreground">상품비 (환급)</p>
                  <p className="font-semibold">{formatKRW(selected.productPrice)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 p-3 text-center">
                  <p className="text-xs text-muted-foreground">리뷰 수수료</p>
                  <p className="font-semibold">{formatKRW(selected.commission)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-primary/10 px-4 py-3">
                <span className="text-sm font-medium text-foreground">총 지급 예정액</span>
                <span className="text-lg font-bold text-primary">
                  {formatKRW(totalPayout(selected.productPrice, selected.commission))}
                </span>
              </div>

              <DialogFooter>
                {joinedCampaignIds.has(selected.id) ? (
                  <Button className="w-full" variant="outline" onClick={() => navigate("/my")}>
                    내 활동에서 진행하기
                  </Button>
                ) : (
                  <Button
                    className="w-full rounded-xl font-semibold"
                    disabled={selected.remaining <= 0 || joinMutation.isPending}
                    onClick={() => joinMutation.mutate({ campaignId: selected.id })}
                  >
                    {joinMutation.isPending ? "신청 중..." : selected.remaining <= 0 ? "모집 마감" : "이 캠페인 참여 신청하기"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
