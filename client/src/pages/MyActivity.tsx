import { useAuth } from "@/_core/hooks/useAuth";
import BusinessChatDialog from "@/components/BusinessChatDialog";
import KakaoInquiryButton from "@/components/KakaoInquiryButton";
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
import { participationDeadline } from "@shared/const";
import {
  formatKRW,
  mallName,
  ParticipationStatus,
  STATUS_BADGE,
  STATUS_LABEL,
  totalPayout,
} from "@/lib/workflow";
import {
  ClipboardList,
  Copy,
  FolderArchive,
  ImageIcon,
  Loader2,
  MessageCircle,
  PackageCheck,
  PencilLine,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type ProofKind = "search" | "purchase" | "review";

const REVIEW_TYPE_LABEL: Record<string, string> = {
  photo: "📷 사진 리뷰",
  text: "📝 글자 리뷰",
  star: "⭐ 별점 리뷰",
};

/** 오늘 날짜 'YYYY-MM-DD' (로컬 기준). 배정일과 비교용. */
const TODAY_STR = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const mmdd = (s: string) => s.slice(5).replace("-", "/");

export default function MyActivity() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: parts, isLoading, isError, refetch } = trpc.participation.mine.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    // 사진 패킷이 백그라운드 배정되는 동안만 4초 폴링 → 준비되면 버튼이 자동으로 뜸.
    refetchInterval: query => {
      const d = query.state.data as { reviewType?: string | null; hasPacket?: boolean; campaign?: { hasGuideZip?: boolean } | null }[] | undefined;
      return d?.some(p => p.reviewType === "photo" && !p.hasPacket && p.campaign?.hasGuideZip) ? 4000 : false;
    },
  });

  const { user } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { window.location.href = "/afreviewer/login"; return; }
    if (user?.role === "business") { window.location.href = "/client/dashboard"; return; }
  }, [authLoading, isAuthenticated, user?.role]);

  const [uploadFor, setUploadFor] = useState<{ id: number; kind: ProofKind; keyword?: string } | null>(null);
  const [bizChatWith, setBizChatWith] = useState<{ id: number; name: string } | null>(null);

  const downloadPacket = async (participationId: number) => {
    try {
      const res = await utils.participation.myPacket.fetch({ participationId });
      const href = res.url ?? res.dataUrl;
      if (!href) { toast.error("할당된 가이드가 없습니다."); return; }
      if (res.url) {
        // 같은 탭 이동으로 다운로드 — 응답이 첨부파일(Content-Disposition)이라 페이지는 유지된다.
        // (새 탭 방식은 비동기 호출 뒤라 모바일·카톡 인앱 브라우저가 팝업으로 차단함)
        window.location.assign(res.url);
        toast.success("사진 다운로드를 시작했어요.");
        return;
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = res.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "다운로드에 실패했습니다.");
    }
  };
  const copyDraft = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("리뷰 원고를 복사했어요! 붙여넣어 사용하세요 🐻");
    } catch {
      toast.error("복사에 실패했어요. 길게 눌러 직접 복사해 주세요.");
    }
  };
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

      <main className="container max-w-4xl py-10 pb-28">
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
                    <div className="aspect-square w-full shrink-0 overflow-hidden rounded-2xl bg-muted sm:w-36">
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
                        <div className="min-w-0">
                          <h3 className="font-semibold leading-snug text-foreground">
                            <span className="mr-1 font-medium text-muted-foreground">상품명 :</span>
                            {c?.title ?? "삭제된 캠페인"}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {c?.category && (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold text-white ${
                                mallName(c.category) === "쿠팡" ? "bg-orange-500"
                                : mallName(c.category) === "스마트스토어" ? "bg-green-600"
                                : "bg-slate-500"
                              }`}>
                                {mallName(c.category)}
                              </span>
                            )}
                            {p.reviewType && (
                              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                                {REVIEW_TYPE_LABEL[p.reviewType]} 배정
                              </span>
                            )}
                            {p.assignedDate && (
                              p.assignedDate === TODAY_STR ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                                  🔔 오늘 진행 ({mmdd(p.assignedDate)})
                                </span>
                              ) : (
                                <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                                  진행일 {mmdd(p.assignedDate)}
                                </span>
                              )
                            )}
                            {/* 제출 기한 D-day (참여 후 7일) — 진행 중 단계에서만 */}
                            {["applied", "searched", "purchased"].includes(status) && (() => {
                              const dl = participationDeadline(p.appliedAt, p.deadlineAt);
                              const remaining = dl.getTime() - Date.now();
                              const daysLeft = Math.ceil(remaining / 86_400_000);
                              const dstr = `${dl.getMonth() + 1}/${dl.getDate()}`;
                              return remaining < 0 ? (
                                <span className="inline-block rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                                  ⏰ 제출 기한 초과 — 운영팀 문의
                                </span>
                              ) : (
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                                  daysLeft <= 2 ? "bg-red-100 text-red-700" : "bg-secondary text-secondary-foreground"
                                }`}>
                                  ⏰ 제출 마감 D-{daysLeft} ({dstr})
                                </span>
                              );
                            })()}
                          </div>
                        </div>
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
                            상품가 <b className="text-foreground">{formatKRW(c.productPrice)}</b>
                          </span>
                          <span>작업수당 {formatKRW(c.commission)}</span>
                          <span>총 지급 <b className="text-primary">{formatKRW(totalPayout(c.productPrice, c.commission))}</b></span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border/60 px-5 py-4">
                    <WorkflowStepper status={status} />
                  </div>

                  {/* AI 리뷰 원고 (사진·글자 리뷰어에게 자동 생성·배정) */}
                  {p.reviewDraft && !["approved", "paid", "rejected"].includes(status) && (
                    <div className="border-t border-border/60 bg-primary/5 px-5 py-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-primary">
                          <Sparkles className="h-4 w-4" /> 추천 리뷰 원고
                          {(() => {
                            const target = p.reviewType === "photo" ? c?.photoDraftChars : c?.textDraftChars;
                            return target ? (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                                {target}자 내외
                              </span>
                            ) : null;
                          })()}
                        </span>
                        <Button size="sm" variant="outline" className="h-7 gap-1 bg-card px-2 text-xs"
                          onClick={() => copyDraft(p.reviewDraft!)}>
                          <Copy className="h-3.5 w-3.5" /> 복사
                        </Button>
                      </div>
                      <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm leading-relaxed text-foreground">
                        {p.reviewDraft}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {(() => {
                          const target = p.reviewType === "photo" ? c?.photoDraftChars : c?.textDraftChars;
                          return target
                            ? `상세페이지를 참고해 ${target}자 내외로 작성해 주세요. 위 원고를 본인 말투로 다듬으면 딱 맞아요 🐻`
                            : "참고용 초안이에요. 본인 말투로 자연스럽게 다듬어 작성하면 더 좋아요 🐻";
                        })()}
                      </p>
                    </div>
                  )}

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

                    {/* 관리자 문의 = 카카오 채널 */}
                    <KakaoInquiryButton size="sm" label="관리자에게 문의" />

                    {/* 업체 문의 버튼 */}
                    {c?.createdBy && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-card"
                        onClick={() => setBizChatWith({ id: c.createdBy!, name: c?.title ? `${c.title} 업체` : "업체" })}
                      >
                        <MessageCircle className="mr-1.5 h-4 w-4" /> 업체 문의
                      </Button>
                    )}

                    {/* 배정된 사진 ZIP 다운로드 (할당된 경우) */}
                    {p.hasPacket ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-primary/5 text-primary"
                        onClick={() => downloadPacket(p.id)}
                      >
                        <FolderArchive className="mr-1.5 h-4 w-4" /> 배정된 사진 받기
                      </Button>
                    ) : p.reviewType === "photo" && c?.hasGuideZip ? (
                      // 패킷이 백그라운드 배정 중 — 준비되면 자동으로 버튼으로 바뀜(4초 폴링).
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 배정된 사진 준비 중…
                      </span>
                    ) : null}

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

      <BusinessChatDialog
        open={!!bizChatWith}
        onOpenChange={o => !o && setBizChatWith(null)}
        partnerId={bizChatWith?.id ?? null}
        partnerName={bizChatWith?.name ?? ""}
      />

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
