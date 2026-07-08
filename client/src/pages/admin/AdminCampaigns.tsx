import AdminLayout from "@/components/AdminLayout";
import { CampaignFormDialog, CampaignFormValue } from "@/components/CampaignFormDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { formatKRW, totalPayout } from "@/lib/workflow";
import { CalendarDays, ClipboardList, ImageOff, Megaphone, Pencil, Plus, Trash2, Users, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

/** 'YYYY-MM-DD' → 'M/D'. */
const mmdd = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** 날짜별 배분 스케줄 JSON → [{date, count}] (인원 0 제외, 날짜순). */
function parseSchedule(scheduleJson?: string | null): { date: string; count: number }[] {
  try {
    const s = JSON.parse(scheduleJson || "{}") as Record<string, number>;
    return Object.entries(s)
      .filter(([, n]) => Number(n) > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, n]) => ({ date, count: Number(n) }));
  } catch {
    return [];
  }
}

const STATUS_META: Record<string, { label: string; badge: string }> = {
  pending:     { label: "승인대기", badge: "bg-yellow-400 text-yellow-900" },
  open:        { label: "승인완료", badge: "bg-primary text-primary-foreground shadow-sm" },
  in_progress: { label: "작업진행", badge: "bg-blue-500 text-white" },
  error:       { label: "오류",     badge: "bg-destructive text-white" },
  closed:      { label: "작업완료", badge: "bg-emerald-600 text-white" },
  rejected:    { label: "반려",     badge: "bg-destructive/80 text-white" },
};

const BUCKETS = [
  { key: "pending",     label: "승인대기", dot: "bg-yellow-400",      ring: "ring-yellow-400",  match: (s: string) => s === "pending" },
  { key: "open",        label: "승인완료", dot: "bg-primary",         ring: "ring-primary",     match: (s: string) => s === "open" },
  { key: "in_progress", label: "작업진행", dot: "bg-blue-500",        ring: "ring-blue-500",    match: (s: string) => s === "in_progress" },
  { key: "error",       label: "오류",     dot: "bg-destructive",     ring: "ring-destructive", match: (s: string) => s === "error" || s === "rejected" },
  { key: "closed",      label: "작업완료", dot: "bg-emerald-600",     ring: "ring-emerald-600", match: (s: string) => s === "closed" },
] as const;

