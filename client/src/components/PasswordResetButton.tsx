import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Admin button + dialog to reset a member's password. */
export default function PasswordResetButton({
  userId,
  name,
  className,
}: {
  userId: number;
  name: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const mutation = trpc.admin.setMemberPassword.useMutation({
    onSuccess: () => {
      toast.success("비밀번호가 변경되었습니다.");
      close();
    },
    onError: err => toast.error(err.message),
  });

  const close = () => { setOpen(false); setPw(""); setPw2(""); };

  const submit = () => {
    if (pw.length < 6) { toast.error("비밀번호는 6자 이상이어야 합니다."); return; }
    if (pw !== pw2) { toast.error("비밀번호가 일치하지 않습니다."); return; }
    mutation.mutate({ userId, newPassword: pw });
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={`h-8 gap-1 rounded-full text-muted-foreground hover:text-foreground ${className ?? ""}`}
        onClick={() => setOpen(true)}
      >
        <KeyRound className="h-3.5 w-3.5" /> 비번 변경
      </Button>

      <Dialog open={open} onOpenChange={o => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> 비밀번호 변경
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">대상</span> <b className="text-foreground">{name}</b>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newpw">새 비밀번호</Label>
              <Input id="newpw" type="password" autoComplete="new-password" placeholder="6자 이상"
                value={pw} onChange={e => setPw(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newpw2">새 비밀번호 확인</Label>
              <Input id="newpw2" type="password" autoComplete="new-password" placeholder="다시 입력"
                value={pw2} onChange={e => setPw2(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()} className="h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>취소</Button>
            <Button onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              변경하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
