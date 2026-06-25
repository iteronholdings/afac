import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
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
      memberCode: u.memberCode ?? null,
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

  setMemberCode: adminProcedure
    .input(z.object({ userId: z.number().int(), memberCode: z.string().max(20) }))
    .mutation(async ({ input }) => {
      return db.setMemberCode(input.userId, input.memberCode.trim());
    }),

  /** Admin: reset any member's password (also usable on self). */
  setMemberPassword: adminProcedure
    .input(z.object({
      userId: z.number().int(),
      newPassword: z.string().min(6, "비밀번호는 6자 이상이어야 합니다.").max(72),
    }))
    .mutation(async ({ input }) => {
      const target = await db.getUserById(input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      await db.setMemberPasswordHash(input.userId, passwordHash);
      return { success: true as const };
    }),

  // === 업체 관리 (deposits) ===

  /** 업체(비즈니스) 계정 목록 + 예치금 잔액. */
  listBusinesses: adminProcedure.query(async () => {
    const rows = await db.listAllUsers();
    return rows
      .filter(u => u.role === "business")
      .map(u => ({
        id: u.id,
        loginId: u.loginId,
        fullName: u.fullName ?? u.name ?? "-",
        phone: u.phone ?? "-",
        memberCode: u.memberCode ?? null,
        depositBalance: u.depositBalance ?? 0,
        createdAt: u.createdAt,
      }));
  }),

  /** 예치금 추가/차감. amount는 양수, action으로 방향 결정. */
  adjustDeposit: adminProcedure
    .input(z.object({
      userId: z.number().int(),
      amount: z.number().int().positive("금액을 입력해 주세요."),
      action: z.enum(["charge", "deduct"]),
      memo: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const delta = input.action === "charge" ? input.amount : -input.amount;
      const balance = await db.adjustDeposit({
        userId: input.userId,
        amount: delta,
        type: input.action,
        memo: input.memo?.trim() || (input.action === "charge" ? "관리자 충전" : "관리자 차감"),
        createdBy: ctx.user.id,
      });
      return { balance };
    }),

  /** 특정 업체의 예치금 거래 내역. */
  depositLog: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .query(async ({ input }) => db.listDepositTransactions(input.userId)),

  /** 정산 대기 목록: approved 상태의 참여자 + 리뷰어 계좌 정보 */
  settlementList: adminProcedure.query(async () => {
    const parts = await db.listParticipations({ status: "approved" });
    return Promise.all(
      parts.map(async p => {
        const campaign = await db.getCampaignById(p.campaignId);
        const user = await db.getUserById(p.userId);
        const payout = campaign
          ? (campaign.productPrice ?? 0) + (campaign.commission ?? 0)
          : 0;
        return {
          participationId: p.id,
          approvedAt: p.approvedAt,
          payout,
          campaignTitle: campaign?.title ?? "-",
          user: user
            ? {
                id: user.id,
                fullName: user.fullName ?? user.name ?? "-",
                loginId: user.loginId ?? "-",
                memberCode: user.memberCode ?? "-",
                bankName: user.bankName ?? "-",
                bankAccount: user.bankAccount ?? "-",
                bankHolder: user.bankHolder ?? "-",
              }
            : null,
        };
      })
    );
  }),
});
