import { TRPCError } from "@trpc/server";
import JSZip from "jszip";
import { z } from "zod";
import * as db from "../db";
import { adminProcedure, businessProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";

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
});

export const campaignRouter = router({
  // Public: list open campaigns for homepage preview (max 3).
  listPreview: publicProcedure.query(async () => {
    const rows = await db.listCampaigns({ onlyOpen: true });
    const withCounts = await Promise.all(
      rows.slice(0, 3).map(async c => {
        const taken = await db.countActiveParticipations(c.id);
        return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
  }),

  // Protected: list open campaigns for reviewers (with remaining slots).
  // 로그인 사용자만 목록 조회 가능.
  listOpen: protectedProcedure.query(async () => {
    const rows = await db.listCampaigns({ onlyOpen: true });
    const withCounts = await Promise.all(
      rows.map(async c => {
        const taken = await db.countActiveParticipations(c.id);
        return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
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
        return { ...c, taken, remaining: Math.max(0, c.slots - taken) };
      })
    );
    return withCounts;
  }),

  // Admin: create.
  create: adminProcedure
    .input(campaignInput)
    .mutation(async ({ ctx, input }) => {
      const created = await db.createCampaign({
        ...input,
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
      return db.updateCampaign(id, rest);
    }),

  // Admin: delete campaign (and its participations).
  remove: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const existing = await db.getCampaignById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
      await db.deleteCampaign(input.id);
      return { id: input.id };
    }),

  // Admin: toggle status (open/closed/pending/rejected).
  setStatus: adminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["pending", "open", "closed", "rejected", "in_progress", "error"]) }))
    .mutation(async ({ input }) => {
      const existing = await db.getCampaignById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "캠페인을 찾을 수 없습니다." });
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
      const REVIEW_FEE = 2000;   // 셀러 부담 건당 리뷰 비용
      const SHIPPING_FEE = 2300; // 건당 택배비
      const perUnit = (input.productPrice ?? 0) + REVIEW_FEE + SHIPPING_FEE;
      const total = perUnit * input.slots;

      const me = await db.getUserById(ctx.user.id);
      const balance = me?.depositBalance ?? 0;
      if (balance < total) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `예치금이 부족합니다. (필요 ${total.toLocaleString()}원 · 보유 ${balance.toLocaleString()}원)`,
        });
      }

      const created = await db.createCampaign({
        ...input,
        status: "pending",
        createdBy: ctx.user.id,
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
      if (!campaign.photoGuideZip) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "업로드된 사진 리뷰 ZIP이 없습니다." });
      }

      // Decode base64 data URL → Buffer → load ZIP.
      const b64 = campaign.photoGuideZip.includes(",")
        ? campaign.photoGuideZip.split(",")[1]
        : campaign.photoGuideZip;
      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(Buffer.from(b64, "base64"));
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ZIP 파일을 열 수 없습니다." });
      }

      // Group non-folder entries by their top-level segment = one unit per reviewer.
      const units = new Map<string, { path: string; file: JSZip.JSZipObject }[]>();
      zip.forEach((relPath, file) => {
        if (file.dir) return;
        const top = relPath.split("/")[0];
        if (!units.has(top)) units.set(top, []);
        units.get(top)!.push({ path: relPath, file });
      });
      const unitList = Array.from(units.entries()); // [name, files][]
      if (unitList.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ZIP 안에 파일이 없습니다." });
      }

      // Active participants, first-come order.
      const parts = (await db.listParticipationsByCampaign(input.campaignId))
        .filter(p => p.status !== "rejected")
        .sort((a, b) => new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime());

      let assigned = 0;
      for (let i = 0; i < parts.length && i < unitList.length; i++) {
        const [unitName, files] = unitList[i];
        const out = new JSZip();
        for (const { path, file } of files) {
          // strip the top folder prefix so the reviewer's zip is clean
          const rel = path.startsWith(unitName + "/") ? path.slice(unitName.length + 1) : path;
          out.file(rel || unitName, await file.async("uint8array"));
        }
        const packetB64 = await out.generateAsync({ type: "base64", compression: "DEFLATE" });
        await db.updateParticipation(parts[i].id, {
          assignedPacket: `data:application/zip;base64,${packetB64}`,
          assignedName: `${unitName}.zip`,
        });
        assigned++;
      }

      return { assigned, units: unitList.length, participants: parts.length };
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
