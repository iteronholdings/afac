import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  businessMessages,
  campaignDrafts,
  campaigns,
  consultingRequests,
  depositRequests,
  depositTransactions,
  directMessages,
  InsertBusinessMessage,
  InsertCampaign,
  InsertCampaignDraft,
  InsertConsultingRequest,
  InsertDepositRequest,
  InsertDirectMessage,
  InsertMessage,
  InsertParticipation,
  InsertPushSubscription,
  InsertUser,
  messages,
  participations,
  pushSubscriptions,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _migrated = false;

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
  if (_db && !_migrated) {
    _migrated = true;
    await runMigrations(_db).catch(e => console.warn("[Migration] Failed:", e));
  }
  return _db;
}

async function runMigrations(db: ReturnType<typeof drizzle>) {
  const alterStatements = [
    sql`ALTER TABLE users ADD COLUMN bankName VARCHAR(50)`,
    sql`ALTER TABLE users ADD COLUMN bankAccount VARCHAR(50)`,
    sql`ALTER TABLE users ADD COLUMN bankHolder VARCHAR(50)`,
    sql`ALTER TABLE users ADD COLUMN memberCode VARCHAR(20)`,
    sql`ALTER TABLE campaigns ADD COLUMN photoCount INT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE campaigns ADD COLUMN textCount INT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE campaigns ADD COLUMN starCount INT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE campaigns ADD COLUMN startDate VARCHAR(20)`,
    sql`ALTER TABLE campaigns ADD COLUMN endDate VARCHAR(20)`,
    sql`ALTER TABLE campaigns ADD COLUMN schedule TEXT`,
    sql`ALTER TABLE campaigns ADD COLUMN photoGuideZip LONGTEXT`,
    sql`ALTER TABLE campaigns ADD COLUMN photoGuideZipName VARCHAR(255)`,
    sql`ALTER TABLE users ADD COLUMN depositBalance INT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE participations ADD COLUMN assignedPacket LONGTEXT`,
    sql`ALTER TABLE participations ADD COLUMN assignedName VARCHAR(255)`,
    sql`ALTER TABLE participations ADD COLUMN reviewType ENUM('photo','text','star')`,
    sql`ALTER TABLE campaigns ADD COLUMN paidAmount INT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE campaigns ADD COLUMN refundedAt TIMESTAMP NULL`,
    sql`ALTER TABLE deposit_requests ADD COLUMN taxInvoice ENUM('issue','none') NOT NULL DEFAULT 'none'`,
    sql`ALTER TABLE deposit_requests ADD COLUMN bizNumber VARCHAR(20)`,
    sql`ALTER TABLE deposit_requests ADD COLUMN repName VARCHAR(40)`,
    sql`ALTER TABLE deposit_requests ADD COLUMN companyName VARCHAR(100)`,
    sql`ALTER TABLE deposit_requests ADD COLUMN taxEmail VARCHAR(120)`,
    sql`ALTER TABLE users ADD COLUMN reviewerAgreedAt TIMESTAMP NULL`,
    sql`ALTER TABLE deposit_requests ADD COLUMN method ENUM('manual','vbank') NOT NULL DEFAULT 'manual'`,
    sql`ALTER TABLE deposit_requests ADD COLUMN paymentId VARCHAR(80)`,
    sql`ALTER TABLE deposit_requests ADD COLUMN vbankBank VARCHAR(40)`,
    sql`ALTER TABLE deposit_requests ADD COLUMN vbankNumber VARCHAR(40)`,
    sql`ALTER TABLE deposit_requests ADD COLUMN vbankHolder VARCHAR(40)`,
    sql`ALTER TABLE deposit_requests ADD COLUMN vbankDue VARCHAR(40)`,
    sql`ALTER TABLE deposit_requests ADD COLUMN paidAt TIMESTAMP NULL`,
  ];
  for (const stmt of alterStatements) {
    try {
      await db.execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code;
      if (code !== "ER_DUP_FIELDNAME") throw e;
    }
  }

  // Create tables that may not exist yet (idempotent).
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS consulting_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        platform VARCHAR(30) NOT NULL,
        productUrl TEXT,
        targetKeyword VARCHAR(300),
        currentRank VARCHAR(100),
        budget VARCHAR(100),
        memo TEXT,
        status ENUM('new','contacted','done') NOT NULL DEFAULT 'new',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn("[Migration] consulting_requests table:", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS deposit_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        amount INT NOT NULL,
        type ENUM('charge','deduct','campaign','refund') NOT NULL,
        balanceAfter INT NOT NULL,
        memo VARCHAR(255),
        createdBy INT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn("[Migration] deposit_transactions table:", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS deposit_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        amount INT NOT NULL,
        depositorName VARCHAR(20),
        memo VARCHAR(255),
        taxInvoice ENUM('issue','none') NOT NULL DEFAULT 'none',
        bizNumber VARCHAR(20),
        repName VARCHAR(40),
        companyName VARCHAR(100),
        taxEmail VARCHAR(120),
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        processedBy INT,
        processedAt TIMESTAMP NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn("[Migration] deposit_requests table:", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        endpoint VARCHAR(512) NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn("[Migration] push_subscriptions table:", e);
  }

  try {
    await db.execute(sql`ALTER TABLE campaigns MODIFY COLUMN status ENUM('pending','open','closed','rejected','in_progress','error') NOT NULL DEFAULT 'open'`);
  } catch (e) {
    console.warn("[Migration] campaigns.status enum:", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS campaign_drafts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        title VARCHAR(200),
        data LONGTEXT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn("[Migration] campaign_drafts table:", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS business_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        businessId INT NOT NULL,
        reviewerId INT NOT NULL,
        fromUserId INT NOT NULL,
        content TEXT,
        imageUrl LONGTEXT,
        readAt TIMESTAMP NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn("[Migration] business_messages table:", e);
  }

  // Assign memberCode to existing members that don't have one yet
  await assignMissingMemberCodes(db);
}

async function assignMissingMemberCodes(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({ id: users.id, memberCode: users.memberCode })
    .from(users)
    .orderBy(users.id);

  // Find max existing numeric suffix
  let max = 0;
  for (const row of rows) {
    const m = row.memberCode?.match(/^A-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }

  // Assign codes to those without one
  for (const row of rows) {
    if (!row.memberCode) {
      max += 1;
      const code = `A-${String(max).padStart(3, "0")}`;
      await db.update(users).set({ memberCode: code }).where(eq(users.id, row.id));
    }
  }
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
  role?: "user" | "business" | "admin";
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const role = member.openId === ENV.ownerOpenId ? "admin" : (member.role ?? "user");
  const memberCode = await generateNextMemberCode();

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
    bankName: member.bankName,
    bankAccount: member.bankAccount,
    bankHolder: member.bankHolder,
    memberCode,
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

/** 리뷰어가 절차 안내에 동의한 시각을 기록. */
export async function setReviewerAgreed(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ reviewerAgreedAt: new Date() }).where(eq(users.id, userId));
  return getUserById(userId);
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

export async function setMemberCode(id: number, memberCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ memberCode }).where(eq(users.id, id));
  return getUserById(id);
}

/** Admin: reset a member's password (hash is computed in the router). */
export async function setMemberPasswordHash(id: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  return getUserById(id);
}

/** Generate next member code in A-001 format by scanning existing codes. */
export async function generateNextMemberCode(): Promise<string> {
  const db = await getDb();
  if (!db) return "A-001";
  const rows = await db.select({ memberCode: users.memberCode }).from(users);
  let max = 0;
  for (const row of rows) {
    const m = row.memberCode?.match(/^A-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `A-${String(max + 1).padStart(3, "0")}`;
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

export async function listCampaignsByOwner(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.createdBy, userId))
    .orderBy(desc(campaigns.createdAt));
}

// === Campaign drafts (캠페인 신청 임시저장) ===

export async function listCampaignDraftsByOwner(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(campaignDrafts)
    .where(eq(campaignDrafts.userId, userId))
    .orderBy(desc(campaignDrafts.updatedAt));
}

export async function getCampaignDraftById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(campaignDrafts).where(eq(campaignDrafts.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : undefined;
}

export async function createCampaignDraft(data: InsertCampaignDraft) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campaignDrafts).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId
    ?? (result as unknown as { insertId: number }).insertId;
  return getCampaignDraftById(Number(insertId));
}

export async function updateCampaignDraft(id: number, data: Partial<InsertCampaignDraft>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(campaignDrafts).set(data).where(eq(campaignDrafts.id, id));
  return getCampaignDraftById(id);
}

export async function deleteCampaignDraft(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(campaignDrafts).where(eq(campaignDrafts.id, id));
  return { id };
}

export async function listParticipationsByCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(participations)
    .where(eq(participations.campaignId, campaignId))
    .orderBy(desc(participations.appliedAt));
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

/** All participations (admin view), optionally filtered by campaign and/or status. */
export async function listParticipations(opts?: { campaignId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.campaignId) conditions.push(eq(participations.campaignId, opts.campaignId));
  if (opts?.status) conditions.push(eq(participations.status, opts.status as any));
  if (conditions.length === 0) {
    return db.select().from(participations).orderBy(desc(participations.appliedAt));
  }
  return db
    .select()
    .from(participations)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(participations.appliedAt));
}

// === Messages ===

export async function listMessages(participationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.participationId, participationId))
    .orderBy(messages.createdAt);
}

