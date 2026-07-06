import { useAuth } from "@/_core/hooks/useAuth";
import CampaignCard from "@/components/CampaignCard";
import SiteHeader from "@/components/SiteHeader";
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
import { formatKRW, mallName, totalPayout } from "@/lib/workflow";
import { Input } from "@/components/ui/input";
import RecruitScheduleInfo from "@/components/RecruitScheduleInfo";
import { CheckCircle2, ImageIcon, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function Campaigns() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate("/afreviewer/login"); return; }
    if (user?.role === "business") { navigate("/client/dashboard"); return; }
  }, [authLoading, isAuthenticated, user?.role, navigate]);

  const { data: campaigns, isLoading, isError, refetch } = trpc.campaign.listOpen.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: myParticipations } = trpc.participation.mine.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = (campaigns ?? []).filter(c => {
    const q = search.trim();
    if (!q) return true;
    if (/^\d+$/.test(q)) return c.id === Number(q);
    return c.title.toLowerCase().includes(q.toLowerCase()) || c.keyword.toLowerCase().includes(q.toLowerCase());
  });

  const selected = campaigns?.find(c => c.id === selectedId) ?? null;
  const joinedCampaignIds = new Set(
    (myParticipations ?? [])
      .filter(p => p.status !== "rejected")
      .map(p => p.campaignId)
  );

  const joinMutation = trpc.participation.join.useMutation({
    onSuccess: () => {
      utils.participation.mine.invalidate();
      utils.campaign.listOpen.invalidate();
      toast.success("참여 신청이 완료되었습니다. '내 활동'에서 진행해 주세요.");
      setSelectedId(null);
      navigate("/my");
    },
    onError: err => toast.error(err.message),
  });

  const handleJoin = (campaignId: number) => {
    if (!isAuthenticated) {
      navigate("/afreviewer/login");
      return;
    }
    joinMutation.mutate({ campaignId });
  };

  // 인증 확인 중이거나 비로그인이면 캐페인 내용을 노출하지 않는다.
  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary/40 to-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <SiteHeader />

      <main className="container py-10 pb-28">
        <div className="mb-8 flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> 진행 중인 캠페인
          </span>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">캠페인 둘러보기</h1>
          <p className="text-muted-foreground">
            원하는 캠페인에 참여하고 상품을 구매한 뒤 리뷰를 남기면 상품비와 작업수당을 지급받습니다.
          </p>
        </div>

        <div className="relative mb-6 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="캠페인 번호 또는 이름 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-11 pl-9 bg-card"
          />
        </div>

        {isLoading || authLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border/70 bg-card py-20 text-center">
            <p className="font-semibold">캠페인을 불러오지 못했습니다</p>
            <p className="text-sm text-muted-foreground">잠시 후 다시 시도해 주세요.</p>
            <Button variant="outline" className="mt-1 bg-card" onClick={() => refetch()}>
              다시 시도
            </Button>
          </div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border/70 bg-card py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">현재 모집 중인 캠페인이 없습니다</p>
            <p className="text-sm text-muted-foreground">새로운 캠페인이 등록되면 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => {
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
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedId(c.id);
                        }}
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
      </main>

      {/* Campaign detail / apply dialog */}
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
                  <img
                    src={selected.thumbnailUrl}
                    alt={selected.title}
                    className="aspect-square w-full object-cover"
                  />
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
                      {mallName(selected.category)}에서 <b className="text-foreground">"{selected.keyword}"</b> (으)로 검색해 구매해 주세요.
                    </p>
                  </div>
                </div>
                <RecruitScheduleInfo
                  schedule={selected.schedule}
                  takenByDate={selected.takenByDate}
                  taken={selected.taken}
                  slots={selected.slots}
                  remaining={selected.remaining}
                />
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
                  <p className="text-xs text-muted-foreground">작업수당</p>
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
                    onClick={() => handleJoin(selected.id)}
                  >
                    {joinMutation.isPending
                      ? "신청 중..."
                      : selected.remaining <= 0
                        ? "모집 마감"
                        : "이 캠페인 참여 신청하기"}
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
