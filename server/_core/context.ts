import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // 관리자 강제 탈퇴(블랙) 계정은 기존 세션이 남아 있어도 미로그인으로 취급.
  if (user?.withdrawnAt) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
