import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { ExternalLink, Rocket } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  new: "신규 접수",
  contacted: "연락 완료",
  done: "처리 완료",
};
const STATUS_BADGE: Record<string, string> = {
  new: "bg-amber-100 text-amber-700",
  contacted: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
};
const NEXT_STATUS: Record<string, "new" | "contacted" | "done"> = {
  new: "contacted",
  contacted: "done",
  done: "new",
};

export default function AdminConsulting() {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.consulting.list.useQuery(undefined, { refetchInterval: 15000 });

  const setStatus = trpc.consulting.setStatus.useMutation({
    onSuccess: () => {
      utils.consulting.list.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const newCount = data.filter(r => r.status === "new").length;

  return (
    <AdminLayout
      title="상위노출 문의"
      description="셀러가 신청한 상위노출 컨설팅 의뢰를 관리합니다."
      actions={
        newCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
            신규 {newCount}건
          </span>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Rocket className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">접수된 상위노출 문의가 없습니다</p>
          <p className="text-sm text-muted-foreground">셀러가 의뢰를 남기면 여기에 쌓입니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map(r => (
            <div
              key={r.id}
              className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{r.seller?.fullName ?? "알 수 없음"}</span>
                    {r.seller?.memberCode && r.seller.memberCode !== "-" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                        {r.seller.memberCode}
                      </span>
                    )}
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                      {r.platform}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.seller?.loginId} · {r.seller?.phone} ·{" "}
                    {r.createdAt ? new Date(r.createdAt).toLocaleString("ko-KR") : "-"}
                  </p>
                </div>

                <button
                  onClick={() => setStatus.mutate({ id: r.id, status: NEXT_STATUS[r.status] })}
                  disabled={setStatus.isPending}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-opacity hover:opacity-80 ${STATUS_BADGE[r.status]}`}
                  title="클릭하면 상태가 변경됩니다"
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Field label="목표 키워드" value={r.targetKeyword} strong />
                <Field label="현재 순위" value={r.currentRank} />
                <Field
                  label="상품 URL"
                  value={
                    r.productUrl ? (
                      <a
                        href={r.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline break-all"
                      >
                        {r.productUrl} <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : null
                  }
                />
                <Field label="희망 예산" value={r.budget} />
              </div>

              {r.memo && (
                <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm text-foreground">
                  <span className="font-semibold text-muted-foreground">추가 요청 · </span>
                  {r.memo}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

function Field({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-words ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>
        {value || <span className="text-muted-foreground">-</span>}
      </span>
    </div>
  );
}
