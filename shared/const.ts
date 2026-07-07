export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/**
 * 우편번호 검색으로 입력된 완전한 배송 주소인지 — "(12345) …" 형식.
 * 구형식(자유 입력) 주소는 미완성으로 취급해 재등록을 요구한다.
 */
export const isCompleteAddress = (addr?: string | null): boolean => /^\(\d{5}\)\s/.test(addr ?? "");
