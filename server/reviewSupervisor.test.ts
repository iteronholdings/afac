import { describe, expect, it } from "vitest";
import {
  clampTargetChars,
  draftCharRange,
  superviseGeneratedDraft,
  superviseManualDraft,
} from "./reviewSupervisor";

// 전 카테고리 대표 키워드 (문장 풀이 작은 뷰티·펫·베이비 포함).
const KEYWORDS = ["대추방울토마토", "홍삼스틱", "수분크림", "순면티셔츠", "무선이어폰", "텀블러", "아기물티슈", "강아지사료", "문구세트"];

describe("리뷰 원고 팀장 검수 — 목표 분량", () => {
  it("목표를 달성 가능 범위로 클램프한다", () => {
    expect(clampTargetChars("photo", 3000)).toBe(700);
    expect(clampTargetChars("text", 3000)).toBe(400);
    expect(clampTargetChars("photo", 400)).toBe(400);
    expect(clampTargetChars("text", 150)).toBe(150);
    expect(clampTargetChars("text", 10)).toBe(50);
    expect(clampTargetChars("photo", 0)).toBeNull();
    expect(clampTargetChars("photo", null)).toBeNull();
  });

  it("지정 목표(사진 400 / 글자 150)를 모든 상품에서 범위 내로 생성한다", () => {
    for (const [type, target] of [["photo", 400], ["text", 150]] as const) {
      const { min, max } = draftCharRange(target);
      for (const kw of KEYWORDS) {
        for (let i = 0; i < 8; i++) {
          const r = superviseGeneratedDraft({ type, title: kw, keyword: kw, targetChars: target });
          expect(r.verdict).not.toBe("flagged");
          expect(r.text.length).toBeGreaterThanOrEqual(min);
          expect(r.text.length).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it("상한 초과 목표(1000/3000)도 클램프되어 flagged 없이 생성된다", () => {
    for (const [type, target] of [["photo", 1000], ["photo", 3000], ["text", 1000]] as const) {
      for (const kw of KEYWORDS) {
        for (let i = 0; i < 5; i++) {
          const r = superviseGeneratedDraft({ type, title: kw, keyword: kw, targetChars: target });
          expect(r.verdict).not.toBe("flagged");
        }
      }
    }
  });

  it("목표 미지정이면 기본 길이로 생성된다", () => {
    const r = superviseGeneratedDraft({ type: "photo", title: "대추방울토마토", keyword: "대추방울토마토" });
    expect(r.verdict).not.toBe("flagged");
    expect(r.text.length).toBeGreaterThan(250);
  });

  it("수동 수정도 목표 분량을 크게 벗어나면 경고한다", () => {
    const short = superviseManualDraft("맛있어요. 잘 먹었습니다.", {
      type: "text", title: "대추방울토마토", keyword: "대추방울토마토", targetChars: 400,
    });
    expect(short.verdict).toBe("flagged");
    expect(short.warnings.some(w => w.includes("목표 분량"))).toBe(true);
  });

  it("수동 수정이 목표 범위 안이면 통과한다", () => {
    // 목표 150자로 생성된(=범위 내 보장) 원고를 수동 입력으로 넣으면 분량 경고가 없어야 한다.
    const inRange = superviseGeneratedDraft({
      type: "text", title: "대추방울토마토", keyword: "대추방울토마토", targetChars: 150,
    }).text;
    const r = superviseManualDraft(inRange, {
      type: "text", title: "대추방울토마토", keyword: "대추방울토마토", targetChars: 150,
    });
    expect(r.warnings.some(w => w.includes("목표 분량"))).toBe(false);
  });
});
