import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

/**
 * In-memory mock of the DB layer covering campaigns + participations + users,
 * enough to exercise the full reviewer/admin workflow through the routers.
 */
type Campaign = {
  id: number;
  title: string;
  category: string | null;
  keyword: string;
  thumbnailUrl: string | null;
  productUrl: string | null;
  description: string | null;
  productPrice: number;
  commission: number;
  slots: number;
  status: "open" | "closed";
  createdBy: number;
  createdAt: Date;
};

type Participation = {
  id: number;
  campaignId: number;
  userId: number;
  status: "applied" | "purchased" | "reviewed" | "approved" | "paid" | "rejected";
  purchaseProofUrl: string | null;
  reviewProofUrl: string | null;
  adminMemo: string | null;
  appliedAt: Date;
  purchasedAt: Date | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  paidAt: Date | null;
};

type User = {
  id: number;
  openId: string;
  loginId: string;
  fullName: string;
  name: string | null;
  phone: string;
  role: "user" | "admin";
};

const campaigns = new Map<number, Campaign>();
const participations = new Map<number, Participation>();
const users = new Map<number, User>();
let campaignSeq = 1;
let partSeq = 1;

vi.mock("./db", () => ({
  createCampaign: async (data: Partial<Campaign>) => {
    const id = campaignSeq++;
    const c: Campaign = {
      id,
      title: data.title ?? "",
      category: data.category ?? null,
      keyword: data.keyword ?? "",
      thumbnailUrl: data.thumbnailUrl ?? null,
      productUrl: data.productUrl ?? null,
      description: data.description ?? null,
      productPrice: data.productPrice ?? 0,
      commission: data.commission ?? 0,
      slots: data.slots ?? 1,
      status: "open",
      createdBy: data.createdBy ?? 0,
      createdAt: new Date(),
    };
    campaigns.set(id, c);
    return c;
  },
  updateCampaign: async (id: number, data: Partial<Campaign>) => {
    const c = campaigns.get(id);
    if (!c) return undefined;
    Object.assign(c, data);
    return c;
  },
  getCampaignById: async (id: number) => campaigns.get(id),
  listCampaigns: async (opts?: { onlyOpen?: boolean }) => {
    const all = [...campaigns.values()];
    return opts?.onlyOpen ? all.filter(c => c.status === "open") : all;
  },
  countActiveParticipations: async (campaignId: number) =>
    [...participations.values()].filter(
      p => p.campaignId === campaignId && p.status !== "rejected"
    ).length,
  getParticipation: async (campaignId: number, userId: number) =>
    [...participations.values()].find(
      p => p.campaignId === campaignId && p.userId === userId
    ),
  getParticipationById: async (id: number) => participations.get(id),
  createParticipation: async (data: Partial<Participation>) => {
    const id = partSeq++;
    const p: Participation = {
      id,
      campaignId: data.campaignId!,
      userId: data.userId!,
      status: data.status ?? "applied",
      purchaseProofUrl: null,
      reviewProofUrl: null,
      adminMemo: null,
      appliedAt: new Date(),
      purchasedAt: null,
      reviewedAt: null,
      approvedAt: null,
      paidAt: null,
    };
    participations.set(id, p);
    return p;
  },
  updateParticipation: async (id: number, data: Partial<Participation>) => {
    const p = participations.get(id);
    if (!p) return undefined;
    Object.assign(p, data);
    return p;
  },
  listParticipationsByUser: async (userId: number) =>
    [...participations.values()].filter(p => p.userId === userId),
  listParticipations: async (opts?: { campaignId?: number }) => {
    const all = [...participations.values()];
    return opts?.campaignId ? all.filter(p => p.campaignId === opts.campaignId) : all;
  },
  getUserById: async (id: number) => users.get(id),
  listAllUsers: async () => [...users.values()],
  setUserRole: async (id: number, role: "user" | "admin") => {
    const u = users.get(id);
    if (!u) return undefined;
    u.role = role;
    return u;
  },
}));

// ENV mock so isOwner() resolves deterministically.
vi.mock("./_core/env", () => ({
  ENV: { ownerOpenId: "owner-open-id" },
}));

const { appRouter } = await import("./routers");

function makeCtx(user: Partial<User> | null): TrpcContext {
  return {
    user: user as User | null,
    req: { protocol: "https", headers: {} },
    res: { cookie: () => {}, clearCookie: () => {} },
  } as unknown as TrpcContext;
}

const adminUser = { id: 1, openId: "owner-open-id", loginId: "admin_iteron", role: "admin" as const };
const otherAdmin = { id: 2, openId: "local_admin2", loginId: "admin2", role: "admin" as const };
const reviewer = { id: 10, openId: "local_reviewer", loginId: "reviewer", role: "user" as const };

beforeEach(() => {
  campaigns.clear();
  participations.clear();
  users.clear();
  campaignSeq = 1;
  partSeq = 1;
  users.set(1, { id: 1, openId: "owner-open-id", loginId: "admin_iteron", fullName: "오너", name: "오너", phone: "010", role: "admin" });
  users.set(2, { id: 2, openId: "local_admin2", loginId: "admin2", fullName: "관리자2", name: "관리자2", phone: "010", role: "admin" });
  users.set(10, { id: 10, openId: "local_reviewer", loginId: "reviewer", fullName: "리뷰어", name: "리뷰어", phone: "010", role: "user" });
});

