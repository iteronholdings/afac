import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import * as db from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";

const loginIdSchema = z
  .string()
  .trim()
  .min(4, "아이디는 4자 이상이어야 합니다.")
  .max(20, "아이디는 20자 이하여야 합니다.")
  .regex(/^[a-zA-Z0-9_]+$/, "아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.");

const passwordSchema = z
  .string()
  .min(6, "비밀번호는 6자 이상이어야 합니다.")
  .max(72, "비밀번호는 72자 이하여야 합니다.");

const fullNameSchema = z
  .string()
  .trim()
  .min(1, "성명을 입력해 주세요.")
  .max(50, "성명이 너무 깁니다.");

const phoneSchema = z
  .string()
  .trim()
  .min(9, "전화번호를 정확히 입력해 주세요.")
  .max(20, "전화번호가 너무 깁니다.")
  .regex(/^[0-9+\-\s]+$/, "전화번호 형식이 올바르지 않습니다.");

async function issueSession(
  ctx: { req: any; res: any },
  openId: string,
  name: string
) {
  const token = await sdk.createSessionToken(openId, {
    name: name || openId,
    expiresInMs: ONE_YEAR_MS,
  });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: ONE_YEAR_MS,
  });
}

export const authRouter = router({
  // Current authenticated member (null if not logged in).
  // Strip sensitive fields (e.g. passwordHash) before returning to the client.
  me: publicProcedure.query(opts => {
    const u = opts.ctx.user;
    if (!u) return null;
    const { passwordHash: _passwordHash, ...safeUser } = u as typeof u & {
      passwordHash?: string | null;
    };
    return safeUser;
  }),

  // Register a new reviewer member with ID / PW / name / phone
  signup: publicProcedure
    .input(
      z.object({
        loginId: loginIdSchema,
        password: passwordSchema,
        fullName: fullNameSchema,
        phone: phoneSchema,
        role: z.enum(["user", "business"]).default("user"),
        bankName: z.string().max(50).optional(),
        bankAccount: z.string().max(50).optional(),
        bankHolder: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getUserByLoginId(input.loginId);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "이미 사용 중인 아이디입니다.",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const openId = `local_${input.loginId}`;

      const user = await db.createMember({
        openId,
        loginId: input.loginId,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: input.role,
        bankName: input.bankName,
        bankAccount: input.bankAccount,
        bankHolder: input.bankHolder,
      });

      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "회원 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }

      await issueSession(ctx, openId, input.fullName);

      return { success: true as const };
    }),

  // Login with ID / PW
  login: publicProcedure
    .input(
      z.object({
        loginId: z.string().trim().min(1, "아이디를 입력해 주세요."),
        password: z.string().min(1, "비밀번호를 입력해 주세요."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserByLoginId(input.loginId);
      const invalid = new TRPCError({
        code: "UNAUTHORIZED",
        message: "아이디 또는 비밀번호가 올바르지 않습니다.",
      });

      if (!user || !user.passwordHash) {
        // Run a dummy compare against a valid bcrypt hash to reduce timing side-channel.
        await bcrypt.compare(
          input.password,
          "$2a$10$CwTycUXWue0Thq9StjUM0uJ8DiN5lz5jXQ3kQ7Qb6mD9bF1uJ3O6"
        );
        throw invalid;
      }

      const ok = await bcrypt.compare(input.password, user.passwordHash);
      if (!ok) {
        throw invalid;
      }

      await db.touchLastSignedIn(user.openId);
      await issueSession(ctx, user.openId, user.fullName || user.name || user.openId);

      return { success: true as const };
    }),

  // Check whether a login ID is available (for live form feedback)
  checkLoginId: publicProcedure
    .input(z.object({ loginId: loginIdSchema }))
    .query(async ({ input }) => {
      const existing = await db.getUserByLoginId(input.loginId);
      return { available: !existing };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true as const };
  }),
});
