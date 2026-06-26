/**
 * PortOne(포트원) V2 결제대행 연동 — 예치금 가상계좌 자동충전용.
 *
 * 필요한 환경변수 (.env):
 *   PORTONE_API_SECRET     서버 API 시크릿 (절대 노출 금지)
 *   PORTONE_STORE_ID       상점 ID (store-id, 프론트로 전달됨)
 *   PORTONE_CHANNEL_KEY    가상계좌 채널 키 (프론트로 전달됨)
 *   PORTONE_WEBHOOK_SECRET 웹훅 서명 검증용 (선택)
 *
 * 키가 하나라도 없으면 isConfigured()=false 가 되어, 충전 UI는
 * 기존 수동(무통장+관리자 승인) 방식으로 자동 폴백한다.
 */

import crypto from "crypto";

const API_BASE = "https://api.portone.io";

export function getStoreId() {
  return process.env.PORTONE_STORE_ID ?? "";
}

export function getChannelKey() {
  return process.env.PORTONE_CHANNEL_KEY ?? "";
}

/** vbank 자동충전을 켤 수 있는 키가 모두 설정됐는지. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.PORTONE_API_SECRET &&
    process.env.PORTONE_STORE_ID &&
    process.env.PORTONE_CHANNEL_KEY,
  );
}

export type PortOnePayment = {
  status: string; // READY | PAID | VIRTUAL_ACCOUNT_ISSUED | CANCELLED | FAILED ...
  amount: { total: number };
  method?: {
    type?: string;
    bank?: string;
    accountNumber?: string;
    remitteeName?: string;
  } & Record<string, unknown>;
  [k: string]: unknown;
};

/** PortOne API에서 결제건을 조회 (입금 확인의 신뢰 출처). */
export async function getPayment(paymentId: string): Promise<PortOnePayment | null> {
  const secret = process.env.PORTONE_API_SECRET;
  if (!secret) return null;
  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${secret}` },
  });
  if (!res.ok) {
    console.warn(`[PortOne] getPayment ${paymentId} failed: ${res.status}`);
    return null;
  }
  return (await res.json()) as PortOnePayment;
}

/**
 * 웹훅 서명 검증 (Standard Webhooks 규격). PORTONE_WEBHOOK_SECRET 미설정 시 true
 * (이 경우 보안은 getPayment 재조회로 보장). 검증 실패 시 false.
 */
export function verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) return true;
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signature = headers["webhook-signature"];
  if (!id || !timestamp || !signature) return false;
  try {
    const key = secret.startsWith("whsec_")
      ? Buffer.from(secret.slice("whsec_".length), "base64")
      : Buffer.from(secret);
    const signed = `${id}.${timestamp}.${rawBody}`;
    const expected = crypto.createHmac("sha256", key).update(signed).digest("base64");
    // header may carry multiple space-separated "v1,<sig>" entries
    return signature.split(" ").some(part => {
      const sig = part.includes(",") ? part.split(",")[1] : part;
      try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false;
      }
    });
  } catch (e) {
    console.warn("[PortOne] webhook verify error:", e);
    return false;
  }
}
