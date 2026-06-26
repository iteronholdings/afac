import { useAuth } from "@/_core/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatKRW } from "@/lib/workflow";
import {
  ArrowRight,
  ClipboardList,
  FilePen,
  PackagePlus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  pending: "승인 대기",
  open: "모집 중",
  in_progress: "작업 진행",
  error: "오류",
  closed: "작업 완료",
  rejected: "반려",
};
const CAMPAIGN_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  open: "bg-primary/15 text-primary",
  in_progress: "bg-blue-100 text-blue-700",
  error: "bg-destructive/10 text-destructive",
  closed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-destructive/10 text-destructive",
};

export default function ClientHome() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: campaigns = [], isLoading } = trpc.campaign.myBusiness.useQuery();
  const { data: drafts = [] } = trpc.campaign.myDrafts.useQuery();

  const deleteDraftMutation = trpc.campaign.deleteDraft.useMutation({
    onSuccess: () => {
      utils.campaign.myDrafts.invalidate();
      toast.success("임시저장을 삭제했어요.");
    },
    onError: err => toast.error(err.message),
  });

  const stats = useMemo(() => {
    const active = campaigns.filter(c => c.status === "open").length;
    const pending = campaigns.filter(c => c.status === "pending").length;
    const closed = campaigns.filter(c => c.status === "closed").length;
    return { active, pending, closed, total: campaigns.length };
  }, [campaigns]);

  const recent = campaigns.slice(0, 4);
  const sellerName = user?.fullName || user?.name || "셀러";

  const KPIS = [
    { label: "진행 중 캠페인", value: stats.active, suffix: "건", emoji: "🚀", tint: "text-primary", bg: "bg-primary/10" },
    { label: "승인 대기", value: stats.pending, suffix: "건", emoji: "⏳", tint: "text-amber-600", bg: "bg-amber-100/70" },
    { label: "완료 캠페인", value: stats.closed, suffix: "건", emoji: "✅", tint: "text-emerald-600", bg: "bg-emerald-100/70" },
    { label: "예치금 잔액", value: user?.depositBalance ?? 0, suffix: "원", emoji: "💰", tint: "text-primary", bg: "bg-accent" },
  ];

  return (
    <ClientLayout
      title="홈"
      description={`${sellerName}님, 환영합니다 👋`}
      actions={
        <Button onClick={() => navigate("/client/campaign/new")} className="gap-1.5 rounded-full font-bold">
          <PackagePlus className="h-4 w-4" /> 캠페인 신청
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Hero banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-[0_12px_32px_-12px_var(--primary)] sm:p-8">
          {/* cute floating blobs */}
          <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute right-20 bottom-0 h-20 w-20 rounded-full bg-white/10" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                <Sparkles className="h-3.5 w-3.5" /> 체험단 리뷰 마케팅, 더 쉽고 따뜻하게 🐻
              </span>
              <h2 className="mt-3 text-2xl font-extrabold leading-snug sm:text-3xl">
                쿠팡·네이버 체험단,<br />아르벤이 안전하게 직접 도와드려요
              </h2>
              <p className="mt-2 text-sm text-primary-foreground/85">
                누적리뷰 5만건 · 대행수수료 0% · 실시간 대시보드로 진행 상황을 직접 확인하세요.
              </p>
            </div>
            <Button
              onClick={() => navigate("/client/campaign/new")}
              className="shrink-0 gap-1.5 rounded-full bg-white font-bold text-primary hover:bg-white/90"
            >
              캠페인 신청하기 <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {KPIS.map(k => (
            <div
              key={k.label}
              className="group rounded-3xl border border-border/70 bg-card p-5 shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${k.bg}`}>
                {k.emoji}
              </div>
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-extrabold text-foreground">
                {isLoading ? "—" : k.value.toLocaleString()}
                <span className={`ml-1 text-sm font-bold ${k.tint}`}>{k.suffix}</span>
              </p>
            </div>
          ))}
        </div>

        {/* 임시저장한 캠페인 */}
        {drafts.length > 0 && (
          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-foreground">
              <FilePen className="h-4 w-4 text-primary" /> 임시저장한 캠페인
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{drafts.length}</span>
            </h3>
            <div className="space-y-2">
              {drafts.map(d => (
                <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base">📝</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{d.title || "제목 없는 캠페인"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">작성 중 · 이어서 완료해 주세요</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/client/campaign/new?draft=${d.id}`)}
                    className="shrink-0 gap-1 rounded-full font-bold"
                  >
                    이어서 작성 <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteDraftMutation.mutate({ id: d.id })}
                    disabled={deleteDraftMutation.isPending}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="임시저장 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent campaigns */}
          <div className="lg:col-span-2 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-foreground">
                <ClipboardList className="h-4 w-4 text-primary" /> 최근 캠페인
              </h3>
              <Link href="/client/campaigns" className="text-sm font-semibold text-primary hover:underline">
                전체 보기
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map(i => <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />)}
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-secondary text-2xl">
                  🐣
                </div>
                <p className="font-bold text-foreground">아직 신청한 캠페인이 없어요</p>
                <p className="text-sm text-muted-foreground">첫 캠페인을 신청하고 리뷰어를 모집해 보세요!</p>
                <Button
                  onClick={() => navigate("/client/campaign/new")}
                  className="mt-2 gap-1.5 rounded-full font-bold"
                >
                  <PackagePlus className="h-4 w-4" /> 캠페인 신청하기
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {recent.map(c => (
                  <Link key={c.id} href="/client/campaigns">
                    <div className="flex cursor-pointer items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-secondary/60">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base">📦</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-semibold text-foreground">{c.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" /> {c.taken} / {c.slots}명 참여
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${CAMPAIGN_STATUS_BADGE[c.status]}`}>
                        {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick guide */}
          <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-1.5 font-bold text-foreground">🗺️ 진행 방법</h3>
            <ol className="space-y-3">
              {[
                ["🐻", "회원가입", "필요하면 문의 후 진행 가능"],
                ["💰", "크레딧 충전", "수수료 0% 투명한 충전"],
                ["🚀", "캠페인 실행", "검증된 체험단으로 안전 진행"],
                ["📊", "실시간 확인", "대시보드로 결과 모니터링"],
              ].map(([emoji, t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-secondary text-base">
                    {emoji}
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-bold text-foreground">{t}</p>
                    <p className="text-xs text-muted-foreground">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/10 p-3 text-xs font-medium text-primary">
              💡 상담 없이도 바로 캠페인 신청이 가능해요!
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
