import { useAuth } from "@/_core/hooks/useAuth";
import { ARBEN_LOGO_URL } from "@/components/BrandLogo";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef } from "react";

/**
 * 새 채팅(읽지 않은 메시지) 수가 늘면 **소리 + 크롬 데스크톱 알림**을 띄운다.
 * - 사이트가 브라우저 탭으로 열려 있는 동안만 동작(백그라운드 탭 포함). 완전히 닫으면 X(=Web Push 필요).
 * - 알림 권한은 로그인 후 첫 클릭(사용자 제스처) 때 한 번 요청.
 * - directMessage(리뷰어↔운영) + businessMessage(업체↔리뷰어) unread 합계 기준.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.start();
    o.stop(ctx.currentTime + 0.32);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch { /* 사운드 실패는 무시 */ }
}

export default function ChatNotifier() {
  const { isAuthenticated } = useAuth();

  const { data: dmUnread = 0 } = trpc.directMessage.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });
  const { data: bmUnread = 0 } = trpc.businessMessage.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });
  const total = (dmUnread || 0) + (bmUnread || 0);
  const prevRef = useRef<number | null>(null);

  // 로그인 후 첫 사용자 제스처에서 알림 권한 1회 요청 (브라우저 정책상 제스처 필요).
  useEffect(() => {
    if (!isAuthenticated || typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    const ask = () => {
      Notification.requestPermission().catch(() => {});
      window.removeEventListener("pointerdown", ask);
    };
    window.addEventListener("pointerdown", ask, { once: true });
    return () => window.removeEventListener("pointerdown", ask);
  }, [isAuthenticated]);

  // unread 합계가 늘면 알림.
  useEffect(() => {
    if (!isAuthenticated) {
      prevRef.current = null;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = total;
    if (prev == null || total <= prev) return; // 첫 로드/감소는 무시

    beep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const n = new Notification("💬 새 메시지", {
          body: `읽지 않은 메시지 ${total}건`,
          icon: ARBEN_LOGO_URL,
          tag: "arben-chat",
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch { /* 알림 실패는 무시 */ }
    }
  }, [total, isAuthenticated]);

  return null;
}
