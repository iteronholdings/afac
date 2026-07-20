import BusinessChatDialog from "@/components/BusinessChatDialog";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadDeliveryExcel } from "@/lib/deliveryExcel";
import { trpc } from "@/lib/trpc";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  ImageIcon,
  Loader2,
  MessageCircle,
  PackagePlus,
  Search,
  Upload,
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

/** 팀장 검수 결과 배지. */
const QC_BADGE: Record<string, { label: string; cls: string }> = {
  pass: { label: "🛡️ 팀장 검수 통과", cls: "bg-emerald-50 text-emerald-700" },
  fixed: { label: "🛡️ 팀장 검수 · 정리됨", cls: "bg-emerald-50 text-emerald-700" },
  regenerated: { label: "🛡️ 팀장 검수 · 재작성", cls: "bg-emerald-50 text-emerald-700" },
  flagged: { label: "⚠️ 팀장 검수 · 확인 필요", cls: "bg-amber-50 text-amber-700" },
};
function QcBadge({ qc }: { qc?: string | null }) {
  const b = qc ? QC_BADGE[qc] : null;
  if (!b) return null;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>;
}
const PARTICIPATION_STATUS_LABEL: Record<string, string> = {
  applied: "신청",
  searched: "검색완료",
  purchased: "구매완료",
  reviewed: "리뷰완료",
  approved: "지급확정",
  paid: "입금완료",
  rejected: "반려",
};

/** schedule JSON({날짜:인원}) → 날짜순 [날짜, 인원] 목록. 배분 캠페인이 아니면 []. */
function parseSchedule(json?: string | null): [string, number][] {
  if (!json) return [];
  try {
    const s = JSON.parse(json) as Record<string, number>;
    return Object.entries(s)
      .filter(([, n]) => Number(n) > 0)
      .map(([d, n]) => [d, Number(n)] as [string, number])
      .sort((a, b) => a[0].localeCompare(b[0]));
  } catch {
    return [];
  }
}
const mmdd = (s: string) => s.slice(5).replace("-", "/");
/** 오늘 'YYYY-MM-DD' (로컬). toISOString은 UTC라 하루 밀리므로 사용 금지. */
const TODAY_STR = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

