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

  /** 리뷰어 절차 안내에 동의한 시각. null = 아직 미동의 (리뷰어 활동 차단). */
  reviewerAgreedAt: timestamp("reviewerAgreedAt"),

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
  /**
   * 운영 상태:
   * pending(승인대기) · open(승인완료=모집중) · in_progress(작업진행) ·
   * error(오류) · closed(작업완료) · rejected(반려).
   */
  status: mysqlEnum("status", ["pending", "open", "closed", "rejected", "in_progress", "error"]).default("open").notNull(),
  /** User.id who created/requested this campaign (admin or business). */
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

/**
 * 업체가 작성하던 캠페인 신청서의 임시저장본.
 * 마법사(CampaignWizard)의 입력값 전체를 JSON 문자열(`data`)로 보관해
 * 나중에 그대로 이어서 작성할 수 있게 한다. 정식 제출과는 무관(예치금 차감 없음).
 */
export const campaignDrafts = mysqlTable("campaign_drafts", {
  id: int("id").autoincrement().primaryKey(),
  /** 작성한 업체 user.id. */
  userId: int("userId").notNull(),
  /** 목록에 보여줄 제목 (상품명 등). 비어 있으면 "제목 없는 캠페인". */
  title: varchar("title", { length: 200 }),
  /** 마법사 입력값 전체 (WizardData JSON 직렬화). */
  data: longtext("data"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignDraft = typeof campaignDrafts.$inferSelect;
export type InsertCampaignDraft = typeof campaignDrafts.$inferInsert;

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

  /** 사진 리뷰 ZIP에서 이 리뷰어에게 할당된 패킷 (base64 zip data URL). */
  assignedPacket: longtext("assignedPacket"),
  /** 할당된 패킷의 이름 (ZIP 내 폴더/파일명). */
  assignedName: varchar("assignedName", { length: 255 }),

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

/**
 * 업체가 올린 예치금 충전요청. 업체가 계좌로 입금한 뒤 신청하면,
 * 관리자가 입금을 확인하고 승인하면 예치금(depositBalance)에 반영된다.
 * (무통장입금 자동반영은 추후 — 지금은 관리자 수동 승인.)
 */
export const depositRequests = mysqlTable("deposit_requests", {
  id: int("id").autoincrement().primaryKey(),
  /** 요청한 업체 user.id. */
  userId: int("userId").notNull(),
  /** 충전 요청 금액 (원). */
  amount: int("amount").notNull(),
  /** 입금자명 (통장 표기명). 필수, 최대 20자. */
  depositorName: varchar("depositorName", { length: 20 }),
  /** 추가 메모 (선택, 레거시). */
  memo: varchar("memo", { length: 255 }),
  /** 세금계산서 발급 여부. issue: 발급, none: 미발급. */
  taxInvoice: mysqlEnum("taxInvoice", ["issue", "none"]).default("none").notNull(),
  /** 세금계산서 발급 정보 (발급 선택 시). */
  bizNumber: varchar("bizNumber", { length: 20 }),
  repName: varchar("repName", { length: 40 }),
  companyName: varchar("companyName", { length: 100 }),
  taxEmail: varchar("taxEmail", { length: 120 }),
  /** pending: 승인 대기, approved: 승인 완료(반영됨), rejected: 거절. */
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  /** 처리한 관리자 user.id. */
  processedBy: int("processedBy"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DepositRequest = typeof depositRequests.$inferSelect;
export type InsertDepositRequest = typeof depositRequests.$inferInsert;

/**
 * 업체 ↔ 리뷰어 1:1 채팅. 대화는 (businessId, reviewerId) 쌍으로 묶인다.
 * 리뷰어가 업체의 캠페인에 참여한 관계에서 문의/소통에 사용.
 */
export const businessMessages = mysqlTable("business_messages", {
  id: int("id").autoincrement().primaryKey(),
  /** 업체(비즈니스) user.id. */
  businessId: int("businessId").notNull(),
  /** 리뷰어 user.id. */
  reviewerId: int("reviewerId").notNull(),
  /** 보낸 사람 user.id (업체 또는 리뷰어). */
  fromUserId: int("fromUserId").notNull(),
  content: text("content"),
  imageUrl: longtext("imageUrl"),
  /** 수신자가 읽은 시각. null = 안 읽음. */
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BusinessMessage = typeof businessMessages.$inferSelect;
export type InsertBusinessMessage = typeof businessMessages.$inferInsert;
