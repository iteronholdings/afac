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
