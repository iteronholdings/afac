import { TRPCError } from "@trpc/server";
import JSZip from "jszip";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, businessProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  isStorageConfigured,
  storageDelete,
  storageGetBytes,
  storageGetSignedPutUrl,
  storagePut,
} from "../storage";
import { generateReviewDraft } from "../reviewDraft";
import { distributeTodayStatus } from "../schedule";

/** photoGuideZip / assignedPacket 값이 R2 키 참조(`r2:<key>`)면 키를, 아니면 null 반환. */
function r2KeyOf(value?: string | null): string | null {
  return value && value.startsWith("r2:") ? value.slice(3) : null;
}

/** 캠페인의 원본 가이드 ZIP을 Buffer로 로드한다. (R2 키 또는 레거시 base64 모두 지원) */
async function loadCampaignZipBuffer(photoGuideZip: string): Promise<Buffer> {
  const key = r2KeyOf(photoGuideZip);
  if (key) return storageGetBytes(key);
  const b64 = photoGuideZip.includes(",") ? photoGuideZip.split(",")[1] : photoGuideZip;
  return Buffer.from(b64, "base64");
}

/**
 * 캠페인 완료/삭제 시 R2에 저장된 원본 ZIP·리뷰어 패킷을 모두 삭제한다. (B안 — 비용 최소화)
 * best-effort: 개별 삭제 실패는 무시한다.
 */
async function cleanupCampaignStorage(campaignId: number, photoGuideZip?: string | null) {
  const keys: string[] = [];
  const srcKey = r2KeyOf(photoGuideZip);
  if (srcKey) keys.push(srcKey);
  try {
    const parts = await db.listParticipationsByCampaign(campaignId);
    for (const p of parts) {
      const pk = r2KeyOf(p.assignedPacket);
      if (pk) keys.push(pk);
    }
  } catch { /* ignore */ }
  for (const k of keys) {
    try { await storageDelete(k); } catch (e) { console.error("[R2 cleanup] failed:", k, e); }
  }
}

const campaignInput = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(200),
  category: z.string().trim().max(50).optional(),
  keyword: z.string().trim().min(1, "검색 키워드를 입력해 주세요.").max(200),
  thumbnailUrl: z.string().trim().optional(),
  productUrl: z.string().trim().optional(),
  description: z.string().trim().max(4000).optional(),
  productPrice: z.number().int().min(0),
  commission: z.number().int().min(0),
  slots: z.number().int().min(1).max(10000),
  photoCount: z.number().int().min(0).max(10000).optional(),
  textCount: z.number().int().min(0).max(10000).optional(),
  starCount: z.number().int().min(0).max(10000).optional(),
  startDate: z.string().trim().max(20).optional(),
  endDate: z.string().trim().max(20).optional(),
  schedule: z.string().max(2000).optional(),
  photoGuideZip: z.string().optional(),
  photoGuideZipName: z.string().max(255).optional(),
  // 신규: 브라우저가 R2로 직접 업로드한 가이드 ZIP의 키. 있으면 base64 대신 `r2:<key>`로 저장.
  photoGuideZipKey: z.string().max(512).optional(),
});

/** campaignInput → DB 저장값 정규화: R2 키가 있으면 photoGuideZip을 `r2:<key>`로 치환. */
function normalizeCampaignInput<T extends { photoGuideZip?: string; photoGuideZipKey?: string }>(input: T) {
  const { photoGuideZipKey, ...rest } = input;
  if (photoGuideZipKey) {
    return { ...rest, photoGuideZip: `r2:${photoGuideZipKey}` };
  }
  return rest;
}

/**
 * 신청 시 차감했던 예치금을 업체에 환불한다. (반려·삭제 시 호출)
 * paidAmount가 있고 아직 환불 전(refundedAt 없음)일 때만 1회 실행 → 중복 환불 방지.
 */
async function refundCampaignIfPaid(
  campaign: NonNullable<Awaited<ReturnType<typeof db.getCampaignById>>>,
  adminId: number,
) {
  if (campaign.createdBy && (campaign.paidAmount ?? 0) > 0 && !campaign.refundedAt) {
    await db.adjustDeposit({
      userId: campaign.createdBy,
      amount: campaign.paidAmount,
      type: "refund",
      memo: `캠페인 환불: ${campaign.title}`,
      createdBy: adminId,
    });
    await db.updateCampaign(campaign.id, { refundedAt: new Date() });
  }
}

