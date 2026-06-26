/**
 * 상품 정보 기반 자연스러운 한국어 리뷰 "원고 초안" 생성기 (LLM 불필요·비용 0).
 * 문장 풀에서 무작위 조합 + 어순 셔플로 매 호출마다 다른 결과를 만든다.
 * 사진 리뷰어는 실물/사진 언급을, 글자 리뷰어는 사용감·배송·재구매 위주로 톤을 맞춘다.
 */

type DraftType = "photo" | "text";

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number) => Math.random() < p;
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 캠페인 키워드/제목에서 자연스러운 상품 호칭을 뽑는다. */
function productNoun(keyword?: string | null, title?: string | null): string {
  const k = (keyword || "").trim();
  if (k && k.length <= 12) return k;
  const t = (title || "").trim();
  if (t) {
    const first = t.split(/[\s,/·\-(){}\[\]]+/).filter(Boolean)[0];
    if (first && first.length <= 12) return first;
  }
  return "제품";
}

const OPENERS = [
  "평소에 필요했던 거라 바로 구매했어요.",
  "고민하다가 후기 보고 주문했는데 잘 산 것 같아요.",
  "{N} 찾고 있었는데 딱 마음에 들어서 골랐어요.",
  "여러 개 비교하다가 이걸로 결정했어요.",
  "필요해서 구매했는데 기대 이상이네요.",
  "선물용으로 샀는데 받는 분도 좋아하셨어요.",
  "재구매 의사 100%라 또 주문하려구요.",
  "가성비 좋다는 말에 반신반의했는데 만족합니다.",
];

const QUALITY = [
  "마감이 깔끔하고 생각보다 튼튼해요.",
  "품질이 가격 대비 훨씬 좋아요.",
  "재질이 좋아서 고급스러운 느낌이에요.",
  "꼼꼼하게 잘 만들어졌네요.",
  "디자인이 깔끔해서 어디에 둬도 잘 어울려요.",
  "마감 처리가 깔끔해서 만족스러워요.",
  "튼튼해서 오래 쓸 수 있을 것 같아요.",
  "색감이 화면이랑 거의 똑같아요.",
];

const USAGE = [
  "실제로 써보니 활용도가 높네요.",
  "사용하기 편하고 손이 자주 가요.",
  "생각보다 크기도 적당하고 딱 좋아요.",
  "무게도 적당해서 다루기 편해요.",
  "매일 쓰게 될 것 같아요.",
  "사용법이 간단해서 바로 적응했어요.",
  "필요한 기능은 다 있어서 불편함이 없어요.",
];

const DELIVERY = [
  "배송도 빠르고 포장도 꼼꼼했어요.",
  "주문하고 금방 받았어요. 포장 깔끔해요.",
  "배송이 생각보다 빨라서 좋았어요.",
  "포장이 튼튼해서 파손 없이 잘 왔어요.",
  "배송 상태도 깔끔하고 좋았습니다.",
];

const PHOTO_SPECIFIC = [
  "사진으로 본 거랑 실물이 거의 똑같아요.",
  "실물이 사진보다 더 예뻐요.",
  "받아보니 사진이랑 차이 없이 그대로네요.",
  "사진 찍어봤는데 실물 색감이 그대로 나와요.",
  "실물 보고 더 마음에 들었어요.",
];

const CLOSERS = [
  "다음에 또 구매할게요!",
  "주변에도 추천하고 싶어요.",
  "만족스러운 쇼핑이었습니다 :)",
  "잘 쓰겠습니다. 감사해요!",
  "고민 중이시면 추천드려요.",
  "재구매 의사 있어요!",
  "전체적으로 대만족이에요.",
];

const EMOJIS = ["😊", "👍", "🙂", "✨", "💕", "🥰", ""];

/** 한 편의 리뷰 원고를 생성한다. */
export function generateReviewDraft(opts: {
  type: DraftType;
  title?: string | null;
  keyword?: string | null;
}): string {
  const noun = productNoun(opts.keyword, opts.title);
  const fill = (s: string) => s.replace(/\{N\}/g, noun);

  // 본문 문장 풀 구성: 품질/사용감/배송 중에서 2~3개 + (사진형이면) 사진 언급.
  const bodyPool = shuffle([pick(QUALITY), pick(USAGE), pick(DELIVERY)]);
  const bodyCount = chance(0.5) ? 2 : 3;
  const body = bodyPool.slice(0, bodyCount);
  if (opts.type === "photo") {
    // 사진 언급을 앞쪽에 끼워넣음.
    body.splice(chance(0.5) ? 0 : 1, 0, pick(PHOTO_SPECIFIC));
  }

  const parts = [fill(pick(OPENERS)), ...body, pick(CLOSERS)];
  let text = parts.join(" ");

  // 자연스러움을 위해 가끔 이모지를 끝에 붙임.
  const emoji = pick(EMOJIS);
  if (emoji) text += ` ${emoji}`;

  return text;
}
