import AdminLayout from "@/components/AdminLayout";
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
import { CheckCircle2, Inbox, Phone, Wallet, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "applied", label: "참여 신청" },
  { value: "purchased", label: "구매 인증" },
  { value: "reviewed", label: "리뷰 인증" },
  { value: "approved", label: "지급 확정" },
  { value: "paid", label: "입금 완료" },
  { value: "rejected", label: "반려" },
];

export default function AdminParticipations() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.participation.listAll.useQuery(undefined);
  const [filter, setFilter] = useState("all");

  const setStatusMutation = trpc.participation.setStatus.useMutation({
    onSuccess: () => {
      utils.participation.listAll.invalidate();
      toast.success("상태가 변경되었습니다.");
    },
    onError: err => toast.error(err.message),
  });

  const rows = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data;
    return data.filter(r => r.status === filter);
  }, [data, filter]);

  const act = (participationId: number, status: ParticipationStatus) =>
    setStatusMutation.mutate({ participationId, status });

  return (
    <AdminLayout
      title="참여 현황"
      description="리뷰어의 참여 진행 상태를 확인하고 인증을 검수해 지급을 처리합니다."
      actions={
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map(f => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">해당 상태의 참여 내역이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(r => {
            const status = r.status as ParticipationStatus;
            const payout = r.campaign
              ? totalPayout(r.campaign.productPrice, r.campaign.commission)
              : 0;
            return (
              <div
                key={r.id}
                className="grid gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm md:grid-cols-[1fr_auto]"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                    <h3 className="font-bold">{r.campaign?.title ?? "삭제된 캠페인"}</h3>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      리뷰어: <b className="text-foreground">{r.user?.fullName ?? "-"}</b> ({r.user?.loginId ?? "-"})
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {r.user?.phone ?? "-"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5" /> 지급 예정 {formatKRW(payout)}
                    </span>
                  </div>

                  <div className="grid max-w-md grid-cols-2 gap-3">
                    <ProofThumb url={r.purchaseProofUrl} label="구매 인증샷" />
                    <ProofThumb url={r.reviewProofUrl} label="리뷰 인증샷" />
                  </div>
                </div>

                {/* Action column */}
                <div className="flex flex-col gap-2 md:w-44">
                  {status === "reviewed" && (
                    <Button
                      size="sm"
                      disabled={setStatusMutation.isPending}
                      onClick={() => act(r.id, "approved")}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> 지급 확정
                    </Button>
                  )}
                  {status === "approved" && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={setStatusMutation.isPending}
                      onClick={() => act(r.id, "paid")}
                    >
                      <Wallet className="mr-1.5 h-4 w-4" /> 입금 완료 처리
                    </Button>
                  )}
                  {status === "paid" && (
                    <span className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">
                      정산 완료된 건입니다
                    </span>
                  )}
                  {(status === "purchased") && (
                    <span className="rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                      리뷰 인증 대기 중
                    </span>
                  )}
                  {(status === "applied") && (
                    <span className="rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                      구매 인증 대기 중
                    </span>
                  )}
                  {status !== "paid" && status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-card text-destructive hover:text-destructive"
                      disabled={setStatusMutation.isPending}
                      onClick={() => act(r.id, "rejected")}
                    >
                      <XCircle className="mr-1.5 h-4 w-4" /> 반려
                    </Button>
                  )}
                  {status === "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-card"
                      disabled={setStatusMutation.isPending}
                      onClick={() => act(r.id, "applied")}
                    >
                      반려 취소
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