type PacketUnit = { name: string; bytes: () => Promise<Uint8Array> };

/** 파일들을 하나의 zip으로 재패키징(STORE 무압축 — 사진은 이미 압축됨). `strip` 접두 폴더는 제거. */
async function rezipFiles(files: { rel: string; file: JSZip.JSZipObject }[], strip: string): Promise<Uint8Array> {
  const out = new JSZip();
  for (const { rel, file } of files) {
    const inner = strip && rel.startsWith(strip) ? rel.slice(strip.length) : rel;
    out.file(inner || rel.split("/").pop() || rel, await file.async("uint8array"));
  }
  return out.generateAsync({ type: "uint8array", compression: "STORE" });
}

/**
 * 업로드된 압축파일을 **타고 들어가며** '리뷰어 1인 단위'를 자동 판별한다.
 * 셀러가 어떻게 묶든(래퍼/배치 폴더 몇 겹이든, 최상위 폴더가 여러 개든) 착오 없게:
 *  - 핵심: 사진을 **'바로 위 폴더(=사진이 실제로 든 폴더)'** 단위로 그룹 → 각 폴더 = 1명.
 *    (예: `2차발송본/리뷰어1/..`, `참외1차/리뷰어99/..` 처럼 깊이·배치가 섞여도 각 리뷰어 폴더로 정확히 분리)
 *  - 리뷰어별 .zip이 여러 개면 각 zip 그대로 1명씩.
 *  - 래퍼 zip 한 겹(단일 zip만)이면 그 안으로 재귀.
 *  - 폴더 없이 사진만 흩어져 있으면(분리 불가) 전부 1명에게.
 */
async function analyzeZipUnits(zip: JSZip, depth = 0): Promise<PacketUnit[]> {
  const entries: { path: string; file: JSZip.JSZipObject }[] = [];
  zip.forEach((p, f) => { if (!f.dir) entries.push({ path: p, file: f }); });
  if (entries.length === 0) return [];

  const zipFiles = entries.filter(e => /\.zip$/i.test(e.path));
  const nonZip = entries.filter(e => !/\.zip$/i.test(e.path));

  // 래퍼 zip 한 겹(단일 zip 외 아무것도 없음) → 그 안으로 재귀(깊이 제한).
  if (depth < 5 && zipFiles.length === 1 && nonZip.length === 0) {
    try {
      const inner = await JSZip.loadAsync(await zipFiles[0].file.async("uint8array"));
      const u = await analyzeZipUnits(inner, depth + 1);
      if (u.length > 0) return u;
    } catch { /* 못 열면 아래 규칙으로 */ }
  }

  const units: PacketUnit[] = [];
  // 내부 zip이 여러 개면 셀러가 미리 묶은 것 → 각 zip 그대로 1명.
  for (const z of zipFiles) units.push({ name: z.path.split("/").pop() || "packet.zip", bytes: () => z.file.async("uint8array") });

  // 사진 파일들을 '바로 위 폴더(=사진이 실제로 든 폴더)' 단위로 그룹 → 각 폴더 = 1명.
  // 래퍼/배치 폴더가 몇 겹이든, 최상위 폴더가 여러 개든 상관없이 정확히 쪼개진다.
  const groups = new Map<string, { rel: string; file: JSZip.JSZipObject }[]>();
  for (const e of nonZip) {
    const slash = e.path.lastIndexOf("/");
    const parent = slash >= 0 ? e.path.slice(0, slash) : ""; // 사진이 직접 들어있는 폴더 경로
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent)!.push({ rel: e.path, file: e.file });
  }
  groups.forEach((files, parent) => {
    const name = (parent ? parent.split("/").pop() : "사진모음") || "사진모음";
    units.push({ name: `${name}.zip`, bytes: () => rezipFiles(files, parent ? parent + "/" : "") });
  });

  units.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  // 배치 폴더가 달라도 폴더명이 같으면 유닛 이름이 충돌(같은 R2 키·중복 배정)하므로 " (2)" 접미로 유일화.
  const seen = new Map<string, number>();
  for (const u of units) {
    const n = (seen.get(u.name) ?? 0) + 1;
    seen.set(u.name, n);
    if (n > 1) u.name = `${u.name.replace(/\.zip$/i, "")} (${n}).zip`;
  }
  return units;
}

