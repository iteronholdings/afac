import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const MAX_BYTES = 6 * 1024 * 1024; // 6MB cap for proof screenshots

const ALLOWED = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export const uploadRouter = router({
  // Upload an image (base64 data URL or raw base64) and return its storage URL.
  image: protectedProcedure
    .input(
      z.object({
        // data URL (data:image/png;base64,xxxx) or raw base64 string
        dataUrl: z.string().min(1),
        mimeType: z
          .enum(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]),
        purpose: z.enum(["purchase", "review", "thumbnail"]).default("purchase"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const base64 = input.dataUrl.includes(",")
        ? input.dataUrl.split(",")[1]
        : input.dataUrl;

      let buffer: Buffer;
      try {
        buffer = Buffer.from(base64, "base64");
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "이미지 데이터가 올바르지 않습니다." });
      }

      if (buffer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "빈 이미지입니다." });
      }
      if (buffer.length > MAX_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "이미지 용량이 너무 큽니다. 6MB 이하로 올려주세요.",
        });
      }

      const ext = ALLOWED[input.mimeType];
      const key = `proofs/${ctx.user.id}/${input.purpose}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url };
    }),
});
