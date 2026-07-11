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
      address: u.address ?? null,
      role: u.role,
      loginMethod: u.loginMethod,
      createdAt: u.createdAt,
      lastSignedIn: u.lastSignedIn,
      memberCode: u.memberCode ?? null,
      withdrawnAt: u.withdrawnAt ?? null,
      isOwner: isOwner(u.loginId),
      isSelf: u.id === ctx.user.id,
    }));
  }),

  /** 관리자 강제 탈퇴(블랙) 처리. 로그인·재가입(동일 전화번호)이 차단된다. */
  withdrawMember: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "본인 계정은 탈퇴 처리할 수 없습니다." });
      }
      const target = await db.getUserById(input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
      if (isOwner(target.loginId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "최상위 관리자는 탈퇴 처리할 수 없습니다." });
      }
      if (target.role === "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "관리자 계정은 권한 회수 후에 탈퇴 처리할 수 있습니다." });
      }
      return db.setWithdrawn(input.userId, true);
    }),

  /** 탈퇴(블랙) 복구 — 다시 로그인할 수 있게 된다. */
  restoreMember: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ input }) => {
      const target = await db.getUserById(input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
      return db.setWithdrawn(input.userId, false);
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

  /** 관리자: 회원 아이디·전화번호·주소 수정. 제공된 필드만 갱신한다. */
  updateMemberInfo: adminProcedure
    .input(z.object({
      userId: z.number().int(),
      loginId: z.string().trim()
        .min(4, "아이디는 4자 이상이어야 합니다.")
        .max(20, "아이디는 20자 이하여야 합니다.")
        .regex(/^[a-zA-Z0-9_]+$/, "아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.")
        .optional(),
      phone: z.string().trim()
        .min(9, "전화번호를 정확히 입력해 주세요.")
        .max(20, "전화번호가 너무 깁니다.")
        .regex(/^[0-9+\-\s]+$/, "전화번호 형식이 올바르지 않습니다.")
        .optional(),
      address: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      const target = await db.getUserById(input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });

      // 아이디 변경 시: 최상위 관리자 보호 + 다른 회원과 중복 방지.
      if (input.loginId !== undefined && input.loginId !== target.loginId) {
        if (isOwner(target.loginId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "최상위 관리자의 아이디는 변경할 수 없습니다." });
        }
        const dup = await db.getUserByLoginId(input.loginId);
        if (dup && dup.id !== input.userId) {
          throw new TRPCError({ code: "CONFLICT", message: "이미 사용 중인 아이디입니다." });
        }
      }

      return db.setUserContactInfo(input.userId, {
        loginId: input.loginId,
        phone: input.phone,
        address: input.address,
      });
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
        customReviewFee: u.customReviewFee ?? null,
        createdAt: u.createdAt,
        withdrawnAt: u.withdrawnAt ?? null,
      }));
  }),

  /** 업체별 건당 리뷰 단가 설정 (VIP 우대가). fee=null이면 기본 단가로 복원. */
  setReviewFee: adminProcedure
    .input(z.object({
      userId: z.number().int(),
      fee: z.number().int().min(0, "0원 이상이어야 합니다.").max(1_000_000).nullable(),
    }))
    .mutation(async ({ input }) => {
      const target = await db.getUserById(input.userId);
      if (!target || target.role !== "business") {
        throw new TRPCError({ code: "NOT_FOUND", message: "업체를 찾을 수 없습니다." });
      }
      return db.setCustomReviewFee(input.userId, input.fee);
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

  // === 예치금 충전요청 처리 ===

  /** 업체들이 올린 충전요청 목록(업체 정보 포함). pending 우선. */
  listDepositRequests: adminProcedure.query(async () => {
    const reqs = await db.listAllDepositRequests();
    return Promise.all(
      reqs.map(async r => {
        const u = await db.getUserById(r.userId);
        return {
          ...r,
          business: u
            ? {
                id: u.id,
                fullName: u.fullName ?? u.name ?? "-",
                loginId: u.loginId ?? "-",
                memberCode: u.memberCode ?? null,
              }
            : null,
        };
      })
    );
  }),

  /** 충전요청 승인/거절. 승인 시 해당 업체 예치금에 반영된다. */
  processDepositRequest: adminProcedure
    .input(z.object({
      id: z.number().int(),
      action: z.enum(["approve", "reject"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const reqRow = await db.getDepositRequestById(input.id);
      if (!reqRow) throw new TRPCError({ code: "NOT_FOUND", message: "충전요청을 찾을 수 없습니다." });
      if (reqRow.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "이미 처리된 요청입니다." });
      }

      if (input.action === "approve") {
        await db.adjustDeposit({
          userId: reqRow.userId,
          amount: reqRow.amount,
          type: "charge",
          memo: `충전요청 승인${reqRow.depositorName ? ` (${reqRow.depositorName})` : ""}`,
          createdBy: ctx.user.id,
        });
      }

      const updated = await db.setDepositRequestStatus(
        input.id,
        input.action === "approve" ? "approved" : "rejected",
        ctx.user.id,
      );
      return updated;
    }),

  /**
   * 정산 목록: 기본은 approved(정산 대기), status="paid"면 입금 완료 건을 계좌 정보와 함께 반환.
   * 완료 건도 조회할 수 있어야 실수로 일괄 입금완료 처리해도 정보가 사라지지 않는다.
   */
  settlementList: adminProcedure
    .input(z.object({ status: z.enum(["approved", "paid"]).default("approved") }).optional())
    .query(async ({ input }) => {
    const parts = await db.listParticipations({ status: input?.status ?? "approved" });
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
          paidAt: p.paidAt,
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
