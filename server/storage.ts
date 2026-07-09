import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
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

/** 스토리지(R2/S3)가 환경변수로 설정되어 있는지 여부. */
export function isStorageConfigured(): boolean {
  return !!(ENV.s3AccessKeyId && ENV.s3SecretAccessKey && ENV.s3Bucket);
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

/**
 * 브라우저 → R2 직접 업로드용 presigned PUT URL을 발급한다.
 * Content-Type을 서명에 포함하지 않으므로 클라이언트는 임의의 본문을 PUT할 수 있다.
 * 반환 key 를 통해 이후 다운로드(`/manus-storage/<key>`)·삭제가 가능하다.
 */
export async function storageGetSignedPutUrl(
  relKey: string,
  expiresIn = 900
): Promise<{ key: string; url: string; publicPath: string }> {
  const client = getS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));
  const command = new PutObjectCommand({ Bucket: ENV.s3Bucket, Key: key });
  const url = await getSignedUrl(client, command, { expiresIn });
  return { key, url, publicPath: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string, downloadName?: string): Promise<string> {
  const client = getS3Client();
  const key = normalizeKey(relKey);

  // If a public CDN URL is configured, return it directly (no signing needed)
  if (ENV.s3PublicUrl) {
    return `${ENV.s3PublicUrl.replace(/\/+$/, "")}/${key}`;
  }

  const command = new GetObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    // 다운로드 시 원하는 파일명을 강제(브라우저 저장 이름).
    ...(downloadName
      ? { ResponseContentDisposition: `attachment; filename="${encodeURIComponent(downloadName)}"` }
      : {}),
  });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

/** R2 객체 바이트를 읽어 Buffer로 반환한다. (ZIP 패킷 분해 등 서버측 처리용) */
export async function storageGetBytes(relKey: string): Promise<Buffer> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const out = await client.send(new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }));
  const body = out.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) {
    throw new Error("Storage object has no readable body");
  }
  return Buffer.from(await body.transformToByteArray());
}

/** R2에 해당 키의 객체가 존재하는지 확인한다. (삭제된 패킷 다운로드 전 확인용) */
export async function storageExists(relKey: string): Promise<boolean> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  try {
    await client.send(new HeadObjectCommand({ Bucket: ENV.s3Bucket, Key: key }));
    return true;
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) return false;
    throw e; // 그 외 오류(권한 등)는 그대로 전파
  }
}

/** R2 객체를 삭제한다. (캠페인 삭제·ZIP 재업로드 시 알집·패킷 정리 — 비용 최소화) */
export async function storageDelete(relKey: string): Promise<void> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  await client.send(new DeleteObjectCommand({ Bucket: ENV.s3Bucket, Key: key }));
}
