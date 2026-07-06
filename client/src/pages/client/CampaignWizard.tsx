import { useAuth } from "@/_core/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { analyzeZipFile, type ZipAnalysis } from "@/lib/zipAnalyze";
import { TRPCClientError } from "@trpc/client";
import { ArrowLeft, Check, ChevronRight, ImageIcon, Loader2, Upload, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ── pricing (per reviewer, VAT 포함) ───────────────────────
const REVIEW_FEE = 2400;       // 셀러가 내는 건당 리뷰 비용 (기본가 — 업체별 우대 단가가 있으면 그 값 사용)
const REVIEWER_REWARD = 1000;  // 그 중 리뷰어에게 리워딩되는 금액 (나머지 1,400원은 플랫폼 수수료)
const SHIPPING_FEE = 2300;

// ── A안 진행방식 (리뷰어 필수 이행 절차) ──────────────────────
const GUIDE_A = "진행방식(필수): 키워드 검색 → 유입 → 체류 2분 → 상세페이지 스크롤 → 장바구니 담기 → 하트 누르기 → 구매 → 리뷰(판매자/상품/배송) 작성";

type Platform = "coupang" | "naver";
type PurchaseType = "keyword" | "link";
type DistributeMode = "single" | "distribute";
type GuidelineType = "A" | "B";

type WizardData = {
  platform: Platform;
  purchaseType: PurchaseType;
  productUrl: string;
  thumbnailUrl: string;
  salePrice: string;
  productFullName: string;
  searchKeyword: string;
  filterSetting: string;
  photoCount: string;
  textCount: string;
  starCount: string;
  photoZip: string;
  photoZipName: string;
  photoZipKey: string; // R2 직접 업로드 키 (있으면 base64 대신 사용)
  distributeMode: DistributeMode;
  startDate: string;
  endDate: string;
  schedule: Record<string, string>;
  guidelineType: GuidelineType;
  reviewGuide: string;
};

const INIT: WizardData = {
  platform: "coupang",
  purchaseType: "keyword",
  productUrl: "",
  thumbnailUrl: "",
  salePrice: "",
  productFullName: "",
  searchKeyword: "",
  filterSetting: "",
  photoCount: "0",
  textCount: "0",
  starCount: "0",
  photoZip: "",
  photoZipName: "",
  photoZipKey: "",
  distributeMode: "single",
  startDate: "",
  endDate: "",
  schedule: {},
  guidelineType: "A",
  reviewGuide: "",
};

const STEPS = ["상품 정보", "캠페인 설정", "리뷰 키워드", "확인 & 결제"];

const GUIDES: { title: string; items: { label: string; desc: string; highlight?: boolean }[] }[] = [
  {
    title: "캠페인 작성 가이드",
    items: [
      { label: "썸네일 · 판매가", desc: "상품 이미지를 직접 업로드하고 최종 판매가를 입력합니다." },
      { label: "키워드 구매(권장)", desc: "자연 유입과 동일하게 검색 후 구매해 상위노출에 유리합니다.", highlight: true },
      { label: "검색 키워드", desc: "기입된 키워드로 검색 후 구매를 진행합니다." },
    ],
  },
  {
    title: "캠페인 설정 가이드",
    items: [
      { label: "리뷰 유형 분배", desc: "사진/글자/별점 리뷰 인원을 나눠 모집합니다.", highlight: true },
      { label: "사진 리뷰", desc: "업체가 올린 사진을 사진 리뷰어에게 한 세트씩 자동 배정합니다." },
      { label: "기간 배분", desc: "시작·종료일(최대 10일)을 정하고 날짜별로 인원을 배분합니다." },
    ],
  },
  {
    title: "리뷰 키워드 가이드",
    items: [
      { label: "A안 (권장)", desc: "검색→유입→체류→구매→리뷰까지 표준 진행방식.", highlight: true },
      { label: "B안 (직접작성)", desc: "포함 키워드·톤을 직접 지정하고 싶을 때 사용." },
    ],
  },
  {
    title: "확인 & 결제",
    items: [
      { label: "예치금 결제", desc: "총 비용이 예치금에서 차감되며, 입금 확인 후 캠페인이 시작됩니다.", highlight: true },
      { label: "비용 구성", desc: "상품가 + 리뷰비(기본 건당 2,400원) + 택배비(건당 2,300원), VAT 포함." },
    ],
  },
];

/** Date → 'YYYY-MM-DD' (로컬 기준). toISOString()은 UTC라 KST에서 하루 밀리므로 사용 금지. */
function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function enumerateDates(start: string, end: string): string[] {
  if (!start || !end) return [];
  const out: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(fmtLocal(d));
  }
  return out;
}

const todayStr = () => fmtLocal(new Date());
function plusDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return fmtLocal(d);
}

/** 당일 신청 마감 시각(시). 이 시각 이후엔 '오늘 시작' 캠페인 신청 불가(모드 무관). */
const SAME_DAY_CUTOFF_HOUR = 14; // 오후 2시
/**
 * 오후 2시 이후면 오늘 선택 불가 → 최소 시작일이 내일로 밀린다. (단일·배분 동일)
 * 단, 관리자(운영팀)는 당일 접수 제한이 없어 언제든 오늘 선택 가능.
 */
function minStartStr(isAdmin = false) {
  if (!isAdmin && new Date().getHours() >= SAME_DAY_CUTOFF_HOUR) {
    return plusDays(todayStr(), 1);
  }
  return todayStr();
}

