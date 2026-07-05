import crypto from "crypto";

/**
 * 솔라피(Solapi) SMS 발송 — 회원가입 전화번호 인증용.
 * 환경변수 3개(SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER)가 모두 있어야 활성화.
 * 미설정이면 인증 기능이 자동 비활성(기존 가입 방식 유지)되므로 배포 순서에 안전하다.
 */
const apiKey = () => process.env.SOLAPI_API_KEY ?? "";
const apiSecret = () => process.env.SOLAPI_API_SECRET ?? "";
const sender = () => process.env.SOLAPI_SENDER ?? "";

export function isSmsConfigured(): boolean {
  return !!(apiKey() && apiSecret() && sender());
}

/** 숫자만 남긴 전화번호 (010-1234-5678 → 01012345678). */
export function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

/** 솔라피 단건 발송. HMAC-SHA256 서명 인증. */
export async function sendSms(to: string, text: string): Promise<void> {
  if (!isSmsConfigured()) throw new Error("SMS가 설정되지 않았습니다.");
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret()).update(date + salt).digest("hex");

  const res = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      Authorization: `HMAC-SHA256 apiKey=${apiKey()}, date=${date}, salt=${salt}, signature=${signature}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: { to: normalizePhone(to), from: normalizePhone(sender()), text },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[SMS] send failed:", res.status, body.slice(0, 300));
    throw new Error("인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
