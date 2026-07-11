import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatKRW } from "@/lib/workflow";
import {
  CheckSquare,
  Download,
  Loader2,
  Receipt,
  Square,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function AdminSettlement() {
  const utils = trpc.useUtils();
  // 탭: 정산 대기(approved) / 입금 완료(paid) — 완료 건도 계좌 정보가 계속 보이게.
  const [tab, setTab] = useState<"approved" | "paid">("approved");
  const { data = [], isLoading } = trpc.admin.settlementList.useQuery({ status: tab });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const setStatusMutation = trpc.participation.setStatus.useMutation({
    onSuccess: (_d, vars) => {
      utils.admin.settlementList.invalidate();
      utils.participation.listAll.invalidate();
      setSelected(new Set());
      toast.success(vars.status === "paid" ? "입금 완료 처리되었습니다." : "정산 대기로 되돌렸습니다.");
    },
    onError: err => toast.error(err.message),
  });

  const allIds = data.map(r => r.participationId);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedRows = useMemo(() => data.filter(r => selected.has(r.participationId)), [data, selected]);

  const totalPayout = useMemo(
    () => selectedRows.reduce((sum, r) => sum + r.payout, 0),
    [selectedRows]
  );

  const handlePayAll = () => {
    if (!someSelected) return;
    Promise.all(
      Array.from(selected).map(id =>
        setStatusMutation.mutateAsync({ participationId: id, status: "paid" })
      )
    ).catch(() => {});
  };

  // 입금 완료 탭: 실수로 완료 처리한 건을 정산 대기로 되돌린다.
  const handleUnpayAll = () => {
    if (!someSelected) return;
    Promise.all(
      Array.from(selected).map(id =>
        setStatusMutation.mutateAsync({ participationId: id, status: "approved" })
      )
    ).catch(() => {});
  };

  const switchTab = (t: "approved" | "paid") => {
    setTab(t);
    setSelected(new Set());
  };

  const handleExcel = () => {
    const rows = someSelected ? selectedRows : data;
    if (rows.length === 0) {
      toast.error("다운로드할 데이터가 없습니다.");
      return;
    }

    const wsData = [
      ["이름", "회원 코드", "캠페인", "은행명", "계좌번호", "예금주", "지급액(원)", "지급확정일"],
      ...rows.map(r => [
        r.user?.fullName ?? "-",
        r.user?.memberCode ?? "-",
        r.campaignTitle,
        r.user?.bankName ?? "-",
        r.user?.bankAccount ?? "-",
        r.user?.bankHolder ?? "-",
        r.payout,
        r.approvedAt ? new Date(r.approvedAt).toLocaleDateString("ko-KR") : "-",
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws["!cols"] = [
      { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 12 },
      { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "정산목록");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `아르벤팩토리_정산목록_${date}.xlsx`);
    toast.success("엑셀 파일이 다운로드됩니다.");
  };

  return (
    <AdminLayout
      title="정산 관리"
      description="지급 확정된 리뷰어의 계좌를 확인하고 입금 완료 처리합니다."
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="bg-card gap-1.5"
            onClick={handleExcel}
          >
            <Download className="h-4 w-4" />
            엑셀 다운로드{someSelected ? ` (${selected.size}건)` : ""}
          </Button>
          {someSelected && tab === "approved" && (
            <Button
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              disabled={setStatusMutation.isPending}
              onClick={handlePayAll}
            >
              {setStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Wallet className="h-4 w-4" />
              입금 완료 처리 ({selected.size}건, {formatKRW(totalPayout)})
            </Button>
          )}
          {someSelected && tab === "paid" && (
            <Button
              variant="outline"
              className="gap-1.5 bg-card"
              disabled={setStatusMutation.isPending}
              onClick={handleUnpayAll}
            >
              {setStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              정산 대기로 되돌리기 ({selected.size}건)
            </Button>
          )}
        </div>
      }
    >
      {/* 정산 대기 / 입금 완료 탭 */}
      <div className="mb-4 flex gap-2">
        {([["approved", "정산 대기"], ["paid", "입금 완료"]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => switchTab(v)}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-all ${
              tab === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`}>
            {label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Receipt className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">{tab === "approved" ? "지급 확정 대기 중인 정산이 없습니다" : "입금 완료된 정산이 없습니다"}</p>
          <p className="text-sm text-muted-foreground">
            {tab === "approved"
              ? "참여 현황에서 '지급 확정' 처리를 하면 여기에 표시됩니다. 이미 입금 완료했다면 '입금 완료' 탭에서 볼 수 있어요."
              : "정산 대기 탭에서 입금 완료 처리하면 여기로 이동합니다."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[40px_1fr_1fr_2fr_1fr_1fr_1fr_1fr] items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
            <div className="flex items-center justify-center">
              <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                {allSelected
                  ? <CheckSquare className="h-4 w-4 text-primary" />
                  : <Square className="h-4 w-4" />
                }
              </button>
            </div>
            <div>이름</div>
            <div>코드</div>
            <div>캠페인</div>
            <div>은행</div>
            <div>계좌번호</div>
            <div>예금주</div>
            <div className="text-right">지급액</div>
          </div>

          {/* 행 */}
          <div className="divide-y divide-border/50">
            {data.map(r => {
              const isChecked = selected.has(r.participationId);
              return (
                <div
                  key={r.participationId}
                  className={`grid grid-cols-[40px_1fr_1fr_2fr_1fr_1fr_1fr_1fr] items-center gap-3 px-4 py-3.5 text-sm transition-colors ${
                    isChecked ? "bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => toggleOne(r.participationId)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {isChecked
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />
                      }
                    </button>
                  </div>
                  <div className="font-medium text-foreground">
                    {r.user?.fullName ?? "-"}
                    {tab === "paid" && r.paidAt && (
                      <p className="text-[11px] font-normal text-muted-foreground">
                        입금 {new Date(r.paidAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono font-medium text-muted-foreground">
                      {r.user?.memberCode ?? "-"}
                    </span>
                  </div>
                  <div className="truncate text-muted-foreground">{r.campaignTitle}</div>
                  <div className="text-muted-foreground">{r.user?.bankName ?? "-"}</div>
                  <div className="font-mono text-xs text-foreground">{r.user?.bankAccount ?? "-"}</div>
                  <div className="text-muted-foreground">{r.user?.bankHolder ?? "-"}</div>
                  <div className="text-right font-semibold text-emerald-600">
                    {formatKRW(r.payout)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 합계 푸터 */}
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              총 {data.length}건
              {someSelected && ` · 선택 ${selected.size}건`}
            </span>
            <span className="font-bold text-foreground">
              {someSelected
                ? `선택 합계 ${formatKRW(totalPayout)}`
                : `전체 합계 ${formatKRW(data.reduce((s, r) => s + r.payout, 0))}`
              }
            </span>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
