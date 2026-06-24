import { useAuth } from "@/_core/hooks/useAuth";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Loader2,
  PackagePlus,
  Search,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  pending: "승인 대기",
  open: "모집 중",
  closed: "마감",
  rejected: "반려",
};
const CAMPAIGN_STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  open: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
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

type CampaignForm = {
  title: string;
  category: string;
  keyword: string;
  productUrl: string;
  description: string;
  productPrice: string;
  commission: string;
  slots: string;
};

const EMPTY_FORM: CampaignForm = {
  title: "", category: "", keyword: "", productUrl: "",
  description: "", productPrice: "", commission: "", slots: "1",
};

export default function BusinessDashboard() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: campaigns, isLoading } = trpc.campaign.myBusiness.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [selectedProof, setSelectedProof] = useState<{ url: string; label: string } | null>(null);

  const { data: participants, isLoading: loadingParts } = trpc.campaign.campaignParticipants.useQuery(
    { campaignId: expandedId! },
    { enabled: expandedId !== null }
  );

  const requestMutation = trpc.campaign.request.useMutation({
    onSuccess: () => {
      utils.campaign.myBusiness.invalidate();
      toast.success("캠페인 신청이 완료되었습니다. 관리자 승인 후 모집이 시작됩니다.");
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: err => toast.error(err.message),
  });

  const update = (k: keyof CampaignForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(form.productPrice, 10);
    const comm = parseInt(form.commission, 10);
    const slots = parseInt(form.slots, 10);
    if (!form.title || !form.keyword) { toast.error("제목과 키워드는 필수입니다."); return; }
    if (isNaN(price) || price < 0) { toast.error("상품가를 올바르게 입력해 주세요."); return; }
    if (isNaN(comm) || comm < 0) { toast.error("수수료를 올바르게 입력해 주세요."); return; }
    if (isNaN(slots) || slots < 1) { toast.error("모집 인원을 올바르게 입력해 주세요."); return; }
    requestMutation.mutate({
      title: form.title.trim(),
      category: form.category.trim() || undefined,
      keyword: form.keyword.trim(),
      productUrl: form.productUrl.trim() || undefined,
      description: form.description.trim() || undefined,
      productPrice: price,
      commission: comm,
      slots,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <SiteHeader />

      <main className="container max-w-5xl py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Building2 className="h-3.5 w-3.5" /> 업체 대시보드
            </span>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">내 캠페인 현황</h1>
            <p className="text-muted-foreground">
              신청한 캠페인과 리뷰어들의 참여 현황을 확인하세요.
            </p>
          </div>
          <Button className="shrink-0 rounded-full font-semibold" onClick={() => setShowForm(true)}>
            <PackagePlus className="mr-2 h-4 w-4" /> 캠페인 신청
          </Button>
        </div>

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
            <Button className="mt-1 rounded-full font-semibold" onClick={() => setShowForm(true)}>
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
                      <h4 className="mb-3 text-sm font-semibold text-foreground">리뷰어 참여 현황</h4>
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
                                <th className="pb-2 text-left font-medium">인증샷</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {participants.map(p => (
                                <tr key={p.id} className="align-middle">
                                  <td className="py-2.5 pr-4 font-medium">{p.reviewer?.fullName ?? "알 수 없음"}</td>
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
      </main>

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

      {/* Campaign request form */}
      <Dialog open={showForm} onOpenChange={o => { if (!o) { setShowForm(false); setForm(EMPTY_FORM); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>캠페인 신청</DialogTitle>
            <DialogDescription>
              신청 후 관리자 검토를 거쳐 승인되면 리뷰어 모집이 시작됩니다.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>캠페인 제목 *</Label>
              <Input placeholder="예: 촉촉 수분크림 체험단 모집" value={form.title} onChange={update("title")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>카테고리</Label>
                <Input placeholder="예: 뷰티, 푸드" value={form.category} onChange={update("category")} />
              </div>
              <div className="space-y-1.5">
                <Label>검색 키워드 *</Label>
                <Input placeholder="예: 수분크림 추천" value={form.keyword} onChange={update("keyword")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>상품 링크</Label>
              <Input placeholder="https://..." value={form.productUrl} onChange={update("productUrl")} />
            </div>
            <div className="space-y-1.5">
              <Label>캠페인 설명</Label>
              <Textarea placeholder="리뷰어에게 안내할 미션 내용을 입력하세요." rows={3} value={form.description} onChange={update("description")} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>상품가 (원) *</Label>
                <Input type="number" min={0} placeholder="0" value={form.productPrice} onChange={update("productPrice")} />
              </div>
              <div className="space-y-1.5">
                <Label>수수료 (원) *</Label>
                <Input type="number" min={0} placeholder="0" value={form.commission} onChange={update("commission")} />
              </div>
              <div className="space-y-1.5">
                <Label>모집 인원 *</Label>
                <Input type="number" min={1} placeholder="1" value={form.slots} onChange={update("slots")} />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
                취소
              </Button>
              <Button type="submit" disabled={requestMutation.isPending}>
                {requestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                신청하기
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
