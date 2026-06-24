import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  campaigns,
  InsertCampaign,
  InsertParticipation,
  InsertUser,
  participations,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// === Self-hosted ID/PW member auth helpers ===

export async function getUserByLoginId(loginId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.loginId, loginId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createMember(member: {
  openId: string;
  loginId: string;
  passwordHash: string;
  fullName: string;
  phone: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const role = member.openId === ENV.ownerOpenId ? "admin" : "user";

  await db.insert(users).values({
    openId: member.openId,
    loginId: member.loginId,
    passwordHash: member.passwordHash,
    fullName: member.fullName,
    name: member.fullName,
    phone: member.phone,
    loginMethod: "local",
    role,
    lastSignedIn: new Date(),
  });

  return getUserByLoginId(member.loginId);
}

export async function touchLastSignedIn(openId: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.openId, openId));
}

// === Member management (admin) ===

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : undefined;
}

export async function setUserRole(id: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, id));
  return getUserById(id);
}

// === Campaigns ===

export async function createCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campaigns).values(data);
  // mysql2 returns insertId on the first element
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId
    ?? (result as unknown as { insertId: number }).insertId;
  return getCampaignById(Number(insertId));
}

export async function updateCampaign(id: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
  return getCampaignById(id);
}

export async function deleteCampaign(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 먼저 연관된 참여 기록을 제거한 뒤 캐페인을 삭제.

  await db.delete(participations).where(eq(participations.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));
  return { id };
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : undefined;
}

export async function listCampaigns(opts?: { onlyOpen?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  if (opts?.onlyOpen) {
    return db
      .select()
      .from(campaigns)
      .where(eq(campaigns.status, "open"))
      .orderBy(desc(campaigns.createdAt));
  }
  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

/** Count active (non-rejected) participations for a campaign — used for slot availability. */
export async function countActiveParticipations(campaignId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(participations)
    .where(eq(participations.campaignId, campaignId));
  return rows.filter(r => r.status !== "rejected").length;
}

// === Participations ===

export async function getParticipation(campaignId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(participations)
    .where(
      and(
        eq(participations.campaignId, campaignId),
        eq(participations.userId, userId)
      )
    )
    .limit(1);
  return rows.length > 0 ? rows[0] : undefined;
}

export async function getParticipationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(participations)
    .where(eq(participations.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : undefined;
}

export async function createParticipation(data: InsertParticipation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(participations).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId
    ?? (result as unknown as { insertId: number }).insertId;
  return getParticipationById(Number(insertId));
}

export async function updateParticipation(
  id: number,
  data: Partial<InsertParticipation>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(participations).set(data).where(eq(participations.id, id));
  return getParticipationById(id);
}

/** Participations for one reviewer (with campaign info joined in code). */
export async function listParticipationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(participations)
    .where(eq(participations.userId, userId))
    .orderBy(desc(participations.appliedAt));
}

/** All participations (admin view), optionally filtered by campaign. */
export async function listParticipations(opts?: { campaignId?: number }) {
  const db = await getDb();
  if (!db) return [];
  if (opts?.campaignId) {
    return db
      .select()
      .from(participations)
      .where(eq(participations.campaignId, opts.campaignId))
      .orderBy(desc(participations.appliedAt));
  }
  return db.select().from(participations).orderBy(desc(participations.appliedAt));
}
