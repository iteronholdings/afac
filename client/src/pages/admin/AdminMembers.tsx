import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import PasswordResetButton from "@/components/PasswordResetButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AddressSearchInput from "@/components/AddressSearchInput";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { memberMatchesQuery } from "@/lib/memberSearch";
import { Check, Copy, Crown, MapPin, MessageCircle, Pencil, RotateCcw, Search, Shield, ShieldCheck, ShieldOff, UserCog, UserX, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function AdminMembers() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const { data: allMembers, isLoading } = trpc.admin.listMembers.useQuery();

  // 검색(이름/아이디/전화번호/코드) + 활동/탈퇴 탭
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"active" | "withdrawn">("active");

  // 리뷰어 관리 — 업체(비즈니스) 계정은 '업체 관리'에서 따로 관리.
  const { members, withdrawnCount, activeCount } = useMemo(() => {
    const reviewers = (allMembers ?? []).filter(m => m.role !== "business");
    const matched = reviewers.filter(m => memberMatchesQuery(m, query));
    return {
      members: matched.filter(m => (tab === "withdrawn" ? !!m.withdrawnAt : !m.withdrawnAt)),
      activeCount: matched.filter(m => !m.withdrawnAt).length,
      withdrawnCount: matched.filter(m => !!m.withdrawnAt).length,
    };
  }, [allMembers, query, tab]);

  const iAmOwner = !!allMembers?.find(m => m.isSelf)?.isOwner;

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("주소를 복사했어요.");
    } catch {
      toast.info(address);
    }
  };

  // 강제 탈퇴(블랙) / 복구
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: number; name: string } | null>(null);
  const withdrawMutation = trpc.admin.withdrawMember.useMutation({
    onSuccess: () => {
      utils.admin.listMembers.invalidate();
      toast.success("탈퇴 처리했습니다. 해당 계정은 로그인과 동일 번호 재가입이 차단됩니다.");
    },
    onError: err => toast.error(err.message),
  });
  const restoreMutation = trpc.admin.restoreMember.useMutation({
    onSuccess: () => {
      utils.admin.listMembers.invalidate();
      toast.success("계정을 복구했습니다. 다시 로그인할 수 있습니다.");
    },
    onError: err => toast.error(err.message),
  });

  // memberCode inline edit state: memberId → draft string
  const [editingCode, setEditingCode] = useState<Record<number, string>>({});

  // 회원 정보(아이디·전화번호·주소) 수정 다이얼로그 대상
  const [editTarget, setEditTarget] = useState<
    { id: number; loginId: string | null; phone: string | null; address: string | null; fullName: string | null; name: string | null; isOwner: boolean } | null
  >(null);

  const setRoleMutation = trpc.admin.setRole.useMutation({
    onSuccess: () => {
      utils.admin.listMembers.invalidate();
      toast.success("권한이 변경되었습니다.");
    },
    onError: err => toast.error(err.message),
  });

  const setCodeMutation = trpc.admin.setMemberCode.useMutation({
    onSuccess: (_, vars) => {
      utils.admin.listMembers.invalidate();
      setEditingCode(prev => { const n = { ...prev }; delete n[vars.userId]; return n; });
      toast.success("회원 코드가 저장되었습니다.");
    },
    onError: err => toast.error(err.message),
  });

  return (
    <AdminLayout
      title="리뷰어 관리"
      description="리뷰어 회원을 확인하고 관리자 권한을 부여하거나 회수합니다. (업체는 '업체 관리'에서)"
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="이름·아이디·전화번호 검색"
            className="h-9 w-56 bg-card pl-9"
          />
        </div>
      }
    >
      {/* 활동 / 탈퇴 탭 */}
      <div className="mb-4 flex gap-2">
        {([["active", `활동 회원 ${activeCount}`], ["withdrawn", `탈퇴 회원 ${withdrawnCount}`]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setTab(v)}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-all ${
              tab === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {!iAmOwner && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            권한 부여·회수는 <b>최상위 관리자</b>만 수행할 수 있습니다. 현재 계정은 회원 목록 열람만 가능합니다.
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !members || members.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">{query ? "검색 결과가 없습니다" : tab === "withdrawn" ? "탈퇴 처리된 회원이 없습니다" : "가입한 회원이 없습니다"}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>회원</TableHead>
                <TableHead className="hidden sm:table-cell">아이디</TableHead>
                <TableHead className="hidden md:table-cell">전화번호</TableHead>
                <TableHead>권한</TableHead>
                <TableHead>코드</TableHead>
                <TableHead className="text-right">채팅</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(m => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {(m.fullName || m.name || "?").charAt(0)}
                      </span>
                      <div className="leading-tight">
                        <p className="font-medium">
                          {m.fullName || m.name || "이름 미상"}
                          {m.isSelf && <span className="ml-1 text-xs text-muted-foreground">(나)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground sm:hidden">
                          {m.loginId || m.loginMethod || "-"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {m.loginId || <span className="italic">{m.loginMethod}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    <p>{m.phone || "-"}</p>
                    {!m.address && m.role === "user" && (
                      <p className="mt-0.5 text-xs text-muted-foreground/60">주소 미등록</p>
                    )}
                    {m.address && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                            <MapPin className="h-3 w-3" /> 주소 보기
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80 p-3">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 text-primary" /> {m.fullName || m.name || "-"} 님의 주소 (택배 수령용)
                          </p>
                          <p className="mt-1.5 break-all text-sm font-medium text-foreground">{m.address}</p>
                          <Button size="sm" variant="outline" className="mt-2 h-7 gap-1 rounded-full bg-card text-xs"
                            onClick={() => copyAddress(m.address!)}>
                            <Copy className="h-3 w-3" /> 복사
                          </Button>
                        </PopoverContent>
                      </Popover>
                    )}
                    {m.withdrawnAt && (
                      <p className="text-xs font-semibold text-destructive">
                        탈퇴 {new Date(m.withdrawnAt).toLocaleDateString("ko-KR")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.isOwner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        <Crown className="h-3.5 w-3.5" /> 최상위 관리자
                      </span>
                    ) : m.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        <ShieldCheck className="h-3.5 w-3.5" /> 관리자
                      </span>
                    ) : m.role === "business" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        업체
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        리뷰어
                      </span>
                    )}
                  </TableCell>
                  {/* 회원 코드 셀 */}
                  <TableCell>
                    {editingCode[m.id] !== undefined ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingCode[m.id]}
                          onChange={e => setEditingCode(prev => ({ ...prev, [m.id]: e.target.value }))}
                          className="h-7 w-24 px-2 text-xs"
                          placeholder="A-001"
                          onKeyDown={e => {
                            if (e.key === "Enter") setCodeMutation.mutate({ userId: m.id, memberCode: editingCode[m.id] });
                            if (e.key === "Escape") setEditingCode(prev => { const n = { ...prev }; delete n[m.id]; return n; });
                          }}
                        />
                        <button
                          className="text-green-600 hover:text-green-700"
                          onClick={() => setCodeMutation.mutate({ userId: m.id, memberCode: editingCode[m.id] })}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingCode(prev => { const n = { ...prev }; delete n[m.id]; return n; })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1.5 group"
                        onClick={() => setEditingCode(prev => ({ ...prev, [m.id]: m.memberCode ?? "" }))}
                      >
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono font-medium text-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          {m.memberCode ?? "미지정"}
                        </span>
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-card"
                        onClick={() => setEditTarget({ id: m.id, loginId: m.loginId, phone: m.phone, address: m.address, fullName: m.fullName, name: m.name, isOwner: m.isOwner })}
                      >
                        <UserCog className="mr-1.5 h-3.5 w-3.5" /> 정보수정
                      </Button>
                      {!m.isSelf && m.role !== "admin" && !m.isOwner && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-card"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent("open-dm", { detail: { reviewerId: m.id, reviewerName: m.fullName || m.name || m.loginId } })
                            )
                          }
                        >
                          <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> 채팅
                        </Button>
                      )}
                      {!m.isOwner && (
                        <PasswordResetButton userId={m.id} name={m.fullName || m.name || m.loginId || "-"} />
                      )}
                      {m.withdrawnAt ? (
                        <Button size="sm" variant="outline" className="bg-card" disabled={restoreMutation.isPending}
                          onClick={() => restoreMutation.mutate({ userId: m.id })}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 복구
                        </Button>
                      ) : (
                        !m.isSelf && !m.isOwner && m.role !== "admin" && (
                          <Button size="sm" variant="outline" className="bg-card text-destructive hover:text-destructive" disabled={withdrawMutation.isPending}
                            onClick={() => setWithdrawTarget({ id: m.id, name: m.fullName || m.name || m.loginId || "-" })}>
                            <UserX className="mr-1.5 h-3.5 w-3.5" /> 탈퇴
                          </Button>
                        )
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {m.isOwner || !iAmOwner ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : m.role === "admin" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-card"
                        disabled={setRoleMutation.isPending}
                        onClick={() => setRoleMutation.mutate({ userId: m.id, role: "user" })}
                      >
                        <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> 권한 회수
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={setRoleMutation.isPending}
                        onClick={() => setRoleMutation.mutate({ userId: m.id, role: "admin" })}
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> 관리자 지정
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 강제 탈퇴(블랙) 확인 */}
      <AlertDialog open={withdrawTarget !== null} onOpenChange={o => !o && setWithdrawTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>회원을 탈퇴(블랙) 처리할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{withdrawTarget?.name}</span> 님은 즉시 로그아웃되며,
              로그인과 동일 전화번호로의 재가입이 차단됩니다. 탈퇴 회원 탭에서 언제든 복구할 수 있어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={withdrawMutation.isPending}
              onClick={() => {
                if (withdrawTarget) withdrawMutation.mutate({ userId: withdrawTarget.id });
                setWithdrawTarget(null);
              }}
            >
              탈퇴 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 회원 정보(아이디·전화번호·주소) 수정 */}
      <MemberEditDialog member={editTarget} onClose={() => setEditTarget(null)} />
    </AdminLayout>
  );
}

/** 관리자: 회원 아이디·전화번호·주소 수정 다이얼로그. */
function MemberEditDialog({
  member,
  onClose,
}: {
  member: { id: number; loginId: string | null; phone: string | null; address: string | null; fullName: string | null; name: string | null; isOwner: boolean } | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [loginId, setLoginId] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // 대상이 바뀌면 현재 값으로 초기화
  useEffect(() => {
    setLoginId(member?.loginId ?? "");
    setPhone(member?.phone ?? "");
    setAddress(member?.address ?? "");
  }, [member?.id]);

  const update = trpc.admin.updateMemberInfo.useMutation({
    onSuccess: () => {
      utils.admin.listMembers.invalidate();
      toast.success("회원 정보를 수정했어요.");
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  const name = member?.fullName || member?.name || "회원";

  const save = () => {
    if (!member) return;
    const patch: { userId: number; loginId?: string; phone?: string; address?: string } = { userId: member.id };
    const nextLoginId = loginId.trim();
    const nextPhone = phone.trim();
    const nextAddress = address.trim();
    if (!member.isOwner && nextLoginId && nextLoginId !== (member.loginId ?? "")) patch.loginId = nextLoginId;
    if (nextPhone !== (member.phone ?? "")) patch.phone = nextPhone;
    if (nextAddress !== (member.address ?? "")) patch.address = nextAddress;

    if (patch.loginId === undefined && patch.phone === undefined && patch.address === undefined) {
      toast.info("변경된 내용이 없습니다.");
      onClose();
      return;
    }
    update.mutate(patch);
  };

  return (
    <Dialog open={member !== null} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{name} 님 정보 수정</DialogTitle>
          <DialogDescription>아이디·전화번호·주소를 관리자 권한으로 변경합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">아이디</label>
            <Input
              value={loginId}
              onChange={e => setLoginId(e.target.value)}
              disabled={member?.isOwner}
              placeholder="영문·숫자·밑줄 4~20자"
              className="h-11"
            />
            {member?.isOwner && (
              <p className="text-xs text-muted-foreground">최상위 관리자 아이디는 변경할 수 없습니다.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">전화번호</label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="010-1234-5678"
              inputMode="tel"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">주소 (택배 수령용)</label>
            <AddressSearchInput key={member?.id ?? "none"} value={address} onChange={setAddress} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="bg-card" onClick={onClose} disabled={update.isPending}>취소</Button>
          <Button onClick={save} disabled={update.isPending}>{update.isPending ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