export default function AdminCampaigns() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const { data: campaigns, isLoading } = trpc.campaign.listAll.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<CampaignFormValue> | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  /** '모집 마감 → 작업 진행' 전환 확인 다이얼로그 (리뷰어 노출이 끊기므로 실수 방지). */
  const [progressTarget, setProgressTarget] = useState<{ id: number; title: string } | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of BUCKETS) map[b.key] = (campaigns ?? []).filter(c => b.match(c.status)).length;
    return map;
  }, [campaigns]);

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    if (!filter) return campaigns;
    const b = BUCKETS.find(x => x.key === filter);
    return b ? campaigns.filter(c => b.match(c.status)) : campaigns;
  }, [campaigns, filter]);

  const setStatusMutation = trpc.campaign.setStatus.useMutation({
    onSuccess: () => {
      utils.campaign.listAll.invalidate();
      utils.campaign.listOpen.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const deleteMutation = trpc.campaign.remove.useMutation({
    onSuccess: () => {
      utils.campaign.listAll.invalidate();
      utils.campaign.listOpen.invalidate();
      toast.success("캠페인을 삭제했습니다.");
      setDeleteTarget(null);
    },
    onError: err => toast.error(err.message),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (c: NonNullable<typeof campaigns>[number]) => {
    setEditing({
      id: c.id,
      title: c.title,
      category: c.category ?? "",
      keyword: c.keyword,
      thumbnailUrl: c.thumbnailUrl ?? null,
      productUrl: c.productUrl ?? "",
      description: c.description ?? "",
      productPrice: c.productPrice,
      commission: c.commission,
      slots: c.slots,
    });
    setDialogOpen(true);
  };

  return (
    <AdminLayout
      title="캠페인 관리"
      description="체험단·리뷰 캠페인을 등록하고 모집 상태를 관리합니다."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-full bg-card" onClick={() => navigate("/client/campaign/new")}>
            <Wand2 className="mr-1.5 h-4 w-4" /> 마법사로 등록
          </Button>
          <Button onClick={openCreate} className="rounded-full">
            <Plus className="mr-1.5 h-4 w-4" /> 새 캠페인
          </Button>
        </div>
      }
    >
      {/* 상태 대시보드 */}
      {!isLoading && campaigns && campaigns.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {BUCKETS.map(b => {
            const active = filter === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setFilter(active ? null : b.key)}
                className={`rounded-2xl border bg-card px-4 py-3.5 text-left shadow-sm transition-all ${
                  active ? `border-transparent ring-2 ${b.ring}` : "border-border/70 hover:-translate-y-0.5 hover:shadow"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${b.dot}`} /> {b.label}
                </span>
                <p className="mt-1 text-2xl font-extrabold text-foreground">{counts[b.key] ?? 0}</p>
              </button>
            );
          })}
        </div>
      )}
      {filter && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span>'{BUCKETS.find(b => b.key === filter)?.label}' 상태만 표시 중</span>
          <button onClick={() => setFilter(null)} className="font-semibold text-primary hover:underline">전체 보기</button>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border bg-card py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Megaphone className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">아직 등록된 캠페인이 없습니다</p>
            <p className="mt-1 text-sm text-muted-foreground">
              첫 캠페인을 등록해 리뷰어 모집을 시작하세요.
            </p>
          </div>
          <Button onClick={openCreate} className="rounded-full">
            <Plus className="mr-1.5 h-4 w-4" /> 새 캠페인 등록
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
          해당 상태의 캠페인이 없습니다.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => (
            <div
              key={c.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition hover:shadow-md"
            >
              <div className="relative aspect-video bg-muted">
                {c.thumbnailUrl ? (
                  <img src={c.thumbnailUrl} alt={c.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-7 w-7" />
                  </div>
                )}
                <span
                  className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    STATUS_META[c.status]?.badge ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {STATUS_META[c.status]?.label ?? c.status}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  {c.category && (
                    <span className="text-xs font-medium text-primary">{c.category}</span>
                  )}
                  <h3 className="mt-0.5 line-clamp-1 font-bold">{c.title}</h3>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    검색어: {c.keyword}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">상품가</p>
                    <p className="font-semibold">{formatKRW(c.productPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">수수료</p>
                    <p className="font-semibold text-primary">{formatKRW(c.commission)}</p>
                  </div>
                  <div className="col-span-2 border-t border-border/60 pt-2">
                    <p className="text-muted-foreground">건당 총 지급액</p>
                    <p className="font-bold">{formatKRW(totalPayout(c.productPrice, c.commission))}</p>
                  </div>
                  <div className="col-span-2 rounded-lg bg-primary/10 px-2.5 py-2">
                    <p className="text-muted-foreground">💳 예치금 사용액 <span className="text-[10px]">(업체 결제)</span></p>
                    <p className="text-sm font-extrabold text-primary">{c.paidAmount > 0 ? formatKRW(c.paidAmount) : "—"}</p>
                  </div>
                </div>

                {/* 승인 전 판단 정보: 리뷰 구성 + 진행 날짜 */}
                <div className="space-y-1.5 rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-muted-foreground">리뷰 구성</span>
                    <b className="text-foreground">
                      사진 {c.photoCount ?? 0} · 글자 {c.textCount ?? 0} · 별점 {c.starCount ?? 0}
                    </b>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="shrink-0 text-muted-foreground">진행</span>
                    {(() => {
                      const sched = parseSchedule(c.schedule);
                      if (sched.length > 0) {
                        return (
                          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                            <b className="text-foreground">날짜별 배분</b>
                            {sched.map(s => (
                              <span key={s.date} className="rounded bg-card px-1.5 py-px font-semibold text-foreground ring-1 ring-border/60">
                                {mmdd(s.date)} {s.count}명
                              </span>
                            ))}
                          </span>
                        );
                      }
                      if (c.startDate) {
                        return (
                          <b className="text-foreground">
                            단일 {mmdd(c.startDate)}{c.endDate ? ` ~ ${mmdd(c.endDate)}` : ""}
                          </b>
                        );
                      }
                      return <span className="text-muted-foreground">기간 미지정</span>;
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  모집 {c.taken} / {c.slots}명
                </div>

                <div className="mt-auto flex flex-col gap-2 pt-1">
                  {c.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={setStatusMutation.isPending}
                        onClick={() => setStatusMutation.mutate({ id: c.id, status: "open" })}
                      >
                        승인
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={setStatusMutation.isPending}
                        onClick={() => setStatusMutation.mutate({ id: c.id, status: "rejected" })}
                      >
                        반려
                      </Button>
                    </div>
                  ) : (
                  <div className="flex flex-col gap-2">
                    {/* 상태 전환 */}
                    <div className="flex gap-2">
                      {c.status === "open" && (
                        <Button size="sm" className="flex-1" disabled={setStatusMutation.isPending}
                          onClick={() => setProgressTarget({ id: c.id, title: c.title })}>
                          모집 마감 · 작업 진행
                        </Button>
                      )}
                      {c.status === "in_progress" && (
                        <>
                          <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={setStatusMutation.isPending}
                            onClick={() => setStatusMutation.mutate({ id: c.id, status: "closed" })}>
                            작업 완료
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 bg-card" disabled={setStatusMutation.isPending}
                            onClick={() => setStatusMutation.mutate({ id: c.id, status: "open" })}>
                            모집 재개
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 bg-card text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={setStatusMutation.isPending}
                            onClick={() => setStatusMutation.mutate({ id: c.id, status: "error" })}>
                            오류
                          </Button>
                        </>
                      )}
                      {c.status === "error" && (
                        <>
                          <Button size="sm" className="flex-1" disabled={setStatusMutation.isPending}
                            onClick={() => setStatusMutation.mutate({ id: c.id, status: "in_progress" })}>
                            작업 재개
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 bg-card" disabled={setStatusMutation.isPending}
                            onClick={() => setStatusMutation.mutate({ id: c.id, status: "open" })}>
                            모집 재개
                          </Button>
                        </>
                      )}
                      {c.status === "closed" && (
                        <Button size="sm" variant="ghost" className="flex-1" disabled={setStatusMutation.isPending}
                          onClick={() => setStatusMutation.mutate({ id: c.id, status: "open" })}>
                          모집 재개
                        </Button>
                      )}
                      {c.status === "rejected" && (
                        <Button size="sm" className="flex-1" disabled={setStatusMutation.isPending}
                          onClick={() => setStatusMutation.mutate({ id: c.id, status: "open" })}>
                          다시 승인
                        </Button>
                      )}
                    </div>
                    <Button variant="outline" size="sm" className="bg-card" onClick={() => openEdit(c)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> 수정
                    </Button>
                  </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget({ id: c.id, title: c.title })}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 삭제
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CampaignFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={() => {
          utils.campaign.listAll.invalidate();
          utils.campaign.listOpen.invalidate();
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>캠페인을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.title}</span> 캠페인과
              연결된 모든 참여 기록이 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={e => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id });
              }}
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 모집 마감 → 작업 진행 확인 (리뷰어 노출이 끊기므로 실수 방지) */}
      <AlertDialog open={progressTarget !== null} onOpenChange={o => !o && setProgressTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>모집을 마감하고 작업 단계로 전환할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{progressTarget?.title}</span> 캠페인이{" "}
              <span className="font-semibold text-foreground">리뷰어 캠페인 목록에서 숨겨지고, 새 참여를 받을 수 없게 됩니다.</span>{" "}
              모집이 아직 안 끝났다면 전환하지 마세요. (전환 후에도 '모집 재개'로 되돌릴 수 있어요)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setStatusMutation.isPending}>취소 (모집 유지)</AlertDialogCancel>
            <AlertDialogAction
              disabled={setStatusMutation.isPending}
              onClick={e => {
                e.preventDefault();
                if (progressTarget) {
                  setStatusMutation.mutate({ id: progressTarget.id, status: "in_progress" });
                  setProgressTarget(null);
                }
              }}
            >
              모집 마감하고 전환
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