export async function createMessage(data: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messages).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId
    ?? (result as unknown as { insertId: number }).insertId;
  const rows = await db.select().from(messages).where(eq(messages.id, Number(insertId))).limit(1);
  return rows[0];
}

// === Direct Messages ===

export async function listDirectMessages(reviewerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(directMessages)
    .where(eq(directMessages.reviewerId, reviewerId))
    .orderBy(directMessages.createdAt);
}

export async function createDirectMessage(data: InsertDirectMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(directMessages).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId
    ?? (result as unknown as { insertId: number }).insertId;
  const rows = await db.select().from(directMessages).where(eq(directMessages.id, Number(insertId))).limit(1);
  return rows[0];
}

export async function markDirectMessagesRead(reviewerId: number, readerUserId: number) {
  const db = await getDb();
  if (!db) return;
  // Only mark messages sent by the OTHER party as read (not the reader's own messages)
  await db
    .update(directMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(directMessages.reviewerId, reviewerId),
        isNull(directMessages.readAt),
        ne(directMessages.fromUserId, readerUserId),
      )
    );
}

/** For admin: list all unique reviewers who have a conversation, with latest message. */
export async function listDirectConversations() {
  const db = await getDb();
  if (!db) return [];
  const all = await db
    .select()
    .from(directMessages)
    .orderBy(desc(directMessages.createdAt));
  // dedupe by reviewerId — keep latest message per reviewer
  const map = new Map<number, typeof all[0]>();
  for (const m of all) {
    if (!map.has(m.reviewerId)) map.set(m.reviewerId, m);
  }
  return Array.from(map.values());
}

