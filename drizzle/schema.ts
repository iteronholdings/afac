import { int, longtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended to support self-hosted ID/PW authentication for reviewer members.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Stable session identity. For self-signup members this is `local_<loginId>`. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "business", "admin"]).default("user").notNull(),

  /** Self-signup login ID (unique). Null for OAuth users. */
  loginId: varchar("loginId", { length: 64 }).unique(),
  /** bcrypt hash of the member password. Null for OAuth users. */
  passwordHash: varchar("passwordHash", { length: 255 }),
  /** Member real name (성명). */
  fullName: varchar("fullName", { length: 100 }),
  /** Member phone number (전화번호). */
  phone: varchar("phone", { length: 32 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Campaign defined by an admin. Reviewers browse and apply to participate.
 * Amounts are stored as integer KRW (원).
 */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  /** Campaign title shown to reviewers. */
  title: varchar("title", { length: 200 }).notNull(),
  /** Category label (e.g. 뷰티, 리빙, 푸드). */
  category: varchar("category", { length: 50 }),
  /** Search keyword reviewers must use to find & purchase the product. */
  keyword: varchar("keyword", { length: 200 }).notNull(),
  /** Product thumbnail. Stored as base64 data URL or external URL. Optional. */
  thumbnailUrl: longtext("thumbnailUrl"),
  /** Optional shopping link or extra guide for reviewers. */
  productUrl: text("productUrl"),
  /** Description / mission detail. */
  description: text("description"),
  /** Product price in KRW (상품가). Reimbursed to reviewer. */
  productPrice: int("productPrice").notNull().default(0),
  /** Review commission in KRW (리뷰 수수료). */
  commission: int("commission").notNull().default(0),
  /** Number of reviewer slots (모집 인원). */
  slots: int("slots").notNull().default(1),
  /** pending: 업체 신청 대기, open: 모집 중, closed: 마감, rejected: 반려. */
  status: mysqlEnum("status", ["pending", "open", "closed", "rejected"]).default("open").notNull(),
  /** User.id who created/requested this campaign (admin or business). */
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

/**
 * A reviewer's participation in a campaign. Tracks the full workflow:
 * applied → purchased → reviewed → approved (지급확정) → paid (입금완료/종료)
 */
export const participations = mysqlTable("participations", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  /** Reviewer user.id. */
  userId: int("userId").notNull(),
  status: mysqlEnum("status", [
    "applied",
    "searched",
    "purchased",
    "reviewed",
    "approved",
    "paid",
    "rejected",
  ])
    .default("applied")
    .notNull(),
  /** Search proof screenshot (검색 인증샷). Stored as base64 data URL. */
  searchProofUrl: longtext("searchProofUrl"),
  /** Purchase proof screenshot (구매 인증샷). Stored as base64 data URL. */
  purchaseProofUrl: longtext("purchaseProofUrl"),
  /** Review proof screenshot (리뷰 인증샷). Stored as base64 data URL. */
  reviewProofUrl: longtext("reviewProofUrl"),
  /** Optional memo from admin (e.g. rejection reason or payout note). */
  adminMemo: text("adminMemo"),

  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
  searchedAt: timestamp("searchedAt"),
  purchasedAt: timestamp("purchasedAt"),
  reviewedAt: timestamp("reviewedAt"),
  approvedAt: timestamp("approvedAt"),
  paidAt: timestamp("paidAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Participation = typeof participations.$inferSelect;
export type InsertParticipation = typeof participations.$inferInsert;

/**
 * 1:1 chat messages between admin and reviewer, scoped to a participation.
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  participationId: int("participationId").notNull(),
  senderId: int("senderId").notNull(),
  content: text("content"),
  imageUrl: longtext("imageUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
