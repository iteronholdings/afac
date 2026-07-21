/**
 * 리뷰 원고 팀장 검수 에이전트 (LLM 불필요·규칙 기반).
 *
 * 역할: 리뷰어에게 배정되는 **모든 리뷰 원고**가 실제 게시되기 전에 팀 편집 기준을 통과했는지
 * 검수한다. 기계적으로 고칠 수 있는 건 바로잡고(이모지·특수문자·중복문장), 하드 위반이 남으면
 * 자동 생성분은 재생성해 깨끗한 원고를 뽑는다. 사람이 직접 쓴 원고(업체·관리자 수정)는
 * 미용 수정만 적용하고 위험 표현은 경고로 알린다.
 *
 * 검수 기준(그동안 누적된 팀 규칙):
 *  - 정직성: 구매자가 아닌 '재배자'인 척하는 표현 금지(직접 재배/우리가 키운 등).
 *  - 표시광고 리스크: 식품·건강식품의 치료·완치·효능 단정 금지.
 *  - AI 티 제거: 이모지·과도한 느낌표(!!) 금지.
 *  - 템플릿 잔재({N}·undefined 등)·인접 중복 문장 금지.
 *  - 검색 키워드 1회 이상 포함(상위노출), 과도한 키워드 반복(스팸) 경고.
 *  - 유형별 자연스러운 길이 범위.
 */

import { detectCategory, generateReviewDraft, productNoun, type Category } from "./reviewDraft";

export type QcVerdict = "pass" | "fixed" | "regenerated" | "flagged";

export type QcResult = {
  /** 검수·정리를 마친 최종 원고. */
  text: string;
  verdict: QcVerdict;
  /** 사람이 확인해야 할 남은 문제(하드 위반). 없으면 빈 배열. */
  warnings: string[];
};

type Ctx = {
  type: "photo" | "text";
  title?: string | null;
  keyword?: string | null;
  /** 캠페인이 지정한 목표 분량("n자 내외"). 있으면 이 범위를 지키는지 검수한다. */
  targetChars?: number | null;
};

/**
 * 목표 분량("n자 내외")의 실제 허용 상한 — 규칙 기반 생성기가 어떤 상품 카테고리에서도
 * 자연스럽게(문장 반복 없이) 채울 수 있는 한계. 전 카테고리 검증 기준(뷰티·펫·베이비 포함):
 *   사진 최대 700자 / 글자 최대 400자. 이보다 큰 목표는 이 값으로 낮춰 적용한다
 *   (안 그러면 목표를 못 채워 항상 flagged가 됨). 너무 짧은 값은 50자로 올린다.
 */
const TARGET_MIN = 50;
const TARGET_MAX: Record<"photo" | "text", number> = { photo: 700, text: 400 };

/** 지정된 목표 분량을 달성 가능한 범위로 정규화. null/0이면 null(기본 길이). */
export function clampTargetChars(type: "photo" | "text", target?: number | null): number | null {
  if (!target || target <= 0) return null;
  return Math.min(Math.max(target, TARGET_MIN), TARGET_MAX[type]);
}

/** 목표 분량 허용 범위 — ±20%(최소 ±40자). "내외"의 실무 기준. */
export function draftCharRange(target: number): { min: number; max: number } {
  const tol = Math.max(40, Math.round(target * 0.2));
  return { min: target - tol, max: target + tol };
}

// 이모지(그림문자) 매칭 — u 플래그 없이(서로게이트 쌍 + BMP 기호 범위).
// 아스트랄 영역 문자는 한국어 리뷰에선 사실상 이모지뿐이라 쌍 전체를 대상으로 둔다.
const EMOJI_RE =
  /[☀-➿⬀-⯿←-⇿⌀-⏿︀-️™ℹ]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

// 재배자 사칭(구매자가 "직접 재배했다"고 하면 허위) — [[feedback-no-direct-cultivation-claim]]
const CULTIVATION_RE =
  /(직접|우리가|저희가|제가|내가)\s*(재배|키운|기른|기르|농사|수확)|산지에서\s*직접\s*(재배|키움|생산)|직접\s*(재배|농사)한/;

// 식품·건강식품 치료·효능 단정 (표시광고법 리스크).
const MEDICAL_RE =
  /(완치|치료|병이?\s*(나았|낫|나음)|질병.*예방|효능이?\s*(확실|입증|탁월)|약\s*(대신|처럼|효과)|부작용\s*(전혀\s*)?없|불면증|당뇨|고혈압|암\s*예방)/;

/** 문장 단위 분해 (마침표·물음표·느낌표 뒤 공백 기준). */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.?!。])\s+/).map(s => s.trim()).filter(Boolean);
}

/** 기계적으로 안전하게 고칠 수 있는 것만 정리 — 의미를 바꾸지 않는다. */
export function applyCosmeticFixes(text: string): { text: string; changed: boolean } {
  let out = text;
  const before = out;
  out = out.replace(EMOJI_RE, "");                 // 이모지 제거
  out = out.replace(/!{2,}/g, ".");                // "!!" → "."
  out = out.replace(/~{2,}/g, "");                 // "~~" 물결 남용 제거
  out = out.replace(/\s{2,}/g, " ");               // 중복 공백
  // 인접 중복 문장 제거
  const sents = splitSentences(out);
  const deduped: string[] = [];
  for (const s of sents) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== s) deduped.push(s);
  }
  out = deduped.join(" ").trim();
  return { text: out, changed: out !== before.trim() };
}

