/**
 * 배분(distribute) 캠페인의 "당일 모집" 판정 헬퍼.
 * 정책: 리뷰어는 미래 날짜를 미리 선점할 수 없고, **오늘 배분된 정원**에만 참여할 수 있다.
 * (미리 잡아두고 연락두절 → 진행일 펑크 방지)
 */

/** KST 기준 오늘 'YYYY-MM-DD'. */
export function kstTodayStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export type DistributeToday = {
  /** schedule이 있는 배분 캠페인인지. false면 단일 진행(날짜 제한 없음). */
  isDistribute: boolean;
  /** KST 오늘 날짜. */
  today: string;
  /** 오늘 배분 정원 (없으면 0). */
  todayCap: number;
  /** 오늘 날짜로 이미 배정된 인원 (반려 제외). */
  todayTaken: number;
  /** 오늘 참여 가능 여부. */
  joinable: boolean;
  /** joinable=false 사유: not_today(오늘은 모집 날짜 아님) | full_today(오늘 정원 마감). */
  reason?: "not_today" | "full_today";
};

export function distributeTodayStatus(
  scheduleJson: string | null | undefined,
  parts: { status: string; assignedDate?: string | null }[],
): DistributeToday {
  const today = kstTodayStr();
  const base: DistributeToday = { isDistribute: false, today, todayCap: 0, todayTaken: 0, joinable: true };
  if (!scheduleJson) return base;

  let sched: Record<string, number>;
  try { sched = JSON.parse(scheduleJson); } catch { return base; }
  const hasDates = Object.values(sched).some(v => Number(v) > 0);
  if (!hasDates) return base; // schedule은 있으나 비어있음 → 단일 취급

  const todayCap = Number(sched[today]) || 0;
  let todayTaken = 0;
  for (const p of parts) {
    if (p.status !== "rejected" && p.assignedDate === today) todayTaken++;
  }

  if (todayCap <= 0) {
    return { isDistribute: true, today, todayCap: 0, todayTaken, joinable: false, reason: "not_today" };
  }
  if (todayTaken >= todayCap) {
    return { isDistribute: true, today, todayCap, todayTaken, joinable: false, reason: "full_today" };
  }
  return { isDistribute: true, today, todayCap, todayTaken, joinable: true };
}