describe("campaign management (admin)", () => {
  it("allows an admin to create a campaign", async () => {
    const caller = appRouter.createCaller(makeCtx(adminUser));
    const c = await caller.campaign.create({
      title: "테스트 캠페인",
      keyword: "테스트 상품",
      productPrice: 12000,
      commission: 3000,
      slots: 2,
    });
    expect(c?.id).toBe(1);
    expect(c?.status).toBe("open");
  });

  it("blocks non-admins from creating campaigns", async () => {
    const caller = appRouter.createCaller(makeCtx(reviewer));
    await expect(
      caller.campaign.create({
        title: "x",
        keyword: "y",
        productPrice: 1,
        commission: 1,
        slots: 1,
      })
    ).rejects.toThrow();
  });

  it("lists only open campaigns to authenticated users with remaining slots", async () => {
    const admin = appRouter.createCaller(makeCtx(adminUser));
    await admin.campaign.create({ title: "A", keyword: "a", productPrice: 1000, commission: 500, slots: 3 });
    const reviewerCaller = appRouter.createCaller(makeCtx(reviewer));
    const list = await reviewerCaller.campaign.listOpen();
    expect(list).toHaveLength(1);
    expect(list[0].remaining).toBe(3);
  });

  it("blocks anonymous users from listing campaigns", async () => {
    const pub = appRouter.createCaller(makeCtx(null));
    await expect(pub.campaign.listOpen()).rejects.toThrow();
  });
});

describe("reviewer workflow", () => {
  async function seedCampaign(slots = 2) {
    const admin = appRouter.createCaller(makeCtx(adminUser));
    const c = await admin.campaign.create({
      title: "캠페인",
      keyword: "키워드",
      productPrice: 10000,
      commission: 2000,
      slots,
    });
    return c!.id;
  }

  it("runs applied → purchased → reviewed for a reviewer", async () => {
    const campaignId = await seedCampaign();
    const caller = appRouter.createCaller(makeCtx(reviewer));

    const applied = await caller.participation.join({ campaignId });
    expect(applied?.status).toBe("applied");

    const purchased = await caller.participation.submitPurchaseProof({
      participationId: applied!.id,
      proofUrl: "/manus-storage/purchase.png",
    });
    expect(purchased?.status).toBe("purchased");
    expect(purchased?.purchaseProofUrl).toBe("/manus-storage/purchase.png");

    const reviewed = await caller.participation.submitReviewProof({
      participationId: applied!.id,
      proofUrl: "/manus-storage/review.png",
    });
    expect(reviewed?.status).toBe("reviewed");
  });

  it("prevents joining the same campaign twice", async () => {
    const campaignId = await seedCampaign();
    const caller = appRouter.createCaller(makeCtx(reviewer));
    await caller.participation.join({ campaignId });
    await expect(caller.participation.join({ campaignId })).rejects.toThrow(/이미/);
  });

  it("rejects review proof before purchase proof", async () => {
    const campaignId = await seedCampaign();
    const caller = appRouter.createCaller(makeCtx(reviewer));
    const applied = await caller.participation.join({ campaignId });
    await expect(
      caller.participation.submitReviewProof({
        participationId: applied!.id,
        proofUrl: "/manus-storage/review.png",
      })
    ).rejects.toThrow();
  });

  it("enforces slot limits", async () => {
    const campaignId = await seedCampaign(1);
    const r1 = appRouter.createCaller(makeCtx(reviewer));
    await r1.participation.join({ campaignId });
    const r2 = appRouter.createCaller(makeCtx({ id: 11, openId: "local_r2", role: "user" }));
    await expect(r2.participation.join({ campaignId })).rejects.toThrow(/마감/);
  });
});

describe("admin payout workflow", () => {
  it("lets an admin approve and mark paid", async () => {
    const admin = appRouter.createCaller(makeCtx(adminUser));
    const c = await admin.campaign.create({
      title: "캠페인",
      keyword: "키워드",
      productPrice: 10000,
      commission: 2000,
      slots: 1,
    });
    const reviewerCaller = appRouter.createCaller(makeCtx(reviewer));
    const applied = await reviewerCaller.participation.join({ campaignId: c!.id });

    const approved = await admin.participation.setStatus({
      participationId: applied!.id,
      status: "approved",
    });
    expect(approved?.status).toBe("approved");
    expect(approved?.approvedAt).toBeTruthy();

    const paid = await admin.participation.setStatus({
      participationId: applied!.id,
      status: "paid",
    });
    expect(paid?.status).toBe("paid");
    expect(paid?.paidAt).toBeTruthy();
  });

  it("blocks reviewers from changing status", async () => {
    const admin = appRouter.createCaller(makeCtx(adminUser));
    const c = await admin.campaign.create({
      title: "캠페인",
      keyword: "키워드",
      productPrice: 10000,
      commission: 2000,
      slots: 1,
    });
    const reviewerCaller = appRouter.createCaller(makeCtx(reviewer));
    const applied = await reviewerCaller.participation.join({ campaignId: c!.id });
    await expect(
      reviewerCaller.participation.setStatus({ participationId: applied!.id, status: "paid" })
    ).rejects.toThrow();
  });
});

describe("admin role management policy", () => {
  it("lets the owner grant admin to a reviewer", async () => {
    const caller = appRouter.createCaller(makeCtx(adminUser));
    const updated = await caller.admin.setRole({ userId: 10, role: "admin" });
    expect(updated?.role).toBe("admin");
  });

  it("forbids a non-owner admin from managing roles", async () => {
    const caller = appRouter.createCaller(makeCtx(otherAdmin));
    await expect(caller.admin.setRole({ userId: 10, role: "admin" })).rejects.toThrow(/최상위/);
  });

  it("protects the owner's role from being changed", async () => {
    const caller = appRouter.createCaller(makeCtx(adminUser));
    await expect(caller.admin.setRole({ userId: 1, role: "user" })).rejects.toThrow(/최상위/);
  });
});