/** 하드 위반(재생성/경고 대상) 목록. 미용 수정으로 해결되지 않는 것만. */
function hardIssues(text: string, ctx: Ctx): string[] {
  const issues: string[] = [];
  const cat: Category = detectCategory(ctx.keyword, ctx.title);
  const noun = productNoun(ctx.keyword, ctx.title);

  if (/[{}]|undefined|\bNaN\b|\bnull\b/.test(text)) issues.push("템플릿 잔재(치환 안 된 값)");
  if (ctx.keyword && !text.includes(noun)) issues.push(`검색 키워드('${noun}') 누락`);
  if (CULTIVATION_RE.test(text)) issues.push("재배자 사칭 표현(구매자는 재배자가 아님)");
  if ((cat === "food" || cat === "health") && MEDICAL_RE.test(text)) issues.push("치료·효능 단정 표현(표시광고 리스크)");

  const len = text.length;
  if (ctx.targetChars && ctx.targetChars > 0) {
    // 캠페인이 "n자 내외"를 지정한 경우 — 그 범위를 지켰는지만 본다.
    const { min, max } = draftCharRange(ctx.targetChars);
    if (len < min || len > max) issues.push(`목표 분량(${ctx.targetChars}자 내외) 벗어남(${len}자)`);
  } else {
    if (ctx.type === "photo" && (len < 250 || len > 1400)) issues.push(`사진 원고 길이 이상(${len}자)`);
    if (ctx.type === "text" && (len < 15 || len > 260)) issues.push(`글자 원고 길이 이상(${len}자)`);
  }
  return issues;
}

/** 참고용 소프트 경고(차단 안 함) — 키워드 스팸 등. */
function softNotes(text: string, ctx: Ctx): string[] {
  const notes: string[] = [];
  const noun = productNoun(ctx.keyword, ctx.title);
  if (noun && noun !== "제품") {
    const count = text.split(noun).length - 1;
    if (count >= 5) notes.push(`키워드 반복 과다(${count}회) — 스팸으로 보일 수 있음`);
  }
  return notes;
}

/**
 * 자동 생성 원고 검수: 생성 → 미용 정리 → 하드 위반 시 재생성(최대 6회) → 가장 깨끗한 원고 채택.
 * 팀장 검수를 반드시 통과한 원고만 반환한다.
 */
export function superviseGeneratedDraft(rawCtx: Ctx): QcResult {
  // 목표 분량을 달성 가능 범위로 정규화 — 생성·검수가 같은 값을 쓰게 해 불달성 flagged를 없앤다.
  const ctx: Ctx = { ...rawCtx, targetChars: clampTargetChars(rawCtx.type, rawCtx.targetChars) };
  let best: { text: string; issues: string[]; cosmetic: boolean } | null = null;
  let regenerated = false;

  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) regenerated = true;
    const raw = generateReviewDraft({
      type: ctx.type, title: ctx.title, keyword: ctx.keyword, targetChars: ctx.targetChars,
    });
    const fixed = applyCosmeticFixes(raw);
    const issues = hardIssues(fixed.text, ctx);
    const cand = { text: fixed.text, issues, cosmetic: fixed.changed };
    if (issues.length === 0) {
      // 깨끗한 원고 확보 — 재생성 여부에 따라 verdict 결정.
      const verdict: QcVerdict = regenerated ? "regenerated" : cand.cosmetic ? "fixed" : "pass";
      return { text: cand.text, verdict, warnings: [] };
    }
    // 더 나은 후보(위반 적은 쪽) 유지.
    if (!best || issues.length < best.issues.length) best = cand;
  }

  // 6회 시도에도 완벽하지 않으면 가장 나은 후보 + 경고 반환(빈 원고보다 안전).
  const b = best!;
  return { text: b.text, verdict: "flagged", warnings: b.issues };
}

/**
 * 사람이 직접 쓴 원고(업체·관리자 수정) 검수: 미용 정리만 적용하고,
 * 하드 위반(위험 표현)은 경고로 알린다. 사람 의도는 존중해 재작성하지 않는다.
 */
export function superviseManualDraft(text: string, rawCtx: Ctx): QcResult {
  const ctx: Ctx = { ...rawCtx, targetChars: clampTargetChars(rawCtx.type, rawCtx.targetChars) };
  const fixed = applyCosmeticFixes(text);
  const hard = hardIssues(fixed.text, ctx).filter(
    // 사람이 직접 쓴 원고는 강제 재작성하지 않고 경고만: 위험 표현 + 목표 분량 이탈.
    i => i.includes("재배자") || i.includes("치료") || i.includes("템플릿") || i.includes("목표 분량"),
  );
  const soft = softNotes(fixed.text, ctx);
  const warnings = [...hard, ...soft];
  const verdict: QcVerdict = warnings.length > 0 ? "flagged" : fixed.changed ? "fixed" : "pass";
  return { text: fixed.text, verdict, warnings };
}
