import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function getS3Client() {
  if (!ENV.s3AccessKeyId || !ENV.s3SecretAccessKey || !ENV.s3Bucket) {
    throw new Error(
      "Storage not configured: set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET (and optionally S3_ENDPOINT, S3_REGION)"
    );
  }
  return new S3Client({
    region: ENV.s3Region || "auto",
    endpoint: ENV.s3Endpoint || undefined,
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
    // Required for Cloudflare R2 path-style URLs
    forcePathStyle: !!ENV.s3Endpoint,
  });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));

  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as Uint8Array);

  await client.send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const client = getS3Client();
  const key = normalizeKey(relKey);

  // If a public CDN URL is configured, return it directly (no signing needed)
  if (ENV.s3PublicUrl) {
    return `${ENV.s3PublicUrl.replace(/\/+$/, "")}/${key}`;
  }

  const command = new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}