export async function countUnreadDirectMessages(reviewerId: number, readerUserId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(directMessages)
    .where(
      and(
        eq(directMessages.reviewerId, reviewerId),
        isNull(directMessages.readAt),
      )
    );
  // unread = sent by the other party and not yet read
  return rows.filter(m => m.fromUserId !== readerUserId).length;
}

// === Consulting Requests (상위노출 문의) ===

export async function createConsultingRequest(data: InsertConsultingRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(consultingRequests).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId
    ?? (result as unknown as { insertId: number }).insertId;
  const rows = await db.select().from(consultingRequests).where(eq(consultingRequests.id, Number(insertId))).limit(1);
  return rows[0];
}

export async function listConsultingRequests() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(consultingRequests).orderBy(desc(consultingRequests.createdAt));
}

export async function setConsultingRequestStatus(id: number, status: "new" | "contacted" | "done") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(consultingRequests).set({ status }).where(eq(consultingRequests.id, id));
  const rows = await db.select().from(consultingRequests).where(eq(consultingRequests.id, id)).limit(1);
  return rows[0];
}

// === Business ↔ Reviewer messages (업체-리뷰어 채팅) ===

export async function listBusinessMessages(businessId: number, reviewerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(businessMessages)
    .where(and(eq(businessMessages.businessId, businessId), eq(businessMessages.reviewerId, reviewerId)))
    .orderBy(businessMessages.createdAt);
}

export async function createBusinessMessage(data: InsertBusinessMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(businessMessages).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId
    ?? (result as unknown as { insertId: number }).insertId;
  const rows = await db.select().from(businessMessages).where(eq(businessMessages.id, Number(insertId))).limit(1);
  return rows[0];
}

export async function markBusinessMessagesRead(businessId: number, reviewerId: number, readerUserId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(businessMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(businessMessages.businessId, businessId),
        eq(businessMessages.reviewerId, reviewerId),
        isNull(businessMessages.readAt),
        ne(businessMessages.fromUserId, readerUserId),
      )
    );
}

/** All business-message rows involving a user (as business or reviewer), newest first. */
export async function listBusinessConversations(userId: number, asRole: "business" | "user") {
  const db = await getDb();
  if (!db) return [];
  const col = asRole === "business" ? businessMessages.businessId : businessMessages.reviewerId;
  const all = await db
    .select()
    .from(businessMessages)
    .where(eq(col, userId))
    .orderBy(desc(businessMessages.createdAt));
  // dedupe by the OTHER party — keep latest message per conversation
  const map = new Map<number, typeof all[0]>();
  for (const m of all) {
    const other = asRole === "business" ? m.reviewerId : m.businessId;
    if (!map.has(other)) map.set(other, m);
  }
  return Array.from(map.values());
}

