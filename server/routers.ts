import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { businessMessageRouter } from "./routers/businessMessage";
import { campaignRouter } from "./routers/campaign";
import { consultingRouter } from "./routers/consulting";
import { depositRouter } from "./routers/deposit";
import { directMessageRouter } from "./routers/directMessage";
import { messageRouter } from "./routers/message";
import { participationRouter } from "./routers/participation";
import { pushRouter } from "./routers/push";
import { uploadRouter } from "./routers/upload";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: authRouter,
  campaign: campaignRouter,
  participation: participationRouter,
  message: messageRouter,
  directMessage: directMessageRouter,
  consulting: consultingRouter,
  deposit: depositRouter,
  businessMessage: businessMessageRouter,
  admin: adminRouter,
  upload: uploadRouter,
  push: pushRouter,
});

export type AppRouter = typeof appRouter;