/**
 * 업로드된 통합 ZIP을 해체해 사진 리뷰어에게 1인 1패킷씩 순서대로 배정한다.
 * `analyzeZipUnits`가 래퍼 폴더/래퍼 zip/중첩 폴더를 타고 들어가 단위를 자동 판별한다.
 * 이미 패킷이 배정된 리뷰어는 건너뛰므로 반복 호출(가입 시 자동배정)에 안전하다.
 * 스토리지가 설정돼 있으면 패킷을 R2에 저장(`r2:<key>`), 아니면 레거시 base64로 저장한다.
 */
export async function assignPacketsForCampaign(
  campaign: NonNullable<Awaited<ReturnType<typeof db.getCampaignById>>>,
): Promise<{ assigned: number; units: number; participants: number }> {
  if (!campaign.photoGuideZip) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "업로드된 사진 리뷰 ZIP이 없습니다." });
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await loadCampaignZipBuffer(campaign.photoGuideZip));
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ZIP 파일을 열 수 없습니다." });
  }

  // 압축파일을 타고 들어가며 '리뷰어 1인 단위'를 자동 판별(래퍼 폴더/래퍼 zip/중첩 폴더 자동 통과).
  const units = await analyzeZipUnits(zip);
  if (units.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ZIP 안에 배정할 파일이 없습니다." });
  }

  const parts = (await db.listParticipationsByCampaign(campaign.id))
    .filter(p => p.status !== "rejected" && (p.reviewType === "photo" || p.reviewType == null))
    .sort((a, b) => new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime());

  const useR2 = isStorageConfigured();
  // 유닛은 **이름 기준**으로 이미 배정된 것을 제외한다 — 참여가 삭제되면 그 사람이 갖고 있던
  // 유닛이 자동으로 '빈 유닛'이 되어 다음 참여자에게 회수·재배정된다. (순번 방식은 삭제 시
  // 같은 유닛이 두 명에게 가거나 유닛이 붕 뜨는 문제가 있어 교체)
  const usedNames = new Set(parts.map(p => p.assignedName).filter(Boolean));
  const freeUnits = units.filter(u => !usedNames.has(u.name));
  const waiting = parts.filter(p => !p.assignedPacket);
  let assigned = 0;
  for (let i = 0; i < waiting.length && i < freeUnits.length; i++) {
    const part = waiting[i];
    const unit = freeUnits[i];
    const bytes = await unit.bytes();
    const assignedName = unit.name;
    // 패킷 배정 시 리뷰 원고가 없으면 함께 생성(사진형). join 누락분 backfill.
    const draftPatch = part.reviewDraft
      ? {}
      : { reviewDraft: generateReviewDraft({ type: "photo", title: campaign.title, keyword: campaign.keyword }) };
    if (useR2) {
      const { key } = await storagePut(`review-packets/${campaign.id}/${assignedName}`, bytes, "application/zip");
      await db.updateParticipation(part.id, { assignedPacket: `r2:${key}`, assignedName, ...draftPatch });
    } else {
      const packetB64 = Buffer.from(bytes).toString("base64");
      await db.updateParticipation(part.id, {
        assignedPacket: `data:application/zip;base64,${packetB64}`,
        assignedName,
        ...draftPatch,
      });
    }
    assigned++;
  }
  return { assigned, units: units.length, participants: parts.length };
}

/**
 * 리뷰어 노출용 오픈 캠페인 목록.
 * 배분(distribute) 캠페인은 **오늘 배분된 날짜에만** 노출한다 — 미래 날짜 선점 금지.
 * (오늘이 모집일이 아니거나 오늘 정원이 다 찼으면 목록에서 숨김)
 * remaining도 배분 캠페인은 '오늘 남은 자리'로 표시한다.
 */
