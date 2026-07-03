import { CalendarDays, Users } from "lucide-react";

/**
 * 리뷰어 캠페인 상세용 모집 현황.
 * - 배분(날짜별) 캠페인: "오늘 N자리 남음" + 날짜별 모집 캘린더(지난날 종료 / 오늘 강조 / 예정).
 * - 단일 캠페인: 기존 "모집 X/Y명 · 잔여 N자리" 한 줄.
 */
type Props = {
  schedule?: string | null;
  /** 날짜별 이미 배정된 인원 (서버 listOpen이 배분 캠페인에 내려줌). */
  takenByDate?: Record<string, number> | null;
  taken: number;
  slots: number;
  /** 배분 캠페인은 '오늘 남은 자리', 단일은 전체 잔여. */
  remaining: number;
};

/** 오늘 'YYYY-MM-DD' (로컬 기준 — toISOString은 UTC라 하루 밀림). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** '2026-07-04' → '7/4(금)' */
function dateLabel(s: string): string {
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return s.slice(5).replace("-", "/");
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/** schedule JSON({날짜:인원}) → 날짜순 [날짜, 정원][]. */
function parseSchedule(json?: string | null): [string, number][] {
  if (!json) return [];
  try {
    const s = JSON.parse(json) as Record<string, number>;
    return Object.entries(s)
      .filter(([, n]) => Number(n) > 0)
      .map(([d, n]) => [d, Number(n)] as [string, number])
      .sort((a, b) => a[0].localeCompare(b[0]));
  } catch {
    return [];
  }
}

export default function RecruitScheduleInfo({ schedule, takenByDate, taken, slots, remaining }: Props) {
  const entries = parseSchedule(schedule);

  // 단일 캠페인 — 기존 한 줄 표기.
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">
          모집 {taken}/{slots}명 · 잔여 {remaining}자리
        </span>
      </div>
    );
  }

  const today = todayStr();
  const takenBy = takenByDate ?? {};

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
          <CalendarDays className="h-4 w-4" /> 날짜별 모집 캠페인
        </p>
        <p className="text-sm font-extrabold text-primary">오늘 {remaining}자리 남음</p>
      </div>

      {/* 날짜별 모집 캘린더 */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {entries.map(([d, cap]) => {
          const t = takenBy[d] ?? 0;
          const isToday = d === today;
          const past = d < today;
          const full = t >= cap;
          return (
            <div
              key={d}
              className={`rounded-lg border px-2 py-1.5 text-center leading-tight ${
                isToday
                  ? "border-primary bg-card shadow-sm ring-1 ring-primary/40"
                  : past
                    ? "border-border/50 bg-muted/40 opacity-60"
                    : "border-border bg-card"
              }`}
            >
              <p className={`text-[11px] font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                {dateLabel(d)}{isToday && <span className="ml-0.5 rounded bg-primary px-1 text-[9px] font-bold text-primary-foreground">오늘</span>}
              </p>
              <p className={`mt-0.5 text-[11px] font-semibold ${
                isToday ? (full ? "text-muted-foreground" : "text-primary") : "text-muted-foreground"
              }`}>
                {past ? "종료" : isToday ? (full ? "오늘 마감" : `${cap - t}자리 남음`) : `${cap}명 예정`}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        ※ 각 날짜 인원은 <b className="text-foreground">그 날 당일에만</b> 참여할 수 있어요. 참여한 날이 곧 진행일입니다.
      </p>
    </div>
  );
}
