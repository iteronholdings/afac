import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { enablePush, pushSupported } from "@/lib/push";
import { Bell, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const SKIP_PREFIXES = ["/login", "/signup", "/onboarding", "/afreviewer/login", "/afreviewer/signup", "/client/login", "/client/signup"];

export default function PushPrompt() {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const { data: cfg } = trpc.push.publicKey.useQuery(undefined, { enabled: isAuthenticated });
  const subscribe = trpc.push.subscribe.useMutation();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const autoSubbedRef = useRef(false);

  const ready = isAuthenticated && cfg?.enabled && !!cfg?.key && pushSupported();
  const onSkippedPage = SKIP_PREFIXES.some(p => location === p || location.startsWith(p + "/"));

  useEffect(() => {
    if (!ready) { setShow(false); return; }
    const perm = Notification.permission;
    if (perm === "granted") {
      // 이미 허용 → 조용히 구독 등록(1회)
      if (!autoSubbedRef.current) {
        autoSubbedRef.current = true;
        enablePush(cfg!.key, s => subscribe.mutateAsync(s)).catch(() => {});
      }
      setShow(false);
      return;
    }
    if (perm === "default" && !onSkippedPage && sessionStorage.getItem("pushPromptDismissed") !== "1") {
      const t = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(t);
    }
    setShow(false);
  }, [ready, location, onSkippedPage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;

  const turnOn = async () => {
    setBusy(true);
    const r = await enablePush(cfg!.key, s => subscribe.mutateAsync(s));
    setBusy(false);
    if (r === "granted") {
      toast.success("알림이 켜졌어요! 새 메시지를 바로 받아요 🔔");
      setShow(false);
    } else if (r === "denied") {
      toast.error("브라우저에서 알림이 차단됐어요. 주소창 자물쇠 → 알림 → '허용'으로 바꿔주세요.");
      setShow(false);
    } else {
      toast.error("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const later = () => {
    sessionStorage.setItem("pushPromptDismissed", "1");
    setShow(false);
  };

  return (
    <Dialog open={show} onOpenChange={o => { if (!o) later(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> 실시간 알림 켜기
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            운영팀·업체와의 <b className="text-foreground">채팅 메시지</b>를 실시간으로 받으려면 알림을 켜주세요.
            사이트를 닫아둬도 새 메시지가 오면 <b className="text-foreground">바로 알림</b>이 옵니다.
          </p>
          <p className="rounded-xl bg-secondary/40 px-3 py-2 text-xs">
            다음에 뜨는 브라우저 창에서 <b className="text-foreground">'허용'</b>을 눌러주세요.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={later}>나중에</Button>
          <Button onClick={turnOn} disabled={busy} className="gap-1.5 font-bold">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            알림 켜기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
