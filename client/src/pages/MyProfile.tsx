import { useAuth } from "@/_core/hooks/useAuth";
import AddressSearchInput from "@/components/AddressSearchInput";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CreditCard, IdCard, Loader2, MapPin, Phone, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** 내 정보 — 기본 정보 확인 + 주소·정산 계좌 수정. */
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

  // 정산 계좌 수정
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankHolder, setBankHolder] = useState("");
  useEffect(() => {
    setBankName(user?.bankName ?? "");
    setBankAccount(user?.bankAccount ?? "");
    setBankHolder(user?.bankHolder ?? "");
  }, [user?.bankName, user?.bankAccount, user?.bankHolder]);

  const saveBank = trpc.auth.updateBankInfo.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("정산 계좌가 저장되었습니다.");
    },
    onError: e => toast.error(e.message),
  });
  const bankDirty =
    bankName.trim() !== (user?.bankName ?? "") ||
    bankAccount.trim() !== (user?.bankAccount ?? "") ||
    bankHolder.trim() !== (user?.bankHolder ?? "");
  const bankFilled = !!(bankName.trim() && bankAccount.trim() && bankHolder.trim());

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
          </div>

          {/* 정산 계좌 수정 */}
          <div className="border-t border-border/60 pt-5">
            <Label className="flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-primary" /> 정산 계좌<span className="text-xs font-normal text-muted-foreground">(수당 지급용)</span></Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.6fr_1fr]">
              <Input placeholder="은행명" value={bankName} maxLength={50}
                onChange={e => setBankName(e.target.value)} className="h-11" />
              <Input placeholder="계좌번호 (숫자·- 만)" value={bankAccount} maxLength={50} inputMode="numeric"
                onChange={e => setBankAccount(e.target.value)} className="h-11" />
              <Input placeholder="예금주" value={bankHolder} maxLength={50}
                onChange={e => setBankHolder(e.target.value)} className="h-11" />
            </div>
            <div className="mt-2 flex justify-end">
              <Button className="h-10 shrink-0 font-bold" disabled={saveBank.isPending || !bankDirty || !bankFilled}
                onClick={() => {
                  const acct = bankAccount.trim();
                  if (!/^[0-9-]+$/.test(acct)) { toast.error("계좌번호는 숫자와 하이픈(-)만 입력할 수 있어요."); return; }
                  if (acct.replace(/-/g, "").length < 6) { toast.error("계좌번호를 정확히 입력해 주세요."); return; }
                  saveBank.mutate({ bankName: bankName.trim(), bankAccount: acct, bankHolder: bankHolder.trim() });
                }}>
                {saveBank.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "계좌 저장"}
              </Button>
            </div>
            {!user?.bankName && (
              <p className="mt-1.5 text-xs text-muted-foreground">아직 계좌가 등록되지 않았어요. 수당 지급에 필요하니 입력해 주세요.</p>
            )}
          </div>

          <div className="border-t border-border/60 pt-5">
            <Label className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" /> 주소<span className="text-xs font-normal text-muted-foreground">(택배 수령용)</span></Label>
            <div className="mt-2">
              <AddressSearchInput value={address} onChange={setAddress} />
            </div>
            <div className="mt-2 flex justify-end">
              <Button className="h-10 shrink-0 font-bold" disabled={save.isPending || !dirty || !address.trim()}
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
