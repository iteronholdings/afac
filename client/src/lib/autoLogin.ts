/**
 * 자동 로그인 저장소 (이 브라우저 한정).
 * - 아이디 저장: 로그인 아이디만 기억해 다음에 미리 채움.
 * - 자동 로그인: 로그인 정보를 이 기기에 저장해 로그인 페이지 진입 시 자동 로그인.
 *   (사용자가 명시적으로 로그아웃하면 해제된다 — 로그아웃 루프 방지)
 */

const ID_KEY = "af_saved_login_id";
const AUTO_KEY = "af_auto_login";

type Portal = "reviewer" | "client";

/** 유니코드 안전 base64 (평문 노출 완화용 난독화 — 암호화 아님). */
const enc = (s: string) => btoa(String.fromCharCode.apply(null, Array.from(new TextEncoder().encode(s))));
const dec = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));

export function saveLoginId(loginId: string) {
  try { localStorage.setItem(ID_KEY, loginId); } catch { /* ignore */ }
}
export function loadLoginId(): string {
  try { return localStorage.getItem(ID_KEY) ?? ""; } catch { return ""; }
}
export function clearLoginId() {
  try { localStorage.removeItem(ID_KEY); } catch { /* ignore */ }
}

export function saveAutoLogin(portal: Portal, loginId: string, password: string) {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify({ portal, id: enc(loginId), pw: enc(password) }));
  } catch { /* ignore */ }
}

export function loadAutoLogin(portal: Portal): { loginId: string; password: string } | null {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { portal?: Portal; id?: string; pw?: string };
    if (v.portal !== portal || !v.id || !v.pw) return null;
    return { loginId: dec(v.id), password: dec(v.pw) };
  } catch {
    return null;
  }
}

export function hasAutoLogin(portal: Portal): boolean {
  return loadAutoLogin(portal) !== null;
}

/** 자동 로그인 해제 (명시적 로그아웃·로그인 실패 시). 저장된 아이디는 유지. */
export function clearAutoLogin() {
  try { localStorage.removeItem(AUTO_KEY); } catch { /* ignore */ }
}
