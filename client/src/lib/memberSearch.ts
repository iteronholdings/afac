/** 관리자 회원 검색 — 이름/아이디/회원코드 부분 일치 + 전화번호(숫자만) 부분 일치. */
export function memberMatchesQuery(
  m: {
    fullName?: string | null;
    name?: string | null;
    loginId?: string | null;
    phone?: string | null;
    memberCode?: string | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const texts = [m.fullName, m.name, m.loginId, m.memberCode].filter(Boolean) as string[];
  if (texts.some(t => t.toLowerCase().includes(q))) return true;
  // 숫자가 섞인 검색어는 전화번호로도 매칭 (하이픈 유무 무관)
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length >= 3) {
    const pDigits = (m.phone ?? "").replace(/\D/g, "");
    if (pDigits.includes(qDigits)) return true;
  }
  return false;
}
