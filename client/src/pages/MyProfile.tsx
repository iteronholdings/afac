import { useAuth } from "@/_core/hooks/useAuth";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CreditCard, IdCard, Loader2, MapPin, Phone, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** 내 정보 — 기본 정보 확인 + 주소 수정. */
export default function MyProfile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [address, setAddress] = useState("");

  // 최초 로드 시 저장된 주소를 입력칸에 채움.
  useEffect(() => {
    if (user?.address != null) setAddress(user.address);
  }, [user?.address]);

  const save = trpc.auth.updateAddress.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("주소가 저장되었습니다.");
    },
    onError: e => toast.error(e.message),
  });

  const dirty = address.trim() !== (user?.address ?? "");

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <SiteHeader />
      <main className="container max-w-2xl py-8 pb-28">
        <h1 className="mb-1 text-2xl font-bold text-foreground">내 정보</h1>
        <p className="mb-6 text-sm text-muted-foreground">회원 정보를 확인하고 주소를 수정할 수 있어요.</p>

        <div className="space-y-5 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><UserRound className="h-3.5 w-3.5" /> 성명</p>
              <p className="mt-1 font-semibold text-foreground">{user?.fullName || user?.name || "-"}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><IdCard className="h-3.5 w-3.5" /> 아이디</p>
              <p className="mt-1 font-semibold text-foreground">{user?.loginId ?? "-"}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Phone className="h-3.5 w-3.5" /> 전화번호</p>
              <p className="mt-1 font-semibold text-foreground">{user?.phone ?? "-"}</p>
            </div>
            {user?.bankName && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CreditCard className="h-3.5 w-3.5" /> 정산 계좌</p>
                <p className="mt-1 font-semibold text-foreground">{user.bankName} {user.bankAccount} ({user.bankHolder})</p>
              </div>
            )}
          </div>

          <div className="border-t border-border/60 pt-5">
            <Label htmlFor="address" className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" /> 주소<span className="text-xs font-normal text-muted-foreground">(택배 수령용)</span></Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="address" placeholder="예: 부산 해운대구 반여로 96, 101동 101호" maxLength={255}
                value={address} onChange={e => setAddress(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && dirty && address.trim()) save.mutate({ address: address.trim() }); }}
                className="h-11 flex-1"
              />
              <Button className="h-11 shrink-0 font-bold" disabled={save.isPending || !dirty || !address.trim()}
                onClick={() => save.mutate({ address: address.trim() })}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
              </Button>
            </div>
            {!user?.address && (
              <p className="mt-1.5 text-xs text-muted-foreground">아직 주소가 등록되지 않았어요. 캠페인 진행에 필요하니 입력해 주세요.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