async function listOpenForReviewers() {
  const rows = await db.listCampaigns({ onlyOpen: true });
  type Row = Omit<typeof rows[number], "photoGuideZip"> & {
    taken: number;
    remaining: number;
    /** 배분 캠페인: 날짜별 이미 배정된 인원 (리뷰어 화면 모집 캘린더용). */
    takenByDate?: Record<string, number>;
  };
  const result: Row[] = [];
  for (const c of rows) {
    const parts = await db.listParticipationsByCampaign(c.id);
    const taken = parts.filter(p => p.status !== "rejected").length;
    const dist = distributeTodayStatus(c.schedule, parts);
    // 무거운 photoGuideZip(레거시 base64)은 목록에서 제외.
    const { photoGuideZip: _zip, ...light } = c;
    if (dist.isDistribute) {
      if (!dist.joinable) continue; // 오늘 모집 아님/오늘 마감 → 숨김
      const takenByDate: Record<string, number> = {};
      for (const p of parts) {
        if (p.status !== "rejected" && p.assignedDate) {
          takenByDate[p.assignedDate] = (takenByDate[p.assignedDate] || 0) + 1;
        }
      }
      const todayRemaining = Math.max(0, dist.todayCap - dist.todayTaken);
      result.push({ ...light, taken, remaining: Math.min(todayRemaining, Math.max(0, c.slots - taken)), takenByDate });
    } else {
      result.push({ ...light, taken, remaining: Math.max(0, c.slots - taken) });
    }
  }
  return result;
}

