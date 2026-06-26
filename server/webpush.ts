/**
 * 웹푸시(Web Push) 발송 — 채팅 메시지 도착 시 수신자에게 푸시.
 * 사이트를 닫아도 알림이 가며, 사용자가 브라우저에서 알림을 "허용"한 경우에만 동작.
 *
 * 환경변수(.env / Railway):
 *   VAPID_PUBLIC_KEY   공개키(프론트로 전달)
 *   VAPID_PRIVATE_KEY  비밀키(서버 전용)
 *   VAPID_SUBJECT      mailto:이메일
 * 키가 없으면 isConfigured()=false → 푸시는 조용히 비활성(인앱 알림은 별개로 동작).
 */
import webpush from "web-push";
import * as db from "./db";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@afac.kr", pub, priv);
  configured = true;
  return true;
}

export function isConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

export type PushPayload = { title: string; body: string; url?: string };

/** 특정 사용자의 모든 구독으로 푸시 발송. 만료된 구독은 정리. */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const subs = await db.listPushSubscriptionsByUser(userId);
  if (!subs.length) return;
  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await db.deletePushSubscriptionByEndpoint(s.endpoint).catch(() => {});
        } else {
          console.warn("[webpush] send failed:", code);
        }
      }
    }),
  );
}
