/** 웹푸시 구독 유틸 — 알림 권한 요청 → 서비스워커 등록 → 구독 → 서버 저장. */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

export type EnablePushResult = "granted" | "denied" | "unsupported" | "error";

type SubKeys = { endpoint: string; p256dh: string; auth: string };

/**
 * 알림 권한 요청 후 푸시 구독을 만들어 서버에 저장한다.
 * @param vapidPublicKey 서버에서 받은 VAPID 공개키
 * @param save 서버 저장 콜백(trpc push.subscribe)
 */
export async function enablePush(
  vapidPublicKey: string,
  save: (s: SubKeys) => Promise<unknown>,
): Promise<EnablePushResult> {
  if (!pushSupported() || !vapidPublicKey) return "unsupported";
  let perm: NotificationPermission;
  try {
    perm = await Notification.requestPermission();
  } catch {
    return "error";
  }
  if (perm !== "granted") return perm === "denied" ? "denied" : "error";
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }
    const json = sub.toJSON();
    await save({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
    return "granted";
  } catch (e) {
    console.warn("[push] enable failed", e);
    return "error";
  }
}
