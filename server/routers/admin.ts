import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, router } from "../_core/trpc";

/**
 * 최상위 소유자 계정의 로그인 ID.
 * 이 계정만 다른 회원의 관리자 권한을 부여/회수할 수 있으며,
 * 본인 권한은 절대 변경되지 않습니다.
 */
export const OWNER_LOGIN_ID = "admin_iteron";

/** A user is the top-level owner if their loginId matches OWNER_LOGIN_ID. */
function isOwner(loginId: string | null | undefined) {
  if (!loginId) return false;
  // loginId 자체, 또는 자체가입 openId 규칙(local_{loginId})을 모두 허용.
  return loginId === OWNER_LOGIN_ID || loginId === `local_${OWNER_LOGIN_ID}`;
}

export const adminRouter = router({
  // List all members for the admin member-management table.
  listMembers: adminProcedure.query(async ({ ctx }) => {
    const rows = await db.listAllUsers();
    return rows.map(u => ({
      id: u.id,
      loginId: u.loginId,
      fullName: u.fullName,
      name: u.name,
      phone: u.phone,
      role: u.role,
      loginMethod: u.loginMethod,
      createdAt: u.createdAt,
      lastSignedIn: u.lastSignedIn,
      isOwner: isOwner(u.loginId),
      isSelf: u.id === ctx.user.id,
    }));
  }),

  // Grant or revoke admin role. Only the owner can do this, and the owner's
  // own role can never be changed.
  setRole: adminProcedure
    .input(z.object({ userId: z.number().int(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      // Only the top-level owner may manage roles.
      if (!isOwner(ctx.user.loginId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "관리자 권한 부여는 최상위 관리자만 가능합니다.",
        });
      }

      const target = await db.getUserById(input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });

      // The owner's role is immutable.
      if (isOwner(target.loginId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "최상위 관리자의 권한은 변경할 수 없습니다.",
        });
      }

      return db.setUserRole(input.userId, input.role);
    }),
});
