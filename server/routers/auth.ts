import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import * as db from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { isSmsConfigured, normalizePhone, sendSms } from "../sms";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

/** 인증 성공 후 이 시간(ms) 안에 가입해야 유효. */
const PHONE_VERIFY_WINDOW_MS = 30 * 60 * 1000; // 30분
const CODE_TTL_MS = 5 * 60 * 1000;             // 코드 유효 5분
const RESEND_COOLDOWN_MS = 60 * 1000;          // 재발송 1분 제한
const DAILY_SEND_LIMIT = 5;                    // 번호당 하루 5회
const MAX_VERIFY_ATTEMPTS = 5;                 // 코드당 검증 5회

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

  /** 전화번호 인증 활성 여부 (솔라피 키가 있어야 켜짐 — 없으면 기존 가입 방식). */
  smsConfig: publicProcedure.query(() => ({
    phoneVerificationEnabled: isSmsConfigured(),
  })),

  /** 인증번호 발송. 남발 방지: 1분 재발송 제한 + 번호당 하루 5회. */
  sendPhoneCode: publicProcedure
    .input(z.object({ phone: phoneSchema }))
    .mutation(async ({ input }) => {
      if (!isSmsConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "전화번호 인증이 아직 설정되지 않았습니다." });
      }
      const phone = normalizePhone(input.phone);
      if (!/^01[016789]\d{7,8}$/.test(phone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "올바른 휴대폰 번호를 입력해 주세요." });
      }

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const rec = await db.getPhoneVerification(phone);
      if (rec?.lastSentAt && now.getTime() - new Date(rec.lastSentAt).getTime() < RESEND_COOLDOWN_MS) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "잠시 후 다시 시도해 주세요. (재발송은 1분에 1회)" });
      }
      const sentToday = rec?.sentDate === today ? rec.sentCount : 0;
      if (sentToday >= DAILY_SEND_LIMIT) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "오늘 발송 한도를 초과했습니다. 내일 다시 시도해 주세요." });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db.upsertPhoneVerification({
        phone,
        code,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        verifiedAt: null,
        attempts: 0,
        lastSentAt: now,
        sentDate: today,
        sentCount: sentToday + 1,
      });
      await sendSms(phone, `[아르벤팩토리] 인증번호 [${code}] 를 입력해 주세요. (5분 유효)`);
      return { success: true as const };
    }),

  /** 인증번호 확인. 5회 초과 시 재발송 필요. */
  verifyPhoneCode: publicProcedure
    .input(z.object({ phone: phoneSchema, code: z.string().trim().length(6, "인증번호 6자리를 입력해 주세요.") }))
    .mutation(async ({ input }) => {
      const phone = normalizePhone(input.phone);
      const rec = await db.getPhoneVerification(phone);
      const now = new Date();
      if (!rec || now > new Date(rec.expiresAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "인증번호가 만료됐어요. 다시 발송해 주세요." });
      }
      if (rec.attempts >= MAX_VERIFY_ATTEMPTS) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "시도 횟수를 초과했어요. 인증번호를 다시 발송해 주세요." });
      }
      if (rec.code !== input.code.trim()) {
        await db.updatePhoneVerification(phone, { attempts: rec.attempts + 1 });
        throw new TRPCError({ code: "BAD_REQUEST", message: "인증번호가 올바르지 않습니다." });
      }
      await db.updatePhoneVerification(phone, { verifiedAt: now });
      return { success: true as const };
    }),

  // Register a new reviewer member with ID / PW / name / phone
  signup: publicProcedure
    .input(
      z.object({
        loginId: loginIdSchema,
        password: passwordSchema,
        fullName: fullNameSchema,
        phone: phoneSchema,
        address: z.string().trim().max(255, "주소가 너무 깁니다.").optional(),
        role: z.enum(["user", "business"]).default("user"),
        bankName: z.string().max(50).optional(),
        bankAccount: z.string().max(50).optional(),
        bankHolder: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 전화번호 인증이 활성화돼 있으면, 최근 30분 내 인증된 번호만 가입 허용.
      if (isSmsConfigured()) {
        const rec = await db.getPhoneVerification(normalizePhone(input.phone));
        const fresh = rec?.verifiedAt
          && Date.now() - new Date(rec.verifiedAt).getTime() < PHONE_VERIFY_WINDOW_MS;
        if (!fresh) {
          throw new TRPCError({ code: "FORBIDDEN", message: "전화번호 인증을 완료해 주세요." });
        }
      }

      // 탈퇴(블랙) 처리된 전화번호는 재가입 차단.
      if (await db.hasWithdrawnUserWithPhone(input.phone)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "가입이 제한된 전화번호입니다. 고객센터로 문의해 주세요." });
      }

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
        address: input.address,
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

      if (user.withdrawnAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "탈퇴 처리된 계정입니다. 고객센터로 문의해 주세요." });
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

  /** 내 정보: 주소 수정. */
  updateAddress: protectedProcedure
    .input(z.object({ address: z.string().trim().min(1, "주소를 입력해 주세요.").max(255, "주소가 너무 깁니다.") }))
    .mutation(async ({ ctx, input }) => {
      await db.setUserAddress(ctx.user.id, input.address);
      return { success: true as const };
    }),

  /** 내 정보: 정산 계좌 수정 (리뷰어 지급용 은행·계좌번호·예금주). */
  updateBankInfo: protectedProcedure
    .input(z.object({
      bankName: z.string().trim().min(1, "은행명을 입력해 주세요.").max(50, "은행명이 너무 깁니다."),
      bankAccount: z.string().trim()
        .min(6, "계좌번호를 정확히 입력해 주세요.").max(50, "계좌번호가 너무 깁니다.")
        .regex(/^[0-9-]+$/, "계좌번호는 숫자와 하이픈(-)만 입력할 수 있습니다."),
      bankHolder: z.string().trim().min(1, "예금주를 입력해 주세요.").max(50, "예금주가 너무 깁니다."),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.setUserBankInfo(ctx.user.id, input);
      return { success: true as const };
    }),

  // 리뷰어: 절차 안내를 읽고 동의. 동의해야 캠페인 참여 등 리뷰어 활동 가능.
  agreeReviewerTerms: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "user") {
      // 업체·관리자는 동의 대상이 아님 — 조용히 통과 처리.
      return { success: true as const };
    }
    await db.setReviewerAgreed(ctx.user.id);
    return { success: true as const };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true as const };
  }),
});
