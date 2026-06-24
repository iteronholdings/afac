import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { campaignRouter } from "./routers/campaign";
import { participationRouter } from "./routers/participation";
import { uploadRouter } from "./routers/upload";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: authRouter,
  campaign: campaignRouter,
  participation: participationRouter,
  admin: adminRouter,
  upload: uploadRouter,
});

export type AppRouter = typeof appRouter;
