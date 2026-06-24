import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

const MAX_BYTES = 6 * 1024 * 1024; // 6MB

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"] as const;

export const uploadRouter = router({
  image: protectedProcedure
    .input(
      z.object({
        dataUrl: z.string().min(1),
        mimeType: z.enum(ALLOWED_MIME),
        purpose: z.enum(["purchase", "review", "thumbnail"]).default("purchase"),
      })
    )
    .mutation(async ({ input }) => {
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "이미지 용량이 너무 큽니다. 6MB 이하로 올려주세요." });
      }

      // Return the data URL directly — stored in DB, no external storage needed.
      const url = input.dataUrl.startsWith("data:")
        ? input.dataUrl
        : `data:${input.mimeType};base64,${base64}`;

      return { url };
    }),
});