/** 관리자 열람용: 모든 (업체, 리뷰어) 대화쌍의 최신 메시지. */
export async function listAllBusinessConversations() {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(businessMessages).orderBy(desc(businessMessages.createdAt));
  const map = new Map<string, typeof all[0]>();
  for (const m of all) {
    const key = `${m.businessId}:${m.reviewerId}`;
    if (!map.has(key)) map.set(key, m);
  }
  return Array.from(map.values());
}

export async function countUnreadBusinessMessages(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(businessMessages)
    .where(and(isNull(businessMessages.readAt), ne(businessMessages.fromUserId, userId)));
  // unread = messages in conversations where I'm a participant, sent by the other party
  return rows.filter(m => m.businessId === userId || m.reviewerId === userId).length;
}

// === Deposits (예치금) ===

/**
 * Adjust a user's deposit balance by `amount` (can be negative) and record a
 * ledger entry. Throws if the resulting balance would be negative.
 * Returns the new balance.
 */
export async function adjustDeposit(opts: {
  userId: number;
  amount: number;
  type: "charge" | "deduct" | "campaign" | "refund";
  memo?: string;
  createdBy?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const user = await getUserById(opts.userId);
  if (!user) throw new Error("회원을 찾을 수 없습니다.");
  const current = user.depositBalance ?? 0;
  const next = current + opts.amount;
  if (next < 0) throw new Error("예치금 잔액이 부족합니다.");

  await db.update(users).set({ depositBalance: next }).where(eq(users.id, opts.userId));
  await db.insert(depositTransactions).values({
    userId: opts.userId,
    amount: opts.amount,
    type: opts.type,
    balanceAfter: next,
    memo: opts.memo ?? null,
    createdBy: opts.createdBy ?? null,
  });
  return next;
}

export async function listDepositTransactions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(depositTransactions)
    .where(eq(depositTransactions.userId, userId))
    .orderBy(desc(depositTransactions.createdAt));
}

// === Deposit charge requests (예치금 충전요청) ===

export async function createDepositRequest(data: InsertDepositRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(depositRequests).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId
    ?? (result as unknown as { insertId: number }).insertId;
  const rows = await db.select().from(depositRequests).where(eq(depositRequests.id, Number(insertId))).limit(1);
  return rows[0];
}

export async function listDepositRequestsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(depositRequests)
    .where(eq(depositRequests.userId, userId))
    .orderBy(desc(depositRequests.createdAt));
}

/** 모든 충전요청 (관리자용). pending 우선, 그 다음 최신순. */
export async function listAllDepositRequests() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(depositRequests).orderBy(desc(depositRequests.createdAt));
  return rows.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return 0;
  });
}

export async function getDepositRequestById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(depositRequests).where(eq(depositRequests.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function setDepositRequestStatus(
  id: number,
  status: "approved" | "rejected",
  processedBy: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(depositRequests)
    .set({ status, processedBy, processedAt: new Date() })
    .where(eq(depositRequests.id, id));
  const rows = await db.select().from(depositRequests).where(eq(depositRequests.id, id)).limit(1);
  return rows[0];
}

export async function getDepositRequestByPaymentId(paymentId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(depositRequests).where(eq(depositRequests.paymentId, paymentId)).limit(1);
  return rows[0] ?? null;
}

/** 발급된 가상계좌 정보를 저장. */
export async function setDepositRequestVbank(
  id: number,
  vbank: { vbankBank?: string | null; vbankNumber?: string | null; vbankHolder?: string | null; vbankDue?: string | null },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(depositRequests).set(vbank).where(eq(depositRequests.id, id));
}

/** 입금 확인된 vbank 충전건을 반영 완료로 표시. */
export async function markDepositRequestPaid(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(depositRequests)
    .set({ status: "approved", paidAt: new Date() })
    .where(eq(depositRequests.id, id));
}

// === Web Push 구독 ===

export async function savePushSubscription(data: InsertPushSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 같은 endpoint가 이미 있으면 지우고 새로 저장(사용자 변경/갱신 대응).
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, data.endpoint));
  await db.insert(pushSubscriptions).values(data);
}

export async function deletePushSubscriptionByEndpoint(endpoint: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function listPushSubscriptionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function countUnreadMessages(participationId: number, viewerId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.participationId, participationId),
        // unread = sent by the other party (not by viewer)
      )
    );
  return rows.filter(r => r.senderId !== viewerId).length;
}
