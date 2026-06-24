import AdminLayout from "@/components/AdminLayout";
import { ChatDialog } from "@/components/ChatDialog";
import { ProofThumb } from "@/components/ProofThumb";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  formatKRW,
  ParticipationStatus,
  STATUS_BADGE,
  STATUS_LABEL,
  totalPayout,
} from "@/lib/workflow";
import { CheckCircle2, ChevronDown, ChevronRight, Inbox, MessageCircle, Phone, Wallet, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "전체 상태" },
  { value: "applied", label: "참여 신청" },
  { value: "searched", label: "검색 인증" },
  { value: "purchased", label: "구매 인증" },
  { value: "reviewed", label: "리뷰 인증" },
  { value: "approved", label: "지급 확정" },
  { value: "paid", label: "입금 완료" },
  { value: "rejected", label: "반려" },
];

export default function AdminParticipations() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.participation.listAll.useQuery(undefined);
  const { data: campaigns } = trpc.campaign.listAll.useQuery();

  const [campaignFilter, setCampaignFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<number>>(new Set());
  const [chatTarget, setChatTarget] = useState<{ participationId: number; title: string } | null>(null);

  const setStatusMutation = trpc.participation.setStatus.useMutation({
    onSuccess: () => {
      utils.participation.listAll.invalidate();
      toast.success("상태가 변경되었습니다.");
    },
    onError: err => toast.error(err.message),
  });

  const act = (participationId: number, status: ParticipationStatus) =>
    setStatusMutation.mutate({ participationId, status });

  // 필터 적용
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(r => {
      const matchCampaign = campaignFilter === "all" || String(r.campaignId) === campaignFilter;
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchCampaign && matchStatus;
    });
  }, [data, campaignFilter, statusFilter]);

  // 캠페인별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<number, { title: string; rows: typeof filtered }>();
    for (const r of filtered) {
      const id = r.campaignId;
      if (!map.has(id)) {
        map.set(id, { title: r.campaign?.title ?? "삭제된 캠페인", rows: [] });
      }
      map.get(id)!.rows.push(r);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ campaignId: id, ...v }));
  }, [filtered]);

  const toggleCampaign = (id: number) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 처음 로드 시 모든 캠페인 펼침
  useMemo(() => {
    if (grouped.length > 0) {
      setExpandedCampaigns(new Set(grouped.map(g => g.campaignId)));
    }
  }, [grouped.map(g => g.campaignId).join(",")]);

  return (
    <AdminLayout
      title="참여 현황"
      description="리뷰어의 참여 진행 상태를 확인하고 인증을 검수해 지급을 처리합니다."
      actions={
        <div className="flex gap-2">
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="w-44 bg-card">
              <SelectValue placeholder="캠페인 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 캠페인</SelectItem>
              {campaigns?.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(f => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">해당 조건의 참여 내역이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => {
            const isOpen = expandedCampaigns.has(group.campaignId);
            return (
              <div key={group.campaignId} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                {/* 캠페인 헤더 */}
                <button
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => toggleCampaign(group.campaignId)}
                >
                  <div className="flex items-center gap-2.5">
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                    <span className="font-bold text-foreground">{group.title}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {group.rows.length}명
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    완료 {group.rows.filter(r => r.status === "paid").length} / 확정 {group.rows.filter(r => r.status === "approved").length} / 검수중 {group.rows.filter(r => r.status === "reviewed").length}
                  </span>
                </button>

                {/* 참여자 목록 */}
                {isOpen && (
                  <div className="divide-y divide-border/60 border-t border-border/60">
                    {group.rows.map(r => {
                      const status = r.status as ParticipationStatus;
                      const payout = r.campaign
                        ? totalPayout(r.campaign.productPrice, r.campaign.commission)
                        : 0;
                      return (
                        <div
                          key={r.id}
                          className="grid gap-4 p-4 md:grid-cols-[1fr_auto]"
                        >
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}>
                                {STATUS_LABEL[status]}
                              </span>
                              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                                <span>
                                  <b className="text-foreground">{r.user?.fullName ?? "-"}</b> ({r.user?.loginId ?? "-"})
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5" /> {r.user?.phone ?? "-"}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Wallet className="h-3.5 w-3.5" /> 지급 예정 {formatKRW(payout)}
                                </span>
                              </div>
                            </div>

                            <div className="grid max-w-lg grid-cols-3 gap-3">
                              <ProofThumb url={r.searchProofUrl} label="검색 인증샷" />
                              <ProofThumb url={r.purchaseProofUrl} label="구매 인증샷" />
                              <ProofThumb url={r.reviewProofUrl} label="리뷰 인증샷" />
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 md:w-44">
                            {status === "reviewed" && (
                              <Button size="sm" disabled={setStatusMutation.isPending} onClick={() => act(r.id, "approved")}>
                                <CheckCircle2 className="mr-1.5 h-4 w-4" /> 지급 확정
                              </Button>
                            )}
                            {status === "approved" && (
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={setStatusMutation.isPending} onClick={() => act(r.id, "paid")}>
                                <Wallet className="mr-1.5 h-4 w-4" /> 입금 완료 처리
                              </Button>
                            )}
                            {status === "paid" && (
                              <span className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">정산 완료</span>
                            )}
                            {status === "applied" && (
                              <span className="rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">검색 인증 대기 중</span>
                            )}
                            {status === "searched" && (
                              <span className="rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">구매 인증 대기 중</span>
                            )}
                            {status === "purchased" && (
                              <span className="rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">리뷰 인증 대기 중</span>
                            )}
                            {status !== "paid" && status !== "rejected" && (
                              <Button size="sm" variant="outline" className="bg-card text-destructive hover:text-destructive" disabled={setStatusMutation.isPending} onClick={() => act(r.id, "rejected")}>
                                <XCircle className="mr-1.5 h-4 w-4" /> 반려
                              </Button>
                            )}
                            {status === "rejected" && (
                              <Button size="sm" variant="outline" className="bg-card" disabled={setStatusMutation.isPending} onClick={() => act(r.id, "applied")}>
                                반려 취소
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-card"
                              onClick={() => setChatTarget({ participationId: r.id, title: `${r.user?.fullName ?? "-"} · ${group.title}` })}
                            >
                              <MessageCircle className="mr-1.5 h-4 w-4" /> 채팅
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {chatTarget && (
        <ChatDialog
          open={!!chatTarget}
          onOpenChange={o => !o && setChatTarget(null)}
          participationId={chatTarget.participationId}
          title={chatTarget.title}
        />
      )}
    </AdminLayout>
  );
}
