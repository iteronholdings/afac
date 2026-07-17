import "dotenv/config";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { verifyWebhook } from "../portone";
import { creditVbankIfPaid } from "../depositCredit";
import * as db from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads.
  // A 50MB ZIP becomes ~67MB once base64-encoded in the JSON body, so allow 100MB.
  app.use(express.json({
    limit: "100mb",
    // keep raw body so we can verify PortOne webhook signatures
    verify: (req, _res, buf) => { (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf8"); },
  }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // PortOne(포트원) 결제 웹훅 — 가상계좌 입금 시 예치금 자동반영
  app.post("/api/portone/webhook", async (req, res) => {
    try {
      const raw = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
      const ok = verifyWebhook(raw, {
        "webhook-id": req.header("webhook-id"),
        "webhook-timestamp": req.header("webhook-timestamp"),
        "webhook-signature": req.header("webhook-signature"),
      });
      if (!ok) return res.status(400).send("invalid signature");
      const paymentId: string | undefined = req.body?.data?.paymentId ?? req.body?.paymentId;
      if (paymentId) {
        const result = await creditVbankIfPaid(paymentId);
        console.log(`[PortOne webhook] ${paymentId} →`, result);
      }
      res.status(200).send("ok");
    } catch (e) {
      console.error("[PortOne webhook] error:", e);
      res.status(200).send("ok");
    }
  });
  // 안드로이드 앱(TWA) 도메인 소유 증명 — 플레이스토어 앱이 주소창 없이 afac.kr을 열 수 있게 한다.
  // 지문(SHA-256)은 앱 서명 키에서 추출한 공개 정보라 코드에 둬도 안전.
  const ANDROID_APP_CERT_SHA256 = "3F:88:A9:1F:8A:E3:B0:C3:C4:29:1B:9A:10:6E:B4:B4:5D:53:75:F2:5D:19:52:79:B1:53:E1:D5:9E:6E:C0:98";
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    res.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "kr.afac.app",
          sha256_cert_fingerprints: [ANDROID_APP_CERT_SHA256],
        },
      },
    ]);
  });

  // 카톡 단톡방 공지 — 회계 컴퓨터의 로컬 에이전트가 폴링·게시하는 큐 API.
  // KAKAO_AGENT_TOKEN 공유 시크릿으로 보호. 미설정 시 503(기능 비활성).
  const kakaoTokenOk = (t: unknown) => {
    const secret = process.env.KAKAO_AGENT_TOKEN;
    return !!secret && typeof t === "string" && t === secret;
  };
  app.get("/api/kakao/pending", async (req, res) => {
    if (!process.env.KAKAO_AGENT_TOKEN) return res.status(503).json({ error: "disabled" });
    if (!kakaoTokenOk(req.query.token)) return res.status(401).json({ error: "unauthorized" });
    try {
      const rows = await db.listPendingKakaoAnnouncements();
      res.json({ announcements: rows.map(r => ({ id: r.id, message: r.message, campaignId: r.campaignId })) });
    } catch (e) {
      console.error("[kakao pending] error:", e);
      res.status(500).json({ error: "server_error" });
    }
  });
  app.post("/api/kakao/ack", async (req, res) => {
    if (!process.env.KAKAO_AGENT_TOKEN) return res.status(503).json({ error: "disabled" });
    if (!kakaoTokenOk(req.body?.token)) return res.status(401).json({ error: "unauthorized" });
    const id = Number(req.body?.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "bad_id" });
    try {
      await db.markKakaoAnnouncement(id, req.body?.ok !== false, req.body?.error);
      res.json({ ok: true });
    } catch (e) {
      console.error("[kakao ack] error:", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  // On a hosting platform (Railway 등) PORT is injected and MUST be used exactly —
  // never scan for a different port, or the platform's router can't reach the app
  // ("train has not arrived" 404). Only fall back to port-scan for local dev.
  const port = process.env.PORT ? preferredPort : await findAvailablePort(preferredPort);

  if (!process.env.PORT && port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Bind 0.0.0.0 so the platform proxy (and not just localhost) can reach it.
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on 0.0.0.0:${port} (NODE_ENV=${process.env.NODE_ENV})`);
  });
}

startServer().catch(console.error);
