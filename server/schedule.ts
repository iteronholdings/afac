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
  /**
   * 오늘 참여 가능 정원 = 오늘 배분분 + 지난 모집일에서 못 채운 인원(이월).
   * 총 slots를 넘지 않도록 전역 잔여 인원으로도 상한을 둔다.
   */
  todayCap: number;
  /** 오늘 날짜로 이미 배정된 인원 (반려 제외). */
  todayTaken: number;
  /** 이월(carryover)로 오늘 정원에 더해진 지난 모집일의 미충원 인원. */
  carriedOver: number;
  /** 오늘 참여 가능 여부. */
  joinable: boolean;
  /** joinable=false 사유: not_today(오늘은 모집 날짜 아님) | full_today(오늘 정원 마감). */
  reason?: "not_today" | "full_today";
};

/**
 * 배분 캠페인의 당일 참여 가능 여부 판정 (이월 포함).
 *
 * 이월(carryover) 정책: 업체가 정한 날짜에 리뷰어가 다 안 모이면 그 미충원분이
 * 사라지지 않고 다음 모집일로 넘어온다. 즉 오늘 정원 =
 *   오늘 배분분 + (지난 모집일들의 미충원 합계)
 * 로 계산해, 예정 인원을 다 채울 때까지 계속 모집한다.
 * (총 slots는 절대 넘지 않도록 전역 잔여 인원으로 상한을 둔다.)
 *
 * @param slots 캠페인 총 모집 인원. 주면 이월분이 총원을 넘지 않도록 보정한다.
 */
export function distributeTodayStatus(
  scheduleJson: string | null | undefined,
  parts: { status: string; assignedDate?: string | null }[],
  slots?: number,
): DistributeToday {
  const today = kstTodayStr();
  const base: DistributeToday = { isDistribute: false, today, todayCap: 0, todayTaken: 0, carriedOver: 0, joinable: true };
  if (!scheduleJson) return base;

  let sched: Record<string, number>;
  try { sched = JSON.parse(scheduleJson); } catch { return base; }
  const hasDates = Object.values(sched).some(v => Number(v) > 0);
  if (!hasDates) return base; // schedule은 있으나 비어있음 → 단일 취급

  // 날짜별 배정 인원 집계 (반려 제외) + 전체 배정 인원.
  const takenByDate: Record<string, number> = {};
  let totalTaken = 0;
  for (const p of parts) {
    if (p.status === "rejected") continue;
    totalTaken++;
    if (p.assignedDate) takenByDate[p.assignedDate] = (takenByDate[p.assignedDate] || 0) + 1;
  }
  const todayTaken = takenByDate[today] || 0;

  // 지난 모집일들의 미충원 합계(이월분). YYYY-MM-DD 문자열 비교 = 날짜 비교.
  let carriedOver = 0;
  for (const [d, capRaw] of Object.entries(sched)) {
    const cap = Number(capRaw) || 0;
    if (cap <= 0 || d >= today) continue; // 오늘·미래는 이월 대상 아님
    carriedOver += Math.max(0, cap - (takenByDate[d] || 0));
  }

  const scheduledToday = Number(sched[today]) || 0;
  let todayCap = scheduledToday + carriedOver;

  // 총 모집 인원(slots) 초과 방지 — 오늘 채울 수 있는 인원은 전역 잔여를 넘지 못한다.
  if (typeof slots === "number" && slots > 0) {
    const globalRemaining = Math.max(0, slots - totalTaken);
    // 전체 정원을 이미 다 채웠으면 오늘 배분/이월과 무관하게 마감.
    if (globalRemaining <= 0) {
      return { isDistribute: true, today, todayCap: 0, todayTaken, carriedOver, joinable: false, reason: "full_today" };
    }
    todayCap = Math.min(todayCap, todayTaken + globalRemaining);
  }

  if (todayCap <= 0) {
    // 오늘 배분분도 없고 이월분도 없음 → 오늘은 모집일 아님.
    return { isDistribute: true, today, todayCap: 0, todayTaken, carriedOver, joinable: false, reason: "not_today" };
  }
  if (todayTaken >= todayCap) {
    return { isDistribute: true, today, todayCap, todayTaken, carriedOver, joinable: false, reason: "full_today" };
  }
  return { isDistribute: true, today, todayCap, todayTaken, carriedOver, joinable: true };
}
