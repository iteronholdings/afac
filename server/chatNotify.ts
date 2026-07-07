/**
 * 운영팀 채팅 도착 알림 — 리뷰어가 사이트를 안 보고 있어도 문자로 알린다.
 * (웹푸시는 구독률이 낮아 보조 수단일 뿐, 확실한 도달은 문자/알림톡)
 *
 * 남발·비용 방지: 리뷰어당 30분에 1회만 발송. 연속 대화 중엔 첫 메시지만 알림.
 * TODO: 솔라피 알림톡(발신프로필+템플릿 승인) 준비되면 sendSms 자리만 알림톡으로 교체.
 */
import * as db from "./db";
import { isSmsConfigured, sendSms } from "./sms";

const COOLDOWN_MS = 30 * 60 * 1000;
const lastNotified = new Map<number, number>();

export async function notifyReviewerChatSms(reviewerId: number): Promise<void> {
  try {
    if (!isSmsConfigured()) return;
    const last = lastNotified.get(reviewerId) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return;
    const reviewer = await db.getUserById(reviewerId);
    const phone = (reviewer?.phone ?? "").replace(/\D/g, "");
    if (!reviewer || reviewer.role !== "user" || !phone || reviewer.withdrawnAt) return;
    lastNotified.set(reviewerId, Date.now()); // 발송 시도 기준 쿨다운(실패해도 재시도 남발 방지)
    await sendSms(phone, "[아르벤팩토리] 운영팀 채팅이 도착했어요. afac.kr 오른쪽 아래 채팅에서 확인해 주세요.");
    console.log("[chat-sms] notified reviewer", reviewerId);
  } catch (e) {
    console.error("[chat-sms] failed:", reviewerId, e instanceof Error ? e.message : e);
  }
}
