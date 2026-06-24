import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Crown, Shield, ShieldCheck, ShieldOff, Users } from "lucide-react";
import { toast } from "sonner";

export default function AdminMembers() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const { data: members, isLoading } = trpc.admin.listMembers.useQuery();

  // The owner's openId is exposed on the current user via auth.me; we detect
  // "am I the owner" by checking whether my own row is flagged isOwner.
  const iAmOwner = !!members?.find(m => m.isSelf)?.isOwner;

  const setRoleMutation = trpc.admin.setRole.useMutation({
    onSuccess: () => {
      utils.admin.listMembers.invalidate();
      toast.success("권한이 변경되었습니다.");
    },
    onError: err => toast.error(err.message),
  });

  return (
    <AdminLayout
      title="회원 관리"
      description="가입한 회원을 확인하고 관리자 권한을 부여하거나 회수합니다."
    >
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
            <p className="font-semibold">가입한 회원이 없습니다</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>회원</TableHead>
                <TableHead className="hidden sm:table-cell">아이디</TableHead>
                <TableHead className="hidden md:table-cell">전화번호</TableHead>
                <TableHead>권한</TableHead>
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
                    {m.phone || "-"}
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
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        리뷰어
                      </span>
                    )}
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
    </AdminLayout>
  );
}