export default function BusinessDashboard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
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

  // 리뷰어 배정 원고 보기·수정
  const [draftEdit, setDraftEdit] = useState<{ pid: number; name: string; draft: string; qc?: string | null } | null>(null);
  const saveDraft = trpc.participation.updateReviewDraft.useMutation({
    onSuccess: (res) => {
      utils.campaign.campaignParticipants.invalidate();
      if (res.warnings && res.warnings.length > 0) {
        toast.warning(`팀장 검수: ${res.warnings.join(", ")} — 확인해 주세요.`);
      } else {
        toast.success("원고를 수정했어요. 팀장 검수 통과 · 리뷰어 화면에 바로 반영됩니다.");
      }
      setDraftEdit(null);
    },
    onError: e => toast.error(e.message),
  });

  // 송장 채운 엑셀 업로드 — 덮어쓰지 않고 회차별로 누적 (업로드 목록에서 각각 다운로드)
  const uploadInvoice = trpc.campaign.uploadInvoiceExcel.useMutation({
    onSuccess: (_d, vars) => {
      utils.campaign.listInvoiceExcels.invalidate({ campaignId: vars.campaignId });
      toast.success("송장 엑셀을 업로드했어요. '업로드 목록'에서 확인할 수 있어요.");
    },
    onError: e => toast.error(e.message),
  });
  const onPickInvoice = (campaignId: number, file: File) => {
    if (!/\.xlsx?$/i.test(file.name)) { toast.error("엑셀 파일(.xlsx)만 업로드할 수 있어요."); return; }
    const reader = new FileReader();
    reader.onload = () => uploadInvoice.mutate({ campaignId, dataUrl: String(reader.result), filename: file.name });
    reader.onerror = () => toast.error("파일을 읽지 못했어요.");
    reader.readAsDataURL(file);
  };
  // 업로드 이력 목록 다이얼로그
  const [invoiceListFor, setInvoiceListFor] = useState<{ campaignId: number; title: string } | null>(null);
  const downloadUploadedInvoice = async (id: number) => {
    const res = await utils.campaign.getInvoiceExcel.fetch({ id });
    if (!res) { toast.error("파일을 찾을 수 없어요."); return; }
    const a = document.createElement("a");
    a.href = res.dataUrl;
    a.download = res.name;
    a.click();
  };

  // 사진 리뷰 ZIP 다시 업로드 (기존 배정 초기화 후 새 사진으로 재배정)
  const [reuploadingId, setReuploadingId] = useState<number | null>(null);
  const presignZip = trpc.campaign.zipUploadUrl.useMutation();
  const replaceZip = trpc.campaign.replacePhotoGuideZip.useMutation();
  const reuploadPhotoZip = async (campaignId: number, file: File) => {
    if (!/\.zip$/i.test(file.name)) { toast.error("ZIP(.zip) 파일만 올릴 수 있어요."); return; }
    setReuploadingId(campaignId);
    try {
      let key: string | undefined;
      let base64: string | undefined;
      try {
        const { url, key: k } = await presignZip.mutateAsync({ fileName: file.name });
        const put = await fetch(url, { method: "PUT", body: file });
        if (!put.ok) throw new Error(`R2 upload ${put.status}`);
        key = k;
      } catch (e) {
        // 프리사인 실패/스토리지 미설정 → 소용량은 base64 폴백
        if (file.size > 45 * 1024 * 1024) throw e;
        base64 = await new Promise<string>((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result));
          rd.onerror = rej;
          rd.readAsDataURL(file);
        });
      }
      const r = await replaceZip.mutateAsync({ campaignId, photoGuideZipKey: key, photoGuideZip: base64, fileName: file.name });
      await utils.campaign.myBusiness.invalidate();
      await utils.campaign.campaignParticipants.invalidate();
      toast.success(`사진을 다시 업로드했어요! ${r.assigned}명 재배정 (유닛 ${r.units}개)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "사진 재업로드에 실패했어요.");
    } finally {
      setReuploadingId(null);
    }
  };

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
                        {c.startDate && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {c.startDate}{c.endDate && c.endDate !== c.startDate ? ` ~ ${c.endDate}` : ""}
                            {parseSchedule(c.schedule).length > 0 ? " · 배분" : " · 단일"}
                          </span>
                        )}
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
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">리뷰어 참여 현황</h4>
                        <div className="flex flex-wrap items-center gap-2">
                        {/* 배송용 엑셀 (번호·상품명·성함·금액·연락처·주소·택배사·운송장) */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-full bg-card"
                          disabled={loadingParts}
                          onClick={async () => {
                            // 클릭 시점에 최신 명단을 서버에서 다시 받아 생성 (화면 캐시 X)
                            try {
                              const fresh = await utils.campaign.campaignParticipants.fetch({ campaignId: c.id });
                              const active = (fresh ?? []).filter(p => p.status !== "rejected");
                              downloadDeliveryExcel(c.title, active.map(p => ({
                                name: p.reviewer?.fullName ?? "-",
                                productTitle: c.title,
                                productPrice: c.productPrice,
                                phone: p.reviewer?.phone ?? "-",
                                address: p.reviewer?.address ?? "-",
                              })));
                            } catch {
                              toast.error("최신 명단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
                            }
                          }}
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> 엑셀 다운로드
                        </Button>

                        {/* 송장 채운 엑셀 업로드 (회차별 누적) */}
                        <input
                          id={`invoice-upload-biz-${c.id}`}
                          type="file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) onPickInvoice(c.id, f); e.target.value = ""; }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-full bg-card"
                          disabled={uploadInvoice.isPending}
                          onClick={() => document.getElementById(`invoice-upload-biz-${c.id}`)?.click()}
                        >
                          <Upload className="h-3.5 w-3.5 text-primary" /> 송장 엑셀 업로드
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-full bg-card"
                          onClick={() => setInvoiceListFor({ campaignId: c.id, title: c.title })}
                        >
                          <Download className="h-3.5 w-3.5" /> 업로드 목록
                        </Button>
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
                        {/* 사진 리뷰 ZIP 다시 업로드 → 기존 배정 초기화 후 새 사진으로 재배정 */}
                        <input
                          id={`photozip-reupload-${c.id}`}
                          type="file"
                          accept=".zip"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) reuploadPhotoZip(c.id, f); e.target.value = ""; }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-full bg-card"
                          disabled={reuploadingId === c.id}
                          onClick={() => document.getElementById(`photozip-reupload-${c.id}`)?.click()}
                        >
                          {reuploadingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderArchive className="h-3.5 w-3.5 text-primary" />}
                          {c.hasPhotoGuideZip ? "사진 다시 업로드" : "사진 ZIP 업로드"}
                        </Button>
                        </div>
                      </div>

                      {/* 배분 캠페인: 날짜별 모집 인원 현황 */}
                      {(() => {
                        const sched = parseSchedule(c.schedule);
                        if (sched.length === 0) return null;
                        const takenByDate: Record<string, number> = {};
                        for (const p of participants ?? []) {
                          if (p.status !== "rejected" && p.assignedDate) {
                            takenByDate[p.assignedDate] = (takenByDate[p.assignedDate] || 0) + 1;
                          }
                        }
                        return (
                          <div className="mb-4 rounded-xl border border-border/60 bg-card p-3">
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-foreground">
                              <CalendarDays className="h-3.5 w-3.5 text-primary" /> 모집 일정 <span className="font-normal text-muted-foreground">(날짜별 모집/참여)</span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {sched.map(([d, cap]) => {
                                const taken = takenByDate[d] ?? 0;
                                const isToday = d === TODAY_STR;
                                const full = taken >= cap;
                                return (
                                  <span
                                    key={d}
                                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                      isToday
                                        ? "border-primary bg-primary/10 text-primary"
                                        : full
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-border bg-muted/40 text-muted-foreground"
                                    }`}
                                  >
                                    {mmdd(d)} · {loadingParts ? `${cap}명` : `${taken}/${cap}명`}
                                    {isToday && <span className="font-bold">오늘</span>}
                                    {!isToday && full && "✓"}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

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
                                <th className="pb-2 pr-4 text-left font-medium">원고</th>
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
                                  <td className="py-2.5 pr-4">
                                    {p.reviewDraft ? (
                                      <button
                                        type="button"
                                        onClick={() => setDraftEdit({ pid: p.id, name: p.reviewer?.fullName ?? "리뷰어", draft: p.reviewDraft!, qc: p.reviewDraftQc })}
                                        className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-card px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                                      >
                                        <FileText className="h-3.5 w-3.5" /> 보기·수정
                                      </button>
                                    ) : <span className="text-xs text-muted-foreground">-</span>}
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

      {/* 송장 엑셀 업로드 이력 목록 */}
      <InvoiceListDialog target={invoiceListFor} onClose={() => setInvoiceListFor(null)} onDownload={downloadUploadedInvoice} />

      {/* 리뷰어 배정 원고 보기·수정 */}
      <Dialog open={draftEdit !== null} onOpenChange={o => !o && setDraftEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {draftEdit?.name} 님에게 배정된 리뷰 원고
              <QcBadge qc={draftEdit?.qc} />
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={draftEdit?.draft ?? ""}
            onChange={e => setDraftEdit(v => (v ? { ...v, draft: e.target.value } : v))}
            className="max-h-[55vh] min-h-56 text-sm leading-relaxed"
            maxLength={4000}
          />
          <Button className="w-full font-bold" disabled={saveDraft.isPending || !draftEdit?.draft.trim()}
            onClick={() => draftEdit && saveDraft.mutate({ participationId: draftEdit.pid, reviewDraft: draftEdit.draft.trim() })}>
            {saveDraft.isPending ? "저장 중..." : "원고 저장"}
          </Button>
        </DialogContent>
      </Dialog>

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

/** 캠페인의 송장 엑셀 업로드 이력 — 날짜·파일명 목록에서 각각 다운로드. */
function InvoiceListDialog({
  target,
  onClose,
  onDownload,
}: {
  target: { campaignId: number; title: string } | null;
  onClose: () => void;
  onDownload: (id: number) => void;
}) {
  const { data: files, isLoading } = trpc.campaign.listInvoiceExcels.useQuery(
    { campaignId: target?.campaignId ?? 0 },
    { enabled: target !== null },
  );
  return (
    <Dialog open={target !== null} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">송장 엑셀 업로드 목록</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 truncate text-sm text-muted-foreground">{target?.title}</p>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : !files || files.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            아직 업로드된 송장 엑셀이 없습니다.<br />"송장 엑셀 업로드" 버튼으로 올리면 여기에 쌓여요.
          </p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {files.map(f => (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(f.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 업로드
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 bg-card" onClick={() => onDownload(f.id)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> 다운로드
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
