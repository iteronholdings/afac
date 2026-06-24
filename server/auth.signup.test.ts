import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// In-memory member store to mock the DB layer.
type StoredMember = {
  openId: string;
  loginId: string;
  passwordHash: string;
  fullName: string;
  phone: string;
  name: string | null;
  role: "user" | "admin";
};

const store = new Map<string, StoredMember>();

vi.mock("./db", () => ({
  getUserByLoginId: async (loginId: string) =>
    [...store.values()].find(m => m.loginId === loginId),
  createMember: async (member: {
    openId: string;
    loginId: string;
    passwordHash: string;
    fullName: string;
    phone: string;
  }) => {
    const row: StoredMember = {
      ...member,
      name: member.fullName,
      role: "user",
    };
    store.set(member.openId, row);
    return row;
  },
  touchLastSignedIn: async () => {},
}));

// Import after mocks are registered.
const { appRouter } = await import("./routers");

type CookieCall = { name: string; value: string; options: Record<string, unknown> };

function createContext(): { ctx: TrpcContext; cookies: CookieCall[]; cleared: string[] } {
  const cookies: CookieCall[] = [];
  const cleared: string[] = [];
  const ctx = {
    user: null,
    req: { protocol: "https", headers: {} },
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) =>
        cookies.push({ name, value, options }),
      clearCookie: (name: string) => cleared.push(name),
    },
  } as unknown as TrpcContext;
  return { ctx, cookies, cleared };
}

beforeEach(() => {
  store.clear();
});

describe("auth.signup", () => {
  it("creates a member and issues a session cookie", async () => {
    const { ctx, cookies } = createContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.signup({
      loginId: "reviewer01",
      password: "secret123",
      fullName: "홍길동",
      phone: "010-1234-5678",
    });

    expect(result).toEqual({ success: true });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);

    const saved = store.get("local_reviewer01");
    expect(saved).toBeTruthy();
    expect(saved?.fullName).toBe("홍길동");
    // Password must be hashed, never stored in plain text.
    expect(saved?.passwordHash).not.toBe("secret123");
    expect(await bcrypt.compare("secret123", saved!.passwordHash)).toBe(true);
  });

  it("rejects duplicate login IDs", async () => {
    const { ctx } = createContext();
    const caller = appRouter.createCaller(ctx);

    await caller.auth.signup({
      loginId: "reviewer01",
      password: "secret123",
      fullName: "홍길동",
      phone: "010-1234-5678",
    });

    await expect(
      caller.auth.signup({
        loginId: "reviewer01",
        password: "another123",
        fullName: "김철수",
        phone: "010-0000-0000",
      })
    ).rejects.toThrow(/이미 사용 중/);
  });

  it("rejects invalid login ID format", async () => {
    const { ctx } = createContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.signup({
        loginId: "한글아이디",
        password: "secret123",
        fullName: "홍길동",
        phone: "010-1234-5678",
      })
    ).rejects.toThrow();
  });
});

describe("auth.login", () => {
  it("logs in with correct credentials", async () => {
    const setup = createContext();
    const setupCaller = appRouter.createCaller(setup.ctx);
    await setupCaller.auth.signup({
      loginId: "reviewer01",
      password: "secret123",
      fullName: "홍길동",
      phone: "010-1234-5678",
    });

    const { ctx, cookies } = createContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({
      loginId: "reviewer01",
      password: "secret123",
    });

    expect(result).toEqual({ success: true });
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
  });

  it("rejects wrong password", async () => {
    const setup = createContext();
    const setupCaller = appRouter.createCaller(setup.ctx);
    await setupCaller.auth.signup({
      loginId: "reviewer01",
      password: "secret123",
      fullName: "홍길동",
      phone: "010-1234-5678",
    });

    const { ctx } = createContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ loginId: "reviewer01", password: "wrongpass" })
    ).rejects.toThrow(/올바르지 않습니다/);
  });

  it("rejects unknown login ID", async () => {
    const { ctx } = createContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ loginId: "ghost", password: "whatever" })
    ).rejects.toThrow(/올바르지 않습니다/);
  });
});

describe("auth.logout", () => {
  it("clears the session cookie", async () => {
    const { ctx, cleared } = createContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(cleared).toContain(COOKIE_NAME);
  });
});
