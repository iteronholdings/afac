import BusinessChatDialog from "@/components/BusinessChatDialog";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FolderArchive,
  ImageIcon,
  Loader2,
  MessageCircle,
  PackagePlus,
  Search,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  pending: "승인 대기",
  open: "모집 중",
  in_progress: "작업 진행",
  error: "오류",
  closed: "작업 완료",
  rejected: "반려",
};
const CAMPAIGN_STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  open: "bg-green-100 text-green-800",
  in_progress: "bg-blue-100 text-blue-700",
  error: "bg-red-100 text-red-700",
  closed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};
const REVIEW_TYPE_LABEL: Record<string, string> = {
  photo: "📷 사진",
  text: "📝 글자",
  star: "⭐ 별점",
};
const PARTICIPATION_STATUS_LABEL: Record<string, string> = {
  applied: "신청",
  searched: "검색완료",
  purchased: "구매완료",
  reviewed: "리뷰완료",
  approved: "지급확정",
  paid: "입금완료",
  rejected: "반려",
};

export default function BusinessDashboard() {
  const [, navigate] = useLocation();
  const { data: campaigns, isLoading } = trpc.campaign.myBusiness.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedProof, setSelectedProof] = useState<{ url: string; label: string } | null>(null);
  const [chatWith, setChatWith] = useState<{ id: number; name: string } | null>(null);

  const { data: participants, isLoading: loadingParts } = trpc.campaign.campaignParticipants.useQuery(
    { campaignId: expandedId! },
    { enabled: expandedId !== null }
  );

  const assignZip = trpc.campaign.assignZipPackets.useMutation({
    onSuccess: (res) => toast.success(`${res.assigned}명에게 가이드 ZIP을 할당했어요! (유닛 ${res.units}개 / 참여 ${res.participants}명)`),
    onError: err => toast.error(err.message),
  });

  return (
    <ClientLayout
      title="캠페인 신청 관리"
      description="신청한 캠페인과 리뷰어들의 참여 현황을 확인하세요."
      actions={
        <Button className="gap-1.5 bg-orange-500 hover:bg-orange-600" onClick={() => navigate("/client/campaign/new")}>
          <PackagePlus className="h-4 w-4" /> 캠페인 신청
        </Button>
      }
    >
      <div className="mx-auto max-w-5xl">
        {/* Campaign list */}
        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />)}
          </div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border/70 bg-card py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">신청한 캠페인이 없습니다</p>
            <p className="text-sm text-muted-foreground">캠페인을 신청하면 관리자 검토 후 모집이 시작됩니다.</p>
            <Button className="mt-1 rounded-full font-semibold" onClick={() => navigate("/client/campaign/new")}>
              첫 캠페인 신청하기
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map(c => {
              const expanded = expandedId === c.id;
              return (
                <div key={c.id} className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
                  {/* Campaign row */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {c.thumbnailUrl ? (
                        <img src={c.thumbnailUrl} alt={c.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">{c.title}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CAMPAIGN_STATUS_BADGE[c.status]}`}>
                          {CAMPAIGN_STATUS_LABEL[c.status]}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Search className="h-3 w-3" />{c.keyword}</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.taken} / {c.slots}명 참여</span>
                      </div>
                    </div>
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {/* Participants panel */}
                  {expanded && (
                    <div className="border-t border-border/60 bg-muted/20 px-5 py-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">리뷰어 참여 현황</h4>
                        {c.hasPhotoGuideZip && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 rounded-full bg-card"
                            disabled={assignZip.isPending}
                            onClick={() => assignZip.mutate({ campaignId: c.id })}
                          >
                            {assignZip.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderArchive className="h-3.5 w-3.5" />}
                            가이드 ZIP 리뷰어 할당
                          </Button>
                        )}
                      </div>
                      {loadingParts ? (
                        <div className="space-y-2">
                          {[0, 1].map(i => <div key={i} className="h-10 animate-pulse rounded-xl bg-muted" />)}
                        </div>
                      ) : !participants || participants.length === 0 ? (
                        <p className="text-sm text-muted-foreground">아직 참여한 리뷰어가 없습니다.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                                <th className="pb-2 pr-4 text-left font-medium">리뷰어</th>
                                <th className="pb-2 pr-4 text-left font-medium">연락처</th>
                                <th className="pb-2 pr-4 text-left font-medium">상태</th>
                                <th className="pb-2 pr-4 text-left font-medium">인증샷</th>
                                <th className="pb-2 text-left font-medium">채팅</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {participants.map(p => (
                                <tr key={p.id} className="align-middle">
                                  <td className="py-2.5 pr-4 font-medium">
                                    <div className="flex items-center gap-1.5">
                                      <span>{p.reviewer?.fullName ?? "알 수 없음"}</span>
                                      {p.reviewType && (
                                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px text-[10px] font-bold text-secondary-foreground">
                                          {REVIEW_TYPE_LABEL[p.reviewType]}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-4 text-muted-foreground">{p.reviewer?.phone ?? "-"}</td>
                                  <td className="py-2.5 pr-4">
                                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                                      {PARTICIPATION_STATUS_LABEL[p.status] ?? p.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5">
                                    <div className="flex flex-wrap gap-2">
                                      {p.searchProofUrl && (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedProof({ url: p.searchProofUrl!, label: "검색 인증샷" })}
                                          className="rounded-lg border border-border/70 bg-card px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                                        >
                                          검색
                                        </button>
                                      )}
                                      {p.purchaseProofUrl && (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedProof({ url: p.purchaseProofUrl!, label: "구매 인증샷" })}
                                          className="rounded-lg border border-border/70 bg-card px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                                        >
                                          구매
                                        </button>
                                      )}
                                      {p.reviewProofUrl && (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedProof({ url: p.reviewProofUrl!, label: "리뷰 인증샷" })}
                                          className="rounded-lg border border-border/70 bg-card px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                                        >
                                          리뷰
                                        </button>
                                      )}
                                      {!p.searchProofUrl && !p.purchaseProofUrl && !p.reviewProofUrl && (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5">
                                    {p.reviewer?.id ? (
                                      <button
                                        type="button"
                                        onClick={() => setChatWith({ id: p.reviewer!.id, name: p.reviewer!.fullName ?? "리뷰어" })}
                                        className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-card px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                                      >
                                        <MessageCircle className="h-3.5 w-3.5" /> 채팅
                                      </button>
                                    ) : <span className="text-xs text-muted-foreground">-</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Proof photo lightbox */}
      <Dialog open={!!selectedProof} onOpenChange={o => !o && setSelectedProof(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedProof?.label}</DialogTitle>
          </DialogHeader>
          {selectedProof?.url && (
            <img src={selectedProof.url} alt={selectedProof.label} className="w-full rounded-xl object-contain max-h-[60vh]" />
          )}
        </DialogContent>
      </Dialog>

      <BusinessChatDialog
        open={!!chatWith}
        onOpenChange={o => !o && setChatWith(null)}
        partnerId={chatWith?.id ?? null}
        partnerName={chatWith?.name ?? ""}
      />
    </ClientLayout>
  );
}
