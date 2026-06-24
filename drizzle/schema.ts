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

  /** Bank name for payout (은행명). e.g. 국민은행 */
  bankName: varchar("bankName", { length: 50 }),
  /** Bank account number (계좌번호). */
  bankAccount: varchar("bankAccount", { length: 50 }),
  /** Account holder name (예금주명). */
  bankHolder: varchar("bankHolder", { length: 50 }),

  /** Unique human-readable member code assigned by admin. e.g. A-001 */
  memberCode: varchar("memberCode", { length: 20 }),

  /** 예치금 잔액 (원). 업체가 캠페인 결제에 사용. */
  depositBalance: int("depositBalance").notNull().default(0),

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
  /** Number of reviewer slots (모집 인원) — sum of the three review types below. */
  slots: int("slots").notNull().default(1),
  /** 사진 리뷰 모집 인원. */
  photoCount: int("photoCount").notNull().default(0),
  /** 글자 리뷰 모집 인원. */
  textCount: int("textCount").notNull().default(0),
  /** 별점 리뷰 모집 인원. */
  starCount: int("starCount").notNull().default(0),
  /** 캠페인 시작일 (YYYY-MM-DD). */
  startDate: varchar("startDate", { length: 20 }),
  /** 캠페인 종료일 (YYYY-MM-DD, 최대 시작일+9일). */
  endDate: varchar("endDate", { length: 20 }),
  /** 날짜별 모집 인원 배분 (JSON: { "YYYY-MM-DD": n }). */
  schedule: text("schedule"),
  /** 사진 리뷰용 업로드 ZIP (base64 data URL). */
  photoGuideZip: longtext("photoGuideZip"),
  /** 사진 리뷰 ZIP 원본 파일명. */
  photoGuideZipName: varchar("photoGuideZipName", { length: 255 }),
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

/**
 * Direct messages between a reviewer and the platform (운영팀).
 * Conversations are scoped to the reviewer's userId (reviewerId).
 * Admin can see all conversations; reviewer can only see their own.
 */
export const directMessages = mysqlTable("direct_messages", {
  id: int("id").autoincrement().primaryKey(),
  /** Identifies the conversation — always the reviewer's userId. */
  reviewerId: int("reviewerId").notNull(),
  /** Who sent this message (reviewer or admin). */
  fromUserId: int("fromUserId").notNull(),
  content: text("content"),
  imageUrl: longtext("imageUrl"),
  /** Timestamp when the recipient read this message. Null = unread. */
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = typeof directMessages.$inferInsert;

/**
 * 상위노출 컨설팅 문의 (SEO/top-ranking consulting requests) submitted by sellers.
 * Accumulated for admins to review in a dedicated dashboard tab.
 */
export const consultingRequests = mysqlTable("consulting_requests", {
  id: int("id").autoincrement().primaryKey(),
  /** User.id of the seller (business) who submitted the request. */
  userId: int("userId").notNull(),
  /** 쿠팡 | 네이버 스마트스토어. */
  platform: varchar("platform", { length: 30 }).notNull(),
  /** Product URL to optimize. */
  productUrl: text("productUrl"),
  /** Target search keyword(s) to rank for. */
  targetKeyword: varchar("targetKeyword", { length: 300 }),
  /** Current rank note (optional). */
  currentRank: varchar("currentRank", { length: 100 }),
  /** Desired budget note (optional). */
  budget: varchar("budget", { length: 100 }),
  /** Extra request memo (optional). */
  memo: text("memo"),
  /** new: 신규 접수, contacted: 연락 완료, done: 처리 완료. */
  status: mysqlEnum("status", ["new", "contacted", "done"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConsultingRequest = typeof consultingRequests.$inferSelect;
export type InsertConsultingRequest = typeof consultingRequests.$inferInsert;

/**
 * 예치금 거래 장부. 충전(추가)·차감·캠페인 결제·환불 내역을 기록.
 */
export const depositTransactions = mysqlTable("deposit_transactions", {
  id: int("id").autoincrement().primaryKey(),
  /** 대상 업체 user.id. */
  userId: int("userId").notNull(),
  /** 변동액 (원). 충전/환불은 +, 차감/결제는 −. */
  amount: int("amount").notNull(),
  /** charge: 관리자 충전, deduct: 관리자 차감, campaign: 캠페인 결제, refund: 환불. */
  type: mysqlEnum("type", ["charge", "deduct", "campaign", "refund"]).notNull(),
  /** 변동 후 잔액 (원). */
  balanceAfter: int("balanceAfter").notNull(),
  /** 메모 (캠페인명, 사유 등). */
  memo: varchar("memo", { length: 255 }),
  /** 처리한 관리자 user.id (있을 경우). */
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DepositTransaction = typeof depositTransactions.$inferSelect;
export type InsertDepositTransaction = typeof depositTransactions.$inferInsert;
