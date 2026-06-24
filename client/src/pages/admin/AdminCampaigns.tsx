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
import { ImageOff, Megaphone, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminCampaigns() {
  const utils = trpc.useUtils();
  const { data: campaigns, isLoading } = trpc.campaign.listAll.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<CampaignFormValue> | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

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
        <Button onClick={openCreate} className="rounded-full">
          <Plus className="mr-1.5 h-4 w-4" /> 새 캠페인
        </Button>
      }
    >
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map(c => (
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
                    c.status === "open" ? "bg-primary text-primary-foreground shadow-sm"
                    : c.status === "pending" ? "bg-yellow-400 text-yellow-900"
                    : c.status === "rejected" ? "bg-destructive/80 text-white"
                    : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.status === "open" ? "모집 중"
                    : c.status === "pending" ? "승인 대기"
                    : c.status === "rejected" ? "반려"
                    : "마감"}
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-card"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> 수정
                    </Button>
                    <Button
                      variant={c.status === "open" ? "ghost" : "default"}
                      size="sm"
                      className="flex-1"
                      disabled={setStatusMutation.isPending}
                      onClick={() =>
                        setStatusMutation.mutate({
                          id: c.id,
                          status: c.status === "open" ? "closed" : "open",
                        })
                      }
                    >
                      {c.status === "open" ? "모집 마감" : "모집 재개"}
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
            <AlertDialogTitle>캐페인을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.title}</span> 캐페인과
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
    </AdminLayout>
  );
}
