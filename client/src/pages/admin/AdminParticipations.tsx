import AdminLayout from "@/components/AdminLayout";
import { ProofThumb } from "@/components/ProofThumb";
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
import { participationDeadline } from "@shared/const";
import { CalendarPlus, CheckCircle2, ChevronDown, ChevronRight, Download, FileSpreadsheet, FolderArchive, Inbox, MessageCircle, Phone, Trash2, Upload, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { downloadDeliveryExcel } from "@/lib/deliveryExcel";

/** listAll 응답 중 참여자 목록 렌더에 필요한 필드 (경량 페이로드 + 인증샷 존재 플래그). */
/** 배정된 리뷰 유형 배지 라벨. */
const REVIEW_TYPE_LABEL: Record<string, string> = {
  photo: "📷 사진",
  text: "✍️ 글자",
  star: "⭐ 별점",
};

type ListRow = {
  id: number;
  campaignId: number;
  status: string;
  reviewType?: string | null;
  appliedAt: Date | string;
  deadlineAt?: Date | string | null;
  hasSearchProof: boolean;
  hasPurchaseProof: boolean;
  hasReviewProof: boolean;
  campaign: { id: number; title: string; productPrice: number; commission: number; invoiceExcelName?: string | null } | null;
  user: { id: number; fullName: string | null; loginId: string | null; phone: string | null; address: string | null } | null;
};

/** 캠페인 그룹의 참여자 행들. 인증샷(무거움)은 이 컴포넌트가 뜰 때(=펼침) 캠페인 단위로 따로 불러온다. */
function CampaignRows({ campaignId, rows, dmUnreadSet, act, actPending, removePending, onRemove }: {
  campaignId: number;
  rows: ListRow[];
  dmUnreadSet: Set<number>;
  act: (participationId: number, status: ParticipationStatus) => void;
  actPending: boolean;
  removePending: boolean;
  onRemove: (target: { id: number; name: string }) => void;
}) {
  const { data: proofs, isLoading: proofsLoading } = trpc.participation.proofsByCampaign.useQuery({ campaignId });
  const proofMap = useMemo(() => new Map((proofs ?? []).map(p => [p.id, p])), [proofs]);

  // 인증샷 반려 — 확대 보기에서 반려 클릭 → 확인 후 해당 인증샷 삭제·단계 롤백
  const utils = trpc.useUtils();
  const [proofReject, setProofReject] = useState<{ id: number; kind: "search" | "purchase" | "review"; label: string; name: string } | null>(null);
  const rejectProof = trpc.participation.rejectProof.useMutation({
    onSuccess: () => {
      utils.participation.listAll.invalidate();
      utils.participation.proofsByCampaign.invalidate({ campaignId });
      toast.success("인증샷을 반려했어요. 리뷰어에게 재등록 안내를 보냈습니다.");
    },
    onError: e => toast.error(e.message),
  });

  // 기한 초과 참여 연장 (7일)
  const extendDeadline = trpc.participation.extendDeadline.useMutation({
    onSuccess: () => {
      utils.participation.listAll.invalidate();
      toast.success("제출 기한을 7일 연장하고 리뷰어에게 안내를 보냈습니다.");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="divide-y divide-border/60 border-t border-border/60">
      {rows.map(r => {
        const status = r.status as ParticipationStatus;
        const payout = r.campaign ? totalPayout(r.campaign.productPrice, r.campaign.commission) : 0;
        const pf = proofMap.get(r.id);
        const waitingProofs = proofsLoading && (r.hasSearchProof || r.hasPurchaseProof || r.hasReviewProof);
        // 제출 기한 (참여 후 7일) — 진행 중 단계에서만 의미 있음
        const deadlineActive = ["applied", "searched", "purchased"].includes(status);
        const deadline = participationDeadline(r.appliedAt, r.deadlineAt);
        const expired = deadlineActive && deadline.getTime() < Date.now();
        return (
          <div key={r.id} className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
                {r.reviewType && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                    {REVIEW_TYPE_LABEL[r.reviewType] ?? r.reviewType} 배정
                  </span>
                )}
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
                  {deadlineActive && (
                    expired ? (
                      <span className="font-bold text-red-600">⏰ 제출 기한 초과</span>
                    ) : (
                      <span>기한 {deadline.getMonth() + 1}/{deadline.getDate()}</span>
                    )
                  )}
                </div>
              </div>

              {waitingProofs ? (
                <div className="grid max-w-lg grid-cols-3 gap-3">
                  {[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
                </div>
              ) : (
                <div className="grid max-w-lg grid-cols-3 gap-3">
                  <ProofThumb url={pf?.searchProofUrl} label="검색 인증샷" time={pf?.searchedAt}
                    onReject={() => setProofReject({ id: r.id, kind: "search", label: "검색 인증샷", name: r.user?.fullName ?? "리뷰어" })} />
                  <ProofThumb url={pf?.purchaseProofUrl} label="구매 인증샷" time={pf?.purchasedAt}
                    onReject={() => setProofReject({ id: r.id, kind: "purchase", label: "구매 인증샷", name: r.user?.fullName ?? "리뷰어" })} />
                  <ProofThumb url={pf?.reviewProofUrl} label="리뷰 인증샷" time={pf?.reviewedAt}
                    onReject={() => setProofReject({ id: r.id, kind: "review", label: "리뷰 인증샷", name: r.user?.fullName ?? "리뷰어" })} />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 md:w-44">
              {status === "reviewed" && (
                <Button size="sm" disabled={actPending} onClick={() => act(r.id, "approved")}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> 지급 확정
                </Button>
              )}
              {status === "approved" && (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={actPending} onClick={() => act(r.id, "paid")}>
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
              {status === "rejected" && (
                <Button size="sm" variant="outline" className="bg-card" disabled={actPending} onClick={() => act(r.id, "applied")}>
                  반려 취소
                </Button>
              )}
              {expired && (
                <Button size="sm" variant="outline" className="bg-card" disabled={extendDeadline.isPending}
                  onClick={() => extendDeadline.mutate({ participationId: r.id })}>
                  <CalendarPlus className="mr-1.5 h-4 w-4" /> 기한 7일 연장
                </Button>
              )}
              {status !== "paid" && (
                <Button size="sm" variant="outline" className="bg-card text-destructive hover:text-destructive" disabled={removePending}
                  onClick={() => onRemove({ id: r.id, name: r.user?.fullName ?? "리뷰어" })}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> 삭제
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="relative bg-card"
                disabled={!r.user?.id}
                onClick={() => r.user?.id && window.dispatchEvent(
                  new CustomEvent("open-dm", { detail: { reviewerId: r.user.id, reviewerName: r.user.fullName } })
                )}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" /> 채팅
                {dmUnreadSet.has(r.user?.id ?? -1) && (
                  <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500" />
                )}
              </Button>
            </div>
          </div>
        );
      })}

      {/* 인증샷 반려 확인 */}
      <AlertDialog open={proofReject !== null} onOpenChange={o => !o && setProofReject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{proofReject?.label}을 반려할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{proofReject?.name}</span> 님의 {proofReject?.label}이
              삭제되고 해당 단계부터 다시 진행해야 합니다. 리뷰어에게는 운영팀 채팅으로
              재등록 안내가 자동 발송됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectProof.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={rejectProof.isPending}
              onClick={() => {
                if (proofReject) rejectProof.mutate({ participationId: proofReject.id, kind: proofReject.kind });
                setProofReject(null);
              }}
            >
              반려하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
  // 필터 드롭다운용 — 썸네일까지 실려 오는 campaign.listAll 대신 id·제목만 가볍게.
  const { data: campaigns } = trpc.campaign.titles.useQuery();

  const [campaignFilter, setCampaignFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<number>>(new Set());

  // DM unread counts per reviewer (for chat buttons)
  const { data: dmConvs = [] } = trpc.directMessage.conversations.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const dmUnreadSet = useMemo(
    () => new Set(dmConvs.filter(c => c.unread > 0).map(c => c.reviewerId)),
    [dmConvs]
  );

  const setStatusMutation = trpc.participation.setStatus.useMutation({
    onSuccess: () => {
      utils.participation.listAll.invalidate();
      toast.success("상태가 변경되었습니다.");
    },
    onError: err => toast.error(err.message),
  });

  const act = (participationId: number, status: ParticipationStatus) =>
    setStatusMutation.mutate({ participationId, status });

  // 참여 삭제 — 반려와 달리 행을 지워 자리를 즉시 회수한다 (확인 다이얼로그 후 실행).
  const [removeTarget, setRemoveTarget] = useState<{ id: number; name: string } | null>(null);
  const removeMutation = trpc.participation.remove.useMutation({
    onSuccess: () => {
      utils.participation.listAll.invalidate();
      toast.success("참여를 삭제했어요. 자리가 다시 열렸습니다.");
    },
    onError: err => toast.error(err.message),
  });

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

  /** 캠페인별 참여 리뷰어 엑셀 다운로드 (업체 배송용 — 공용 빌더 사용). */
  const downloadExcel = (group: { campaignId: number; title: string; rows: typeof filtered }) => {
    const active = group.rows.filter(r => r.status !== "rejected");
    downloadDeliveryExcel(group.title, active.map(r => ({
      name: r.user?.fullName ?? "-",
      productTitle: r.campaign?.title ?? group.title,
      productPrice: r.campaign?.productPrice ?? 0,
      phone: r.user?.phone ?? "-",
      address: r.user?.address ?? "-",
    })));
  };

  // 송장 채운 엑셀 업로드/다운로드 (수동)
  const uploadInvoice = trpc.campaign.uploadInvoiceExcel.useMutation({
    onSuccess: () => {
      utils.participation.listAll.invalidate();
      toast.success("송장 엑셀을 업로드했어요.");
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
  const downloadUploadedInvoice = async (campaignId: number) => {
    const res = await utils.campaign.getInvoiceExcel.fetch({ campaignId });
    if (!res) { toast.error("업로드된 엑셀이 없어요."); return; }
    const a = document.createElement("a");
    a.href = res.dataUrl;
    a.download = res.name;
    a.click();
  };

  // 사진 리뷰 ZIP 재업로드 (관리자) — 사진이 유실된 캠페인 복구용. 배정 초기화 후 새 사진으로 재배정.
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
        if (file.size > 45 * 1024 * 1024) throw e;
        base64 = await new Promise<string>((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result));
          rd.onerror = rej;
          rd.readAsDataURL(file);
        });
      }
      const r = await replaceZip.mutateAsync({ campaignId, photoGuideZipKey: key, photoGuideZip: base64, fileName: file.name });
      utils.participation.listAll.invalidate();
      utils.participation.proofsByCampaign.invalidate({ campaignId });
      toast.success(`사진을 다시 업로드했어요! ${r.assigned}명 재배정 (유닛 ${r.units}개)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "사진 재업로드에 실패했어요.");
    } finally {
      setReuploadingId(null);
    }
  };

  const toggleCampaign = (id: number) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 기본은 모두 접힌 상태 — 캠페인 헤더를 클릭해야 참여자 목록이 펼쳐진다.
  // (자동 펼침을 없애 인증샷 지연 로딩도 클릭 시에만 발생)

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
                {/* 캠페인 헤더 — 모바일: 제목 줄 + 버튼 줄로 감싸 내려 제목이 짜부라지지 않게 */}
                <div className="flex flex-wrap items-center gap-2 px-4 py-3.5 hover:bg-muted/40 transition-colors sm:px-5">
                  <button
                    className="flex w-full min-w-0 items-center justify-between gap-3 text-left sm:w-auto sm:flex-1"
                    onClick={() => toggleCampaign(group.campaignId)}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <span className="truncate font-bold text-foreground">{group.title}</span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {group.rows.length}명
                      </span>
                    </div>
                    <span className="hidden text-xs text-muted-foreground shrink-0 sm:inline">
                      완료 {group.rows.filter(r => r.status === "paid").length} / 확정 {group.rows.filter(r => r.status === "approved").length} / 검수중 {group.rows.filter(r => r.status === "reviewed").length}
                    </span>
                  </button>
                  {/* 1) 자동 생성 다운로드  2) 송장 채운 엑셀 수동 업로드 */}
                  <Button size="sm" variant="outline" className="shrink-0 bg-card" onClick={() => downloadExcel(group)}>
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> 엑셀 다운로드
                  </Button>
                  <input
                    id={`invoice-upload-${group.campaignId}`}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) onPickInvoice(group.campaignId, f); e.target.value = ""; }}
                  />
                  <Button size="sm" variant="outline" className="shrink-0 bg-card" disabled={uploadInvoice.isPending}
                    onClick={() => document.getElementById(`invoice-upload-${group.campaignId}`)?.click()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5 text-primary" /> 엑셀 업로드
                  </Button>
                  {group.rows[0]?.campaign?.invoiceExcelName && (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => downloadUploadedInvoice(group.campaignId)}>
                      <Download className="mr-1.5 h-3.5 w-3.5" /> 업로드본
                    </Button>
                  )}
                  {/* 사진 유실 복구: 새 ZIP 업로드 → 배정 초기화 후 재배정 */}
                  <input
                    id={`photozip-admin-${group.campaignId}`}
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) reuploadPhotoZip(group.campaignId, f); e.target.value = ""; }}
                  />
                  <Button size="sm" variant="outline" className="shrink-0 bg-card" disabled={reuploadingId === group.campaignId}
                    onClick={() => document.getElementById(`photozip-admin-${group.campaignId}`)?.click()}>
                    <FolderArchive className="mr-1.5 h-3.5 w-3.5 text-amber-600" />
                    {reuploadingId === group.campaignId ? "업로드 중..." : "사진 재업로드"}
                  </Button>
                </div>

                {/* 참여자 목록 — 인증샷은 펼쳤을 때만 지연 로딩 */}
                {isOpen && (
                  <CampaignRows
                    campaignId={group.campaignId}
                    rows={group.rows}
                    dmUnreadSet={dmUnreadSet}
                    act={act}
                    actPending={setStatusMutation.isPending}
                    removePending={removeMutation.isPending}
                    onRemove={setRemoveTarget}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 참여 삭제 확인 */}
      <AlertDialog open={removeTarget !== null} onOpenChange={o => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>참여를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{removeTarget?.name}</span> 님의 참여 내역이 완전히
              삭제되고, 그 자리가 비워져 다른 리뷰어가 바로 참여할 수 있게 됩니다. 배정됐던 사진 묶음도
              다음 참여자에게 다시 배정돼요. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMutation.isPending}
              onClick={() => {
                if (removeTarget) removeMutation.mutate({ participationId: removeTarget.id });
                setRemoveTarget(null);
              }}
            >
              삭제하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