export const campaignRouter = router({
  // Public: list open campaigns for homepage preview (max 3).
  listPreview: publicProcedure.query(async () => {
    return (await listOpenForReviewers()).slice(0, 3);
  }),

  // Protected: list open campaigns for reviewers (with remaining slots).
  // 로그인 사용자만 목록 조회 가능.
  listOpen: protectedProcedure.query(async () => {
    return listOpenForReviewers();
  }),

  // Protected: campaign detail. 로그인한 사용자만 조회 가능.
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const c = await db.getCampaignById(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      const taken = await db.countActiveParticipations(c.id);
      return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
    }),

  // Admin: list all campaigns (incl. closed) with participation counts.
  listAll: adminProcedure.query(async () => {
    const rows = await db.listCampaigns();
    const withCounts = await Promise.all(
      rows.map(async c => {
        const taken = await db.countActiveParticipations(c.id);
        // 무거운 photoGuideZip(base64, 최대 ~40MB)은 목록에서 제외 — 존재 여부만 노출.
        const { photoGuideZip, ...rest } = c;
        return { ...rest, hasPhotoGuideZip: !!photoGuideZip, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
  }),

  /** Admin: 캠페인 id·제목만 — 참여현황 필터 드롭다운용 (썸네일 등 무거운 필드 제외). */
  titles: adminProcedure.query(async () => {
    const rows = await db.listCampaignsLite();
    return rows.map(c => ({ id: c.id, title: c.title }));
  }),

  // Admin: create.
  create: adminProcedure
    .input(campaignInput)
    .mutation(async ({ ctx, input }) => {
      const created = await db.createCampaign({
        ...normalizeCampaignInput(input),
        createdBy: ctx.user.id,
      });
      return created;
    }),

  // Admin: update.
  update: adminProcedure
    .input(campaignInput.partial().extend({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const existing = await db.getCampaignById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      return db.updateCampaign(id, normalizeCampaignInput(rest));
    }),

  // Business: presigned PUT URL 발급 → 브라우저가 큰 ZIP을 R2로 직접 업로드.
  // base64-in-DB(64MB packet) 한계를 우회한다. 반환 key를 캠페인 신청 시 photoGuideZipKey로 전달.
  zipUploadUrl: businessProcedure
    .input(z.object({ fileName: z.string().trim().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      if (!isStorageConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "스토리지가 설정되지 않았습니다. 관리자에게 문의해 주세요." });
      }
      const safe = input.fileName.replace(/[^a-zA-Z0-9._가-힣-]/g, "_").slice(-120);
      return storageGetSignedPutUrl(`campaign-zips/${ctx.user.id}/${Date.now()}_${safe}`);
    }),

  // Admin: delete campaign (and its participations). 결제된 캠페인이면 예치금 환불.
  remove: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getCampaignById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      await refundCampaignIfPaid(existing, ctx.user.id);
      await cleanupCampaignStorage(existing.id, existing.photoGuideZip); // R2 정리
      await db.deleteCampaign(input.id);
      return { id: input.id };
    }),

  // Admin: toggle status. rejected로 바꾸면 차감했던 예치금을 자동 환불.
  setStatus: adminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["pending", "open", "closed", "rejected", "in_progress", "error"]) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getCampaignById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      if (input.status === "rejected") {
        await refundCampaignIfPaid(existing, ctx.user.id);
      }
      // 캠페인 완료(closed) 또는 반려 시 R2에 저장된 원본 ZIP·패킷 삭제 (B안 — 비용 최소화).
      if (input.status === "closed" || input.status === "rejected") {
        await cleanupCampaignStorage(existing.id, existing.photoGuideZip);
      }
      return db.updateCampaign(input.id, { status: input.status });
    }),

  // Business: fetch a product's thumbnail + price from its URL via OG/meta tags.
  // Best-effort — Coupang/Naver sometimes omit or block these; caller falls back
  // to manual entry when fields come back empty.
  fetchProductMeta: businessProcedure
    .input(z.object({ url: z.string().trim().url("올바른 URL을 입력해 주세요.") }))
    .mutation(async ({ input }) => {
      try {
        const res = await fetch(input.url, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "accept-language": "ko-KR,ko;q=0.9",
          },
          redirect: "follow",
        });
        const html = await res.text();

        const meta = (prop: string) => {
          const re = new RegExp(
            `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
            "i"
          );
          const m = html.match(re) ?? html.match(
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i")
          );
          return m?.[1];
        };

        const thumbnailUrl = meta("og:image") ?? null;
        const title = meta("og:title") ?? null;

        // price: try meta tags first, then JSON-LD, then a ₩/원 amount.
        let priceRaw =
          meta("product:price:amount") ??
          meta("og:price:amount") ??
          html.match(/"price"\s*:\s*"?([0-9][0-9,]*)"?/i)?.[1] ??
          html.match(/([0-9]{1,3}(?:,[0-9]{3})+)\s*원/)?.[1];
        const price = priceRaw ? parseInt(priceRaw.replace(/[^0-9]/g, ""), 10) : null;

        return { thumbnailUrl, title, price: Number.isFinite(price as number) ? price : null };
      } catch {
        return { thumbnailUrl: null, title: null, price: null };
      }
    }),

  // Business: request a new campaign. Charges the seller's deposit balance up
  // front (예치금 차감) — fails if the balance is insufficient — then creates the
  // campaign as pending for admin approval.
  request: businessProcedure
    .input(campaignInput)
    .mutation(async ({ ctx, input }) => {
      // 오늘 시작하는 캠페인은 KST 오후 2시까지만 신청 가능 (업체 대상, 서버 무결성 가드).
      // 관리자(운영팀)는 당일 접수 제한 없이 언제든 등록 가능.
      if (ctx.user.role !== "admin") {
        const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
        const kstToday = kstNow.toISOString().slice(0, 10);
        if (input.startDate === kstToday && kstNow.getUTCHours() >= 14) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "오늘 시작하는 캠페인은 오후 2시까지만 신청할 수 있습니다. 시작일을 내일 이후로 설정해 주세요." });
        }
      }

      const me = await db.getUserById(ctx.user.id);
      const isAdmin = ctx.user.role === "admin";
      // 건당 리뷰 비용: 업체별 우대 단가(VIP)가 있으면 그 값, 없으면 기본 2,400원.
      const REVIEW_FEE = me?.customReviewFee ?? 2400;
      const SHIPPING_FEE = 2300; // 건당 택배비
      const perUnit = (input.productPrice ?? 0) + REVIEW_FEE + SHIPPING_FEE;
      const total = perUnit * input.slots;

      // 관리자(운영팀)가 마법사로 등록할 땐 예치금 차감/검증 없이 즉시 승인 상태로 생성.
      if (isAdmin) {
        return db.createCampaign({
          ...normalizeCampaignInput(input),
          status: "open",       // 관리자 등록은 승인 절차 없이 바로 모집
          createdBy: ctx.user.id,
          paidAmount: 0,        // 예치금 미차감
        });
      }

      const balance = me?.depositBalance ?? 0;
      if (balance < total) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `예치금이 부족합니다. (필요 ${total.toLocaleString()}원 · 보유 ${balance.toLocaleString()}원)`,
        });
      }

      const created = await db.createCampaign({
        ...normalizeCampaignInput(input),
        status: "pending",
        createdBy: ctx.user.id,
        paidAmount: total, // 반려·삭제 시 이 금액을 환불
      });

      // Deduct after the campaign row exists so we can reference it in the memo.
      await db.adjustDeposit({
        userId: ctx.user.id,
        amount: -total,
        type: "campaign",
        memo: `캠페인 결제: ${input.title}`,
        createdBy: ctx.user.id,
      });

      return created;
    }),

  // Business: list own campaigns with participation counts.
  myBusiness: businessProcedure.query(async ({ ctx }) => {
    const rows = await db.listCampaignsByOwner(ctx.user.id);
    const withCounts = await Promise.all(
      rows.map(async c => {
        const taken = await db.countActiveParticipations(c.id);
        // Strip the heavy guide ZIP from the list payload; expose a flag.
        const { photoGuideZip, ...rest } = c;
        return { ...rest, hasPhotoGuideZip: !!photoGuideZip, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
  }),

  // Business: save (create or update) a campaign-application draft.
  // 마법사 입력값 전체를 JSON으로 보관 — 예치금 차감/정식 캠페인 생성과 무관.
  saveDraft: businessProcedure
    .input(z.object({
      id: z.number().int().optional(),
      title: z.string().trim().max(200).optional(),
      data: z.string().max(10_000_000), // WizardData JSON (썸네일 base64 포함, ZIP 제외)
    }))
    .mutation(async ({ ctx, input }) => {
      const title = input.title || "제목 없는 캠페인";
      if (input.id) {
        const existing = await db.getCampaignDraftById(input.id);
        if (!existing || existing.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
        }
        return db.updateCampaignDraft(input.id, { title, data: input.data });
      }
      return db.createCampaignDraft({ userId: ctx.user.id, title, data: input.data });
    }),

  // Business: list my drafts (lightweight — without the heavy `data` payload).
  myDrafts: businessProcedure.query(async ({ ctx }) => {
    const rows = await db.listCampaignDraftsByOwner(ctx.user.id);
    return rows.map(({ data, ...rest }) => rest);
  }),

  // Business: load one draft (with full data) to resume editing.
  getDraft: businessProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const draft = await db.getCampaignDraftById(input.id);
      if (!draft || draft.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "임시저장을 찾을 수 없습니다." });
      }
      return draft;
    }),

  // Business: delete a draft (on submit or manual discard).
  deleteDraft: businessProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const draft = await db.getCampaignDraftById(input.id);
      if (!draft || draft.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "임시저장을 찾을 수 없습니다." });
      }
      await db.deleteCampaignDraft(input.id);
      return { id: input.id };
    }),

  // Business/Admin: decompress the uploaded photo-guide ZIP and assign one
  // top-level unit (folder or file) to each reviewer in order (a방식).
  assignZipPackets: businessProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaignById(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      if (ctx.user.role !== "admin" && campaign.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
      }
      return assignPacketsForCampaign(campaign);
    }),

  // Business: list participations for a campaign they own (with proof photos).
  campaignParticipants: businessProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const campaign = await db.getCampaignById(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      // Admin can see any campaign; business can only see their own.
      if (ctx.user.role !== "admin" && campaign.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
      }
      const parts = await db.listParticipationsByCampaign(input.campaignId);
      // Attach reviewer info (name, phone) per participation.
      const withUser = await Promise.all(
        parts.map(async p => {
          const reviewer = await db.getUserById(p.userId);
          return {
            ...p,
            reviewer: reviewer
              ? { id: reviewer.id, fullName: reviewer.fullName, phone: reviewer.phone }
              : null,
          };
        })
      );
      return withUser;
    }),
});
