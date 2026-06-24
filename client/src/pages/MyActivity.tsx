import { useAuth } from "@/_core/hooks/useAuth";
import { ChatDialog } from "@/components/ChatDialog";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { ImageUploader } from "@/components/ImageUploader";
import SiteHeader from "@/components/SiteHeader";
import WorkflowStepper from "@/components/WorkflowStepper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  formatKRW,
  ParticipationStatus,
  STATUS_BADGE,
  STATUS_LABEL,
  totalPayout,
} from "@/lib/workflow";
import {
  ClipboardList,
  ImageIcon,
  MessageCircle,
  PackageCheck,
  PencilLine,
  Search,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type ProofKind = "search" | "purchase" | "review";

export default function MyActivity() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: parts, isLoading, isError, refetch } = trpc.participation.mine.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { user } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { window.location.href = "/afreviewer/login"; return; }
    if (user?.role === "business") { window.location.href = "/client/dashboard"; return; }
  }, [authLoading, isAuthenticated, user?.role]);

  const partIds = (parts ?? []).map(p => p.id);
  const unreadChats = useChatNotifications(partIds);

  const [uploadFor, setUploadFor] = useState<{ id: number; kind: ProofKind; keyword?: string } | null>(null);
  const [chatTarget, setChatTarget] = useState<{ participationId: number; title: string } | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  const searchMutation = trpc.participation.submitSearchProof.useMutation({
    onSuccess: () => {
      utils.participation.mine.invalidate();
      toast.success("검색 인증샷이 등록되었습니다.");
      closeUpload();
    },
    onError: err => toast.error(err.message),
  });
  const purchaseMutation = trpc.participation.submitPurchaseProof.useMutation({
    onSuccess: () => {
      utils.participation.mine.invalidate();
      toast.success("구매 인증샷이 등록되었습니다.");
      closeUpload();
    },
    onError: err => toast.error(err.message),
  });
  const reviewMutation = trpc.participation.submitReviewProof.useMutation({
    onSuccess: () => {
      utils.participation.mine.invalidate();
      toast.success("리뷰 인증샷이 등록되었습니다.");
      closeUpload();
    },
    onError: err => toast.error(err.message),
  });

  const closeUpload = () => {
    setUploadFor(null);
    setProofUrl(null);
  };

  const submitProof = () => {
    if (!uploadFor || !proofUrl) {
      toast.error("이미지를 먼저 업로드해 주세요.");
      return;
    }
    if (uploadFor.kind === "search") {
      searchMutation.mutate({ participationId: uploadFor.id, proofUrl });
    } else if (uploadFor.kind === "purchase") {
      purchaseMutation.mutate({ participationId: uploadFor.id, proofUrl });
    } else {
      reviewMutation.mutate({ participationId: uploadFor.id, proofUrl });
    }
  };

  const pending = searchMutation.isPending || purchaseMutation.isPending || reviewMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <SiteHeader />

      <main className="container max-w-4xl py-10">
        <div className="mb-8 flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <ClipboardList className="h-3.5 w-3.5" /> 내 활동
          </span>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">참여 진행 현황</h1>
          <p className="text-muted-foreground">
            참여한 캠페인의 진행 단계를 확인하고 구매·리뷰 인증샷을 등록하세요.
          </p>
        </div>

        {isLoading || authLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border/70 bg-card py-20 text-center">
            <p className="font-semibold">참여 내역을 불러오지 못했습니다</p>
            <p className="text-sm text-muted-foreground">잠시 후 다시 시도해 주세요.</p>
            <Button variant="outline" className="mt-1 bg-card" onClick={() => refetch()}>
              다시 시도
            </Button>
          </div>
        ) : !parts || parts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border/70 bg-card py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ClipboardList className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">아직 참여한 캠페인이 없습니다</p>
            <p className="text-sm text-muted-foreground">캠페인을 둘러보고 첫 참여를 시작해 보세요.</p>
            <Link href="/campaigns">
              <Button className="mt-1 rounded-full font-semibold">캠페인 둘러보기</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {parts.map(p => {
              const status = p.status as ParticipationStatus;
              const c = p.campaign;
              return (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm"
                >
                  <div className="flex flex-col gap-4 p-5 sm:flex-row">
                    <div className="h-28 w-full shrink-0 overflow-hidden rounded-2xl bg-muted sm:w-36">
                      {c?.thumbnailUrl ? (
                        <img src={c.thumbnailUrl} alt={c.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-7 w-7" />
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-snug text-foreground">
                          {c?.title ?? "삭제된 캠페인"}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}
                        >
                          {STATUS_LABEL[status]}
                        </span>
                      </div>
                      {c && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Search className="h-3.5 w-3.5 text-primary" /> {c.keyword}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Wallet className="h-3.5 w-3.5 text-primary" />
                            {formatKRW(totalPayout(c.productPrice, c.commission))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border/60 px-5 py-4">
                    <WorkflowStepper status={status} />
                  </div>

                  {/* Action area based on status */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-secondary/30 px-5 py-3">
                    {status === "applied" && (
                      <Button
                        size="sm"
                        onClick={() => setUploadFor({ id: p.id, kind: "search", keyword: c?.keyword })}
                      >
                        <Search className="mr-1.5 h-4 w-4" /> 검색 인증샷 등록
                      </Button>
                    )}
                    {status === "searched" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setUploadFor({ id: p.id, kind: "purchase", keyword: c?.keyword })}
                        >
                          <PackageCheck className="mr-1.5 h-4 w-4" /> 구매 인증샷 등록
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-card"
                          onClick={() => setUploadFor({ id: p.id, kind: "search", keyword: c?.keyword })}
                        >
                          검색 인증샷 다시 등록
                        </Button>
                      </>
                    )}
                    {status === "purchased" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setUploadFor({ id: p.id, kind: "review" })}
                        >
                          <PencilLine className="mr-1.5 h-4 w-4" /> 리뷰 인증샷 등록
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-card"
                          onClick={() => setUploadFor({ id: p.id, kind: "purchase" })}
                        >
                          구매 인증샷 다시 등록
                        </Button>
                      </>
                    )}
                    {status === "reviewed" && (
                      <p className="text-sm text-muted-foreground">
                        인증이 모두 등록되었습니다. 관리자 확인 후 지급이 진행됩니다.
                      </p>
                    )}
                    {status === "approved" && (
                      <p className="text-sm font-medium text-amber-700">
                        지급이 확정되었습니다. 곧 입금될 예정입니다.
                      </p>
                    )}
                    {status === "paid" && (
                      <p className="text-sm font-medium text-primary">
                        입금이 완료되었습니다. 참여해 주셔서 감사합니다!
                      </p>
                    )}
                    {status === "rejected" && (
                      <p className="text-sm text-muted-foreground">
                        {p.adminMemo ? `반려 사유: ${p.adminMemo}` : "관리자에 의해 반려되었습니다."}
                      </p>
                    )}

                    {/* 채팅 문의 버튼 */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="relative bg-card"
                      onClick={() => setChatTarget({ participationId: p.id, title: c?.title ?? "캠페인 문의" })}
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" /> 문의하기
                      {unreadChats.has(p.id) && (
                        <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500" />
                      )}
                    </Button>

                    {/* Show submitted proofs */}
                    <div className="ml-auto flex gap-2">
                      {p.searchProofUrl && (
                        <a
                          href={p.searchProofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                        >
                          검색 인증샷
                        </a>
                      )}
                      {p.purchaseProofUrl && (
                        <a
                          href={p.purchaseProofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                        >
                          구매 인증샷
                        </a>
                      )}
                      {p.reviewProofUrl && (
                        <a
                          href={p.reviewProofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                        >
                          리뷰 인증샷
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex justify-center pt-2">
              <Button variant="outline" className="bg-card" onClick={() => navigate("/campaigns")}>
                다른 캠페인 둘러보기
              </Button>
            </div>
          </div>
        )}
      </main>

      {chatTarget && (
        <ChatDialog
          open={!!chatTarget}
          onOpenChange={o => !o && setChatTarget(null)}
          participationId={chatTarget.participationId}
          title={chatTarget.title}
        />
      )}

      {/* Proof upload dialog */}
      <Dialog open={!!uploadFor} onOpenChange={o => !o && closeUpload()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {uploadFor?.kind === "search" ? "검색 인증샷 등록"
                : uploadFor?.kind === "purchase" ? "구매 인증샷 등록"
                : "리뷰 인증샷 등록"}
            </DialogTitle>
            <DialogDescription>
              {uploadFor?.kind === "search"
                ? `키워드로 검색한 결과 화면 스크린샷을 업로드해 주세요. (검색어: ${uploadFor?.keyword ?? "캠페인 키워드"})`
                : uploadFor?.kind === "purchase"
                ? "상품 구매 내역(주문 완료 화면 등) 스크린샷을 업로드해 주세요."
                : "작성한 리뷰가 보이는 화면 스크린샷을 업로드해 주세요."}
            </DialogDescription>
          </DialogHeader>

          <ImageUploader
            value={proofUrl}
            onChange={setProofUrl}
            purpose={uploadFor?.kind === "search" ? "purchase" : uploadFor?.kind === "purchase" ? "purchase" : "review"}
          />

          <DialogFooter>
            <Button variant="outline" className="bg-card" onClick={closeUpload}>
              취소
            </Button>
            <Button onClick={submitProof} disabled={!proofUrl || pending}>
              {pending ? "등록 중..." : "등록하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