export default function CampaignWizard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin"; // 관리자는 당일 접수 제한 없음
  const balance = user?.depositBalance ?? 0;
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INIT);

  // ?draft=<id> 로 진입하면 해당 서버 임시저장본을 불러온다.
  const initialDraftId = (() => {
    const id = new URLSearchParams(window.location.search).get("draft");
    return id && /^\d+$/.test(id) ? Number(id) : null;
  })();
  const [draftId, setDraftId] = useState<number | null>(initialDraftId);
  const draftIdRef = useRef<number | null>(initialDraftId);
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // 입력값 자동 저장/복원 (셀러별 localStorage). 버튼 없이도 작성 중 내용이 유지된다.
  const autosaveKey = user?.id ? `arben:campaignDraft:${user.id}` : null;
  const restoredRef = useRef(false); // 복원은 한 번만 (작성 중 덮어쓰기 방지)
  const INIT_LIGHT = useMemo(() => {
    const { photoZip: _z, ...l } = INIT; // 큰 base64만 제외 (R2 키·파일명 보존)
    return JSON.stringify(l);
  }, []);

  const draftQuery = trpc.campaign.getDraft.useQuery(
    { id: initialDraftId! },
    { enabled: initialDraftId != null },
  );
  useEffect(() => {
    const raw = draftQuery.data?.data;
    if (!raw || restoredRef.current) return;
    try {
      const parsed = JSON.parse(raw) as Partial<WizardData>;
      setData(prev => ({ ...prev, ...parsed }));
      setDraftId(draftQuery.data!.id);
      toast.success("이전에 임시저장한 내용을 불러왔어요 🐻");
    } catch { /* 손상된 임시저장은 무시 */ }
    restoredRef.current = true;
  }, [draftQuery.data]);

  // 진입 시: ?draft가 없으면 localStorage에 작성 중이던 내용을 자동 복원.
  useEffect(() => {
    if (restoredRef.current || initialDraftId != null || !autosaveKey) return;
    try {
      const saved = localStorage.getItem(autosaveKey);
      if (saved && saved !== INIT_LIGHT) {
        setData(prev => ({ ...prev, ...(JSON.parse(saved) as Partial<WizardData>) }));
        toast.success("작성 중이던 내용을 불러왔어요 🐻");
      }
    } catch { /* 무시 */ }
    restoredRef.current = true;
  }, [autosaveKey, initialDraftId, INIT_LIGHT]);

  // 입력값이 바뀔 때마다 자동 저장 (사진 ZIP은 용량이 커서 제외).
  useEffect(() => {
    if (!autosaveKey || !restoredRef.current) return;
    const { photoZip: _z, ...light } = data; // 큰 base64만 제외 (R2 키·파일명 보존)
    const s = JSON.stringify(light);
    try {
      if (s === INIT_LIGHT) { localStorage.removeItem(autosaveKey); return; }
      localStorage.setItem(autosaveKey, s);
    } catch {
      // 썸네일(base64)이 커서 용량 초과면, 썸네일만 빼고 텍스트라도 저장.
      try {
        const { thumbnailUrl: _t, ...noThumb } = light;
        localStorage.setItem(autosaveKey, JSON.stringify(noThumb));
      } catch { /* 그래도 실패하면 무시 */ }
    }
  }, [data, autosaveKey, INIT_LIGHT]);

  const totalReviewers = useMemo(
    () => (Number(data.photoCount) || 0) + (Number(data.textCount) || 0) + (Number(data.starCount) || 0),
    [data.photoCount, data.textCount, data.starCount]
  );
  const salePriceNum = Number(data.salePrice) || 0;
  // 건당 리뷰 비용: 업체별 우대 단가(VIP)가 설정돼 있으면 그 값 (서버 계산과 동일 규칙).
  const reviewFee = (user as { customReviewFee?: number | null } | null | undefined)?.customReviewFee ?? REVIEW_FEE;
  const reviewCost = reviewFee * totalReviewers;
  const shippingCost = SHIPPING_FEE * totalReviewers;
  const productCost = salePriceNum * totalReviewers;
  const grandTotal = productCost + reviewCost + shippingCost;

  const days = useMemo(
    () => enumerateDates(data.startDate, data.distributeMode === "single" ? data.startDate : data.endDate),
    [data.startDate, data.endDate, data.distributeMode]
  );
  const scheduleSum = useMemo(
    () => days.reduce((s, d) => s + (Number(data.schedule[d]) || 0), 0),
    [days, data.schedule]
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const setThumbFromFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("이미지 파일만 올릴 수 있어요."); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("이미지는 3MB 이하로 올려주세요."); return; }
    const reader = new FileReader();
    reader.onload = () => setData(prev => ({ ...prev, thumbnailUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  const onThumbFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setThumbFromFile(file);
  };

  const zipRef = useRef<HTMLInputElement>(null);
  const [zipUploading, setZipUploading] = useState(false);
  /** 업로드한 ZIP의 구조 분석 결과 — 몇 명분으로 나뉘는지 (null=분석 전/실패). */
  const [zipInfo, setZipInfo] = useState<ZipAnalysis | null>(null);
  /** 사진(ZIP 명분)이 모집 인원보다 적을 때 확인 다이얼로그. null=닫힘. */
  const [zipShortage, setZipShortage] = useState<{ units: number; need: number } | null>(null);

  // 네이버 선택 시 어뷰징 방지 안내 팝업 (마법사 열 때마다 최초 1회)
  const [naverNotice, setNaverNotice] = useState(false);
  const naverNoticeShown = useRef(false);
  const pickPlatform = (p: Platform) => {
    setData(prev => ({ ...prev, platform: p }));
    if (p === "naver" && !naverNoticeShown.current) {
      naverNoticeShown.current = true;
      setNaverNotice(true);
    }
  };
  const presignZip = trpc.campaign.zipUploadUrl.useMutation();
  const onZipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
    if (!isZip) { toast.error("ZIP(.zip) 파일만 올릴 수 있어요."); return; }
    if (file.size > 2 * 1024 * 1024 * 1024) { toast.error("ZIP은 2GB 이하로 올려주세요."); return; }

    // 업로드 전에 로컬에서 구조 분석 — 몇 명분으로 나뉘는지 즉시 확인 (서버 왕복 없음).
    setZipInfo(null);
    void analyzeZipFile(file)
      .then(info => {
        setZipInfo(info);
        if (info.unstructured) {
          toast.error(`⚠️ 폴더 구분이 없어 통째로 1명분으로 인식돼요! 리뷰어별 폴더로 나눠 다시 압축해 주세요. (사진 ${info.files}장)`, { duration: 8000 });
        } else {
          toast.success(`📦 ${info.units}명분으로 인식됐어요 (사진 ${info.files}장)`);
        }
      })
      .catch(() => setZipInfo(null));

    // R2로 직접 업로드 (presigned PUT) — base64 64MB 한계 우회.
    // 스토리지 미설정 등으로 presign 실패 시 기존 base64 경로(≤45MB)로 폴백.
    setZipUploading(true);
    try {
      const { url, key } = await presignZip.mutateAsync({ fileName: file.name });
      const put = await fetch(url, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`R2 upload failed: ${put.status}`);
      setData(prev => ({ ...prev, photoZipKey: key, photoZipName: file.name, photoZip: "" }));
      toast.success(`사진 ZIP 업로드 완료! (${(file.size / 1024 / 1024).toFixed(1)}MB) 🐻`);
    } catch (err) {
      console.error("R2 presign upload failed, falling back to base64:", err);
      if (file.size > 45 * 1024 * 1024) {
        toast.error("대용량 업로드 준비 중이에요. 45MB 이하 ZIP으로 올려주세요.");
        setZipUploading(false);
        return;
      }
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        setData(prev => ({ ...prev, photoZip: dataUrl, photoZipName: file.name, photoZipKey: "" }));
        toast.success(`사진 ZIP 등록 완료! (${(file.size / 1024 / 1024).toFixed(1)}MB) 🐻`);
      } catch {
        toast.error("ZIP 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setZipUploading(false);
    }
  };

  // 1단계에서 Ctrl+V(캡처 이미지 붙여넣기)로 썸네일 등록.
  useEffect(() => {
    if (step !== 0) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            setThumbFromFile(f);
            toast.success("붙여넣은 이미지를 썸네일로 등록했어요! 🐻");
            e.preventDefault();
          }
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step]);

  const deleteDraftMutation = trpc.campaign.deleteDraft.useMutation();

  // 위저드를 떠날 때(다른 메뉴 이동) "자동 저장됐다" 팝업 안내.
  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);
  useEffect(() => {
    const { photoZip: _z, ...light } = data; // 큰 base64만 제외 (R2 키·파일명 보존)
    dirtyRef.current = JSON.stringify(light) !== INIT_LIGHT;
  }, [data, INIT_LIGHT]);
  useEffect(() => {
    return () => {
      if (dirtyRef.current && !submittedRef.current) {
        toast("작성 중인 내용은 자동 저장됐어요. 다음에 이어서 작성할 수 있어요 🐻", { icon: "💾", duration: 4000 });
      }
    };
  }, []);

  const requestMutation = trpc.campaign.request.useMutation({
    onSuccess: () => {
      submittedRef.current = true; // 제출 완료 — 떠날 때 자동저장 안내 띄우지 않음
      utils.campaign.myBusiness.invalidate();
      utils.auth.me.invalidate();  // 예치금 차감 반영
      // 결제까지 마쳤으면 임시저장본은 정리.
      const did = draftIdRef.current;
      if (did) {
        deleteDraftMutation.mutate({ id: did });
        utils.campaign.myDrafts.invalidate();
      }
      if (autosaveKey) { try { localStorage.removeItem(autosaveKey); } catch { /* 무시 */ } }
      utils.campaign.listAll.invalidate(); // 관리자 목록 갱신
      if (isAdmin) {
        toast.success("캠페인이 등록되어 바로 모집이 시작됐어요! 🛠️");
        navigate("/admin");
      } else {
        toast.success("예치금에서 결제되었어요! 관리자 승인 후 캠페인이 시작됩니다 🐻");
        navigate("/client/campaigns");
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof TRPCClientError ? err.message : "캠페인 신청에 실패했습니다.";
      toast.error(msg);
    },
  });

  const set = <K extends keyof WizardData>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setData(prev => ({ ...prev, [k]: e.target.value }));

  // 단일 진행: 종료일 = 시작일. 배분 진행: 종료일 최대 시작일+9.
  const setStart = (v: string) =>
    setData(prev => ({
      ...prev,
      startDate: v,
      endDate: prev.distributeMode === "single" ? v : (prev.endDate && prev.endDate >= v && prev.endDate <= plusDays(v, 9) ? prev.endDate : v),
    }));
  const setMode = (mode: DistributeMode) =>
    setData(prev => ({ ...prev, distributeMode: mode, endDate: mode === "single" ? prev.startDate : prev.endDate, schedule: {} }));

  const validate = () => {
    if (step === 0) {
      if (!data.thumbnailUrl) { toast.error("상품 썸네일을 업로드해 주세요."); return false; }
      if (!data.salePrice || Number(data.salePrice) <= 0) { toast.error("최종 판매가를 입력해 주세요."); return false; }
      if (!data.productFullName.trim()) { toast.error("상품 전체명을 입력해 주세요."); return false; }
      if (!data.searchKeyword.trim()) { toast.error("검색 키워드를 입력해 주세요."); return false; }
      if (data.purchaseType === "link" && !data.productUrl.trim()) { toast.error("링크 구매는 상품 링크가 필요해요."); return false; }
    }
    if (step === 1) {
      if (totalReviewers < 1) { toast.error("모집 인원을 1명 이상 입력해 주세요."); return false; }
      // 사진 ZIP 구조 검증: 폴더 구분 없이 통짜면(2명 이상 모집 시) 진행 차단 — 1명에게 몽땅 가는 사고 방지.
      const photoCnt = Number(data.photoCount) || 0;
      if ((data.photoZipKey || data.photoZip) && zipInfo) {
        if (zipInfo.unstructured && photoCnt > 1) {
          toast.error("사진 ZIP에 리뷰어별 폴더 구분이 없어요. 1명 몫씩 폴더로 나눈 뒤 다시 압축해 올려주세요.");
          return false;
        }
      }
      if (!data.startDate) { toast.error("시작 날짜를 선택해 주세요."); return false; }
      if (data.startDate < minStartStr(isAdmin)) {
        if (data.startDate === todayStr()) {
          toast.error(`오늘 시작 캠페인은 오후 ${SAME_DAY_CUTOFF_HOUR - 12}시까지만 신청할 수 있어요. 시작일을 내일 이후로 선택해 주세요.`);
        } else {
          toast.error("시작 날짜는 오늘 이후로 선택해 주세요.");
        }
        return false;
      }
      if (data.distributeMode === "distribute") {
        if (!data.endDate) { toast.error("종료 날짜를 선택해 주세요."); return false; }
        if (data.endDate < data.startDate) { toast.error("종료 날짜는 시작 날짜 이후여야 해요."); return false; }
        if (data.endDate > plusDays(data.startDate, 9)) { toast.error("기간은 최대 10일까지 설정할 수 있어요."); return false; }
        if (scheduleSum > totalReviewers) { toast.error("인원 배분을 초과합니다."); return false; }
        if (scheduleSum < totalReviewers) { toast.error("인원 배분이 부족합니다. 합계와 맞춰주세요."); return false; }
      }
      // 마지막 검증: 사진이 모집 인원보다 적으면 확인 다이얼로그를 띄우고 멈춘다.
      // (다른 검증을 모두 통과한 뒤라, 다이얼로그에서 '이대로 진행'을 누르면 바로 다음 단계로 이동)
      if ((data.photoZipKey || data.photoZip) && zipInfo && !zipInfo.unstructured && zipInfo.units < photoCnt) {
        setZipShortage({ units: zipInfo.units, need: photoCnt });
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (zipUploading) { toast.error("사진 ZIP 업로드가 끝날 때까지 기다려 주세요."); return; }
    if (validate()) setStep(s => s + 1);
  };
  const prev = () => setStep(s => s - 1);

  const submit = () => {
    if (zipUploading) { toast.error("사진 ZIP 업로드가 끝날 때까지 기다려 주세요."); return; }
    if (totalReviewers < 1) { toast.error("모집 인원을 확인해 주세요."); return; }
    const guideline = data.guidelineType === "A" ? GUIDE_A : data.reviewGuide.trim();
    const description = [
      `[리뷰 가이드] ${guideline || "(미입력)"}`,
      `[모집] 사진 ${Number(data.photoCount) || 0} · 글자 ${Number(data.textCount) || 0} · 별점 ${Number(data.starCount) || 0}`,
      data.filterSetting.trim() ? `[필터] ${data.filterSetting.trim()}` : "",
    ].filter(Boolean).join("\n");

    const endDate = data.distributeMode === "single" ? data.startDate : data.endDate;
    requestMutation.mutate({
      title: data.productFullName.trim(),
      keyword: data.searchKeyword.trim(),
      category: data.platform === "coupang" ? "쿠팡" : "네이버 스마트스토어",
      productUrl: data.productUrl.trim() || undefined,
      thumbnailUrl: data.thumbnailUrl || undefined,
      description,
      productPrice: salePriceNum,
      commission: REVIEWER_REWARD,
      slots: totalReviewers,
      photoCount: Number(data.photoCount) || 0,
      textCount: Number(data.textCount) || 0,
      starCount: Number(data.starCount) || 0,
      startDate: data.startDate || undefined,
      endDate: endDate || undefined,
      schedule: data.distributeMode === "distribute" ? JSON.stringify(
        Object.fromEntries(days.map(d => [d, Number(data.schedule[d]) || 0]))
      ) : undefined,
      // R2 직접 업로드 키가 있으면 그것을, 없으면 레거시 base64를 사용.
      photoGuideZipKey: data.photoZipKey || undefined,
      photoGuideZip: data.photoZipKey ? undefined : (data.photoZip || undefined),
      photoGuideZipName: data.photoZipName || undefined,
    });
  };

  const guide = GUIDES[step];
  const platformLabel = data.platform === "coupang" ? "쿠팡" : "네이버 스마트스토어";
  const won = (n: number) => `${n.toLocaleString()}원`;

  return (
    <ClientLayout title="캠페인 신청 🐻" description="4단계로 간편하게 캠페인을 신청하세요.">
      <div className="mx-auto max-w-6xl">
        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-0">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-bold transition-colors ${
                  i <= step ? "bg-primary text-primary-foreground shadow-sm" : "border-2 border-border bg-card text-muted-foreground"
                }`}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-xs whitespace-nowrap ${i === step ? "font-bold text-primary" : "text-muted-foreground"}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mb-4 h-1 w-16 sm:w-24 mx-1 rounded-full ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-6">
          <div className="flex-1 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-8">
            <div key={step} className="animate-in fade-in-50 slide-in-from-right-3 duration-300 ease-out">

              {/* STEP 0 — 상품 정보 */}
              {step === 0 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">🛒 상품 정보</h2>
                    <p className="mt-1 text-sm text-muted-foreground">썸네일 이미지를 업로드하고 최종 판매가를 입력하세요.</p>
                  </div>

                  {/* 플랫폼 */}
                  <div>
                    <Label className="mb-2 block font-semibold">플랫폼 *</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {(["coupang", "naver"] as const).map(p => (
                        <button key={p} type="button" onClick={() => pickPlatform(p)}
                          className={`rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                            data.platform === p
                              ? p === "coupang" ? "border-orange-500 bg-orange-500 text-white" : "border-green-500 bg-green-500 text-white"
                              : "border-border bg-card text-muted-foreground hover:border-primary/40"
                          }`}>
                          {p === "coupang" ? "쿠팡" : "네이버 스마트스토어"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 구매 방식 */}
                  <div>
                    <Label className="mb-2 block font-semibold">구매 방식 *</Label>
                    <p className="mb-2 text-xs text-muted-foreground">
                      키워드 구매: 검색 후 상품 찾아서 구매 (자연 유입과 동일) | 링크 구매: URL로 바로 구매
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {(["keyword", "link"] as const).map(t => (
                        <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                          data.purchaseType === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"
                        }`}>
                          <input type="radio" className="accent-[var(--primary)]" checked={data.purchaseType === t}
                            onChange={() => setData(prev => ({ ...prev, purchaseType: t }))} />
                          {t === "keyword" ? "키워드 구매 (권장)" : "링크 구매"}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 상품 링크 (링크 구매 시에만) */}
                  {data.purchaseType === "link" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="productUrl" className="font-semibold">상품 링크 *</Label>
                      <Input id="productUrl" placeholder={`https://www.${data.platform === "coupang" ? "coupang.com/vp/products/12345678" : "smartstore.naver.com/..."}`}
                        value={data.productUrl} onChange={set("productUrl")} className="h-11" />
                      <p className="text-xs text-muted-foreground">리뷰어가 이 링크로 바로 구매합니다.</p>
                    </div>
                  )}

                  {/* 썸네일 업로드 + 판매가 (수동) */}
                  <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-secondary/30 p-4">
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted transition-colors hover:border-primary/50">
                      {data.thumbnailUrl ? (
                        <>
                          <img src={data.thumbnailUrl} alt="썸네일" className="h-full w-full object-cover" />
                          <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-xs font-semibold text-white group-hover:flex">변경</span>
                        </>
                      ) : (
                        <span className="flex flex-col items-center gap-1 text-muted-foreground">
                          <Upload className="h-5 w-5" />
                          <span className="text-[11px] font-medium">업로드</span>
                          <span className="text-[9px]">또는 Ctrl+V</span>
                        </span>
                      )}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onThumbFile} />
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="salePrice" className="text-xs font-semibold text-muted-foreground">최종 판매가 (원) *</Label>
                      <Input id="salePrice" type="number" min={0} placeholder="예: 15000" value={data.salePrice} onChange={set("salePrice")} className="h-10 bg-card" />
                      <p className="text-[11px] text-muted-foreground">썸네일은 <b className="text-foreground">클릭해서 업로드</b>하거나 캡처 후 <b className="text-foreground">Ctrl+V</b>로 붙여넣으세요. JPG/PNG · 3MB 이하.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="productFullName" className="font-semibold">상품 전체명 *</Label>
                    <Input id="productFullName" placeholder="예: [브랜드명] 콜라겐 마스크팩 10매입 보습 수분 팩" value={data.productFullName} onChange={set("productFullName")} className="h-11" />
                    <p className="text-xs text-muted-foreground">{platformLabel}에 등록된 상품명 전체를 정확히 입력해주세요</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="searchKeyword" className="font-semibold">검색 키워드 *</Label>
                    <Input id="searchKeyword" placeholder="예: 남자지갑, 슬림지갑" value={data.searchKeyword} onChange={set("searchKeyword")} className="h-11" />
                    <p className="text-xs text-muted-foreground">입력된 키워드로 검색 후 구매를 진행합니다.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="filterSetting" className="font-semibold">필터 설정 <span className="font-normal text-muted-foreground">(선택)</span></Label>
                    <Input id="filterSetting" placeholder="예: 색상 : 브라운 , 가격 : 12,300 ~ 12,400원" value={data.filterSetting} onChange={set("filterSetting")} className="h-11" />
                  </div>
                </div>
              )}

              {/* STEP 1 — 캠페인 설정 */}
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">⚙️ 캠페인 설정</h2>
                    <p className="mt-1 text-sm text-muted-foreground">리뷰 유형별 모집 인원과 진행 기간을 설정합니다.</p>
                  </div>

                  {/* 모집 인원 세분화 */}
                  <div>
                    <Label className="mb-2 block font-semibold">모집 인원 (리뷰 유형별) *</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {([["photoCount", "📷 사진 리뷰"], ["textCount", "📝 글자 리뷰"], ["starCount", "⭐ 별점 리뷰"]] as const).map(([k, label]) => (
                        <div key={k} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{label}</Label>
                          <Input type="number" min={0} placeholder="0" value={data[k]} onChange={set(k)} className="h-11 text-center" />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2 text-sm">
                      <span className="font-semibold text-primary">합계 모집 인원</span>
                      <span className="font-extrabold text-primary">{totalReviewers}명</span>
                    </div>
                  </div>

                  {/* 사진 리뷰 안내 + 예시 */}
                  <div className="rounded-2xl border border-border/70 bg-secondary/30 p-4">
                    <p className="text-sm font-bold text-foreground">📷 사진 리뷰는 이렇게 진행돼요</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      업체가 사진을 <b className="text-foreground">리뷰어별 폴더</b>로 묶어 <b className="text-foreground">ZIP 1개</b>로 올리면, 사진 리뷰어에게 한 세트씩 <b className="text-foreground">자동 배정</b>됩니다. 리뷰어는 배정받은 사진으로 리뷰를 작성해요.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="grid shrink-0 grid-cols-2 gap-1">
                        {["📷", "📷", "📷", "📷"].map((e, i) => (
                          <span key={i} className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-base shadow-sm">{e}</span>
                        ))}
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-card">
                        <span className="text-xl">🗜️</span>
                        <span className="text-[10px] font-bold text-primary">review.zip</span>
                      </div>
                      <span className="text-xs text-muted-foreground">리뷰어별 폴더 → 각자에게 자동 배정</span>
                    </div>

                    {/* 사진 리뷰 ZIP 업로드 */}
                    <div className="mt-4 border-t border-border/50 pt-4">
                      <Label className="font-semibold">사진 리뷰 ZIP 업로드 <span className="font-normal text-muted-foreground">(선택)</span></Label>
                      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">리뷰어에게 배정할 사진을 <b className="text-foreground">리뷰어별 폴더</b>로 묶어 ZIP 1개로 올려주세요. 폴더 하나 = 사진 리뷰어 한 명 몫. (.zip · 대용량 지원)</p>
                      <input ref={zipRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden" onChange={onZipFile} disabled={zipUploading} />
                      {zipUploading ? (
                        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
                          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                          <span className="flex-1 truncate text-sm font-medium text-foreground">업로드 중… 잠시만 기다려 주세요</span>
                        </div>
                      ) : (data.photoZipKey || data.photoZip) ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base">🗜️</span>
                            <span className="flex-1 truncate text-sm font-medium text-foreground">{data.photoZipName}</span>
                            <button type="button" onClick={() => zipRef.current?.click()} className="shrink-0 text-xs font-semibold text-primary hover:underline">변경</button>
                            <button type="button" onClick={() => { setZipInfo(null); setData(prev => ({ ...prev, photoZip: "", photoZipName: "", photoZipKey: "" })); }} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-destructive">삭제</button>
                          </div>
                          {/* ZIP 구조 분석 결과 — 몇 명분으로 나뉘는지 즉시 표시 */}
                          {zipInfo && (
                            zipInfo.unstructured ? (
                              <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs">
                                <p className="font-bold text-destructive">⚠️ 폴더 구분이 없어 통째로 1명분으로 인식돼요 (사진 {zipInfo.files}장)</p>
                                <p className="mt-1 text-muted-foreground">
                                  리뷰어 1명 몫씩 <b className="text-foreground">폴더로 나눈 뒤</b> 전체를 압축해서 다시 올려주세요.<br />
                                  예: <span className="font-mono">통합.zip → 리뷰어1/사진들, 리뷰어2/사진들, …</span>
                                </p>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 px-3 py-2.5 text-xs">
                                <p className="font-bold text-emerald-700">📦 {zipInfo.units}명분으로 인식됐어요 (사진 {zipInfo.files}장)</p>
                                <p className="mt-0.5 truncate text-muted-foreground">
                                  {zipInfo.names.join(", ")}{zipInfo.units > zipInfo.names.length ? ` 외 ${zipInfo.units - zipInfo.names.length}개` : ""}
                                </p>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <button type="button" onClick={() => zipRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                          <Upload className="h-4 w-4" /> ZIP 파일 업로드
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 진행 방식: 단일 / 배분 */}
                  <div>
                    <Label className="mb-2 block font-semibold">진행 방식 *</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {([["single", "단일 진행", "하루에 전체 모집"], ["distribute", "배분 진행", "기간 내 날짜별 배분"]] as const).map(([m, t, d]) => (
                        <button key={m} type="button" onClick={() => setMode(m)}
                          className={`rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                            data.distributeMode === m ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"
                          }`}>
                          <p className={`text-sm font-bold ${data.distributeMode === m ? "text-primary" : "text-foreground"}`}>{t}</p>
                          <p className="text-[11px] text-muted-foreground">{d}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 날짜 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="startDate" className="font-semibold">시작 날짜 *</Label>
                      <Input id="startDate" type="date" min={minStartStr(isAdmin)} value={data.startDate} onChange={e => setStart(e.target.value)} className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="endDate" className="font-semibold">종료 날짜 {data.distributeMode === "single" && <span className="font-normal text-muted-foreground">(자동)</span>}</Label>
                      <Input id="endDate" type="date" disabled={data.distributeMode === "single"}
                        min={data.startDate || todayStr()} max={data.startDate ? plusDays(data.startDate, 9) : undefined}
                        value={data.distributeMode === "single" ? data.startDate : data.endDate}
                        onChange={set("endDate")} className="h-11 disabled:opacity-60" />
                    </div>
                  </div>
                  {data.distributeMode === "distribute" && <p className="-mt-3 text-xs text-muted-foreground">기간은 최대 10일까지 설정할 수 있어요.</p>}
                  {isAdmin
                    ? <p className="-mt-3 text-xs text-primary">🛠️ 관리자 계정 — 당일 접수 제한 없이 오늘 날짜로도 등록할 수 있어요.</p>
                    : <p className="-mt-3 text-xs text-muted-foreground">⏰ 오늘 시작 캠페인은 오후 {SAME_DAY_CUTOFF_HOUR - 12}시까지만 신청할 수 있어요. (이후엔 내일부터 가능)</p>}

                  {/* 날짜별 배분 */}
                  {data.distributeMode === "distribute" && days.length > 0 && (
                    <div className="rounded-2xl border border-border/70 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-bold text-foreground">날짜별 인원 배분</p>
                        <span className={`text-sm font-bold ${scheduleSum > totalReviewers ? "text-destructive" : scheduleSum === totalReviewers ? "text-primary" : "text-muted-foreground"}`}>
                          {scheduleSum} / {totalReviewers}명
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {days.map(d => (
                          <div key={d} className="flex items-center gap-2 rounded-xl bg-secondary/40 px-2 py-1.5">
                            <span className="text-xs text-muted-foreground">{d.slice(5)}</span>
                            <Input type="number" min={0} value={data.schedule[d] ?? ""} placeholder="0"
                              onChange={e => setData(prev => ({ ...prev, schedule: { ...prev.schedule, [d]: e.target.value } }))}
                              className="h-8 w-full text-center" />
                          </div>
                        ))}
                      </div>
                      {scheduleSum > totalReviewers && <p className="mt-2 text-xs font-semibold text-destructive">⚠️ 인원 배분을 초과합니다.</p>}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2 — 리뷰 키워드 */}
              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">📝 리뷰 가이드라인</h2>
                    <p className="mt-1 text-sm text-muted-foreground">리뷰어 진행 방식을 선택하세요.</p>
                  </div>

                  <div className="space-y-3">
                    {/* A안 */}
                    <button type="button" onClick={() => setData(prev => ({ ...prev, guidelineType: "A" }))}
                      className={`block w-full rounded-2xl border-2 p-4 text-left transition-all ${
                        data.guidelineType === "A" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                      }`}>
                      <p className={`flex items-center gap-1.5 font-bold ${data.guidelineType === "A" ? "text-primary" : "text-foreground"}`}>
                        {data.guidelineType === "A" && <Check className="h-4 w-4" />} A안 (권장)
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        키워드 검색 → 유입 → 체류 2분 → 상세페이지 스크롤 → 장바구니 담기 → 하트 누르기 → 구매 → 리뷰(판매자/상품/배송) 작성
                      </p>
                    </button>

                    {/* B안 */}
                    <button type="button" onClick={() => setData(prev => ({ ...prev, guidelineType: "B" }))}
                      className={`block w-full rounded-2xl border-2 p-4 text-left transition-all ${
                        data.guidelineType === "B" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                      }`}>
                      <p className={`flex items-center gap-1.5 font-bold ${data.guidelineType === "B" ? "text-primary" : "text-foreground"}`}>
                        {data.guidelineType === "B" && <Check className="h-4 w-4" />} B안 (직접작성)
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">예) 상품의 보습력과 사용감을 중심으로 작성해주세요. / 포함 키워드: 수분크림, 촉촉한, 피부 진정 등</p>
                    </button>

                    {data.guidelineType === "B" && (
                      <Textarea rows={5} value={data.reviewGuide} onChange={set("reviewGuide")} className="resize-none"
                        placeholder={"예: 상품의 보습력과 사용감을 중심으로 작성해주세요.\n포함 키워드: 수분크림, 촉촉한, 피부 진정 등"} />
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3 — 확인 & 결제 */}
              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">✅ 확인 & 결제</h2>
                    <p className="mt-1 text-sm text-muted-foreground">입력 내용을 확인하고 예치금으로 결제합니다.</p>
                  </div>

                  <div className="divide-y divide-border/60 rounded-2xl border border-border/70 overflow-hidden text-sm">
                    {[
                      ["플랫폼", platformLabel],
                      ["구매 방식", data.purchaseType === "keyword" ? "키워드 구매 (권장)" : "링크 구매"],
                      ["상품명", data.productFullName],
                      ["검색 키워드", data.searchKeyword],
                      ["모집 인원", `사진 ${Number(data.photoCount) || 0} · 글자 ${Number(data.textCount) || 0} · 별점 ${Number(data.starCount) || 0} = 총 ${totalReviewers}명`],
                      ["진행 기간", data.distributeMode === "single" ? `${data.startDate || "-"} (단일)` : `${data.startDate || "-"} ~ ${data.endDate || "-"} (배분)`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex gap-4 bg-card px-4 py-3">
                        <span className="w-24 shrink-0 font-medium text-muted-foreground">{label}</span>
                        <span className="text-foreground break-all">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* 비용 */}
                  <div className="overflow-hidden rounded-2xl border border-border/70 text-sm">
                    {[
                      ["상품가", `${won(salePriceNum)} × ${totalReviewers}`, won(productCost)],
                      [`리뷰비용 (건당 ${reviewFee.toLocaleString()}원)${reviewFee !== REVIEW_FEE ? " ⭐우대가" : ""}`, `${reviewFee.toLocaleString()} × ${totalReviewers}`, won(reviewCost)],
                      ["택배비용 (건당 2,300원)", `2,300 × ${totalReviewers}`, won(shippingCost)],
                    ].map(([label, calc, amount]) => (
                      <div key={label} className="flex items-center justify-between bg-card px-4 py-3">
                        <div><span className="font-medium text-foreground">{label}</span> <span className="text-xs text-muted-foreground">{calc}</span></div>
                        <span className="font-semibold text-foreground">{amount}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between bg-primary/10 px-4 py-3.5">
                      <span className="font-bold text-primary">총계 (VAT 포함)</span>
                      <span className="text-lg font-extrabold text-primary">{won(grandTotal)}</span>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3 text-xs font-medium text-primary">
                      🛠️ 관리자 등록 — 예치금 차감 없이 <b>바로 모집(open)</b> 상태로 생성됩니다.
                    </div>
                  ) : (
                    <>
                      {/* 예치금 잔액 */}
                      <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${grandTotal > balance ? "border-destructive/30 bg-destructive/5" : "border-border/70 bg-card"}`}>
                        <span className="font-medium text-muted-foreground">보유 예치금</span>
                        <span className={`font-bold ${grandTotal > balance ? "text-destructive" : "text-foreground"}`}>{won(balance)}</span>
                      </div>
                      {grandTotal > balance ? (
                        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold text-destructive">
                          ⚠️ 예치금이 부족합니다. (부족 {won(grandTotal - balance)}) — 운영팀에 충전을 요청해 주세요.
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3 text-xs font-medium text-primary">
                          💳 결제하면 예치금에서 {won(grandTotal)}이 차감되고, 관리자 승인 후 캠페인이 시작됩니다.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

            </div>{/* /keyed step wrapper */}

            {/* nav buttons */}
            <div className="mt-8 flex items-center justify-between">
              {step > 0 ? (
                <Button variant="outline" onClick={prev} className="gap-1 rounded-full bg-card"><ArrowLeft className="h-4 w-4" /> 이전</Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                {step < STEPS.length - 1 ? (
                  <Button onClick={next} disabled={zipUploading} className="gap-1 rounded-full font-bold">
                    {zipUploading ? <><Loader2 className="h-4 w-4 animate-spin" /> 업로드 중…</> : <>다음 <ChevronRight className="h-4 w-4" /></>}
                  </Button>
                ) : (
                  <Button onClick={submit} disabled={requestMutation.isPending || zipUploading || (!isAdmin && grandTotal > balance)} className="gap-1.5 rounded-full font-bold">
                    {requestMutation.isPending || zipUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    {zipUploading ? "사진 업로드 중…" : isAdmin ? "캠페인 등록하기" : grandTotal > balance ? "예치금 부족" : `캠페인 결제하기 (${won(grandTotal)})`}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* guide sidebar */}
          <aside className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-8 rounded-3xl border border-border/70 bg-card p-5 shadow-sm text-sm">
              <p className="mb-4 flex items-center gap-1.5 font-bold text-foreground">📋 {guide.title}</p>
              <div className="space-y-3">
                {guide.items.map((item, i) => (
                  <div key={i} className={`rounded-2xl p-3 ${item.highlight ? "bg-primary/10 border border-primary/15" : "bg-secondary/60"}`}>
                    <p className={`flex items-center gap-1.5 font-bold ${item.highlight ? "text-primary" : "text-foreground"}`}>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${item.highlight ? "bg-primary" : "bg-muted-foreground/50"}`} />
                      {item.label}
                    </p>
                    <p className="mt-1 leading-relaxed text-muted-foreground text-xs">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* 사진(ZIP 명분) < 모집 인원 — 고객이 확인해야 다음 단계로 진행 */}
      {/* 네이버 진행 시 어뷰징 방지 안내 */}
      <AlertDialog open={naverNotice} onOpenChange={setNaverNotice}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>🍀 네이버 리뷰 진행 안내</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm leading-relaxed">
                <p>
                  네이버 스마트스토어는 어뷰징 감지가 민감해서, 리뷰가 한 번에 몰리면 스토어에
                  불이익이 갈 수 있어요.
                </p>
                <p>
                  <b className="text-foreground">하루 최대 10건 정도</b>로 나눠 신청하시는 것이
                  가장 안전합니다. 모집 인원이 많다면 <b className="text-foreground">날짜별 인원
                  배분</b>으로 하루 10명 이하씩 나눠 주세요.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setNaverNotice(false)} className="font-bold">
              확인했어요
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!zipShortage} onOpenChange={o => !o && setZipShortage(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>📷 사진이 모집 인원보다 적어요</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1 text-sm leading-relaxed">
                <p>
                  업로드하신 사진 ZIP은 <b className="text-foreground">{zipShortage?.units}명분</b>인데,
                  사진 리뷰어 모집 인원은 <b className="text-foreground">{zipShortage?.need}명</b>입니다.
                </p>
                <p className="rounded-xl bg-secondary/50 px-3 py-2">
                  이대로 진행하면 <b className="text-foreground">선착순 {zipShortage?.units}명만 사진을 받고</b>,
                  나머지 <b className="text-destructive">{zipShortage ? zipShortage.need - zipShortage.units : 0}명은
                  사진 없이(리뷰 원고만)</b> 진행됩니다.
                </p>
                <p className="text-xs text-muted-foreground">
                  모든 리뷰어에게 사진을 전달하려면, 리뷰어별 폴더를 {zipShortage?.need}개로 맞춘 ZIP을 다시 올려주세요.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setZipShortage(null)}>ZIP 다시 올리기</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setZipShortage(null); setStep(s => s + 1); }}>
              확인했어요, 이대로 진행
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClientLayout>
  );
}
