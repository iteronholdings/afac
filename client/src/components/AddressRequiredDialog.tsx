import { useAuth } from "@/_core/hooks/useAuth";
import AddressSearchInput from "@/components/AddressSearchInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * 주소 미등록 리뷰어에게 택배 수령 주소 입력을 요구하는 필수 모달.
 * (주소 필드 도입 전 가입한 기존 회원 대상 — 저장하기 전엔 닫을 수 없다)
 */
export default function AddressRequiredDialog() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [address, setAddress] = useState("");
  const save = trpc.auth.updateAddress.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate(); // user.address가 채워지면 모달이 자동으로 사라짐
      toast.success("주소가 등록되었습니다. 감사합니다!");
    },
    onError: e => toast.error(e.message),
  });

  const open = !!user && user.role === "user" && !user.address;
  if (!open) return null;

  const submit = () => {
    if (!address.trim()) {
      toast.error("주소를 입력해 주세요.");
      return;
    }
    save.mutate({ address: address.trim() });
  };

  return (
    <Dialog open onOpenChange={() => { /* 저장 전 닫기 불가 */ }}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> 택배 수령 주소를 등록해 주세요
          </DialogTitle>
          <DialogDescription>
            캠페인 상품 발송을 위해 주소가 꼭 필요해요. 한 번만 등록하면 되고,
            이후 내 정보에서 언제든 수정할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <AddressSearchInput value={address} onChange={setAddress} />
        <Button className="h-11 w-full font-bold" disabled={save.isPending || !address.trim()} onClick={submit}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "주소 저장"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
