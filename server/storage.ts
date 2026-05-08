/**
 * Storage helpers — suporta dois modos:
 * - "manus": usa o proxy Manus Forge (BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY)
 * - "s3": usa AWS S3 / Cloudflare R2 direto (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL)
 *
 * Defina STORAGE_TYPE=s3 no Railway para usar S3/R2 direto.
 */
import { ENV } from './_core/env';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}
function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

// ─── Manus Forge mode ────────────────────────────────────────────────────────

async function manusPut(relKey: string, data: Buffer | Uint8Array | string, contentType: string): Promise<{ key: string; url: string }> {
  const baseUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) throw new Error("Manus storage not configured: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
  const key = normalizeKey(relKey);
  const uploadUrl = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set("path", key);
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, { method: "POST", headers: buildAuthHeaders(apiKey), body: form });
  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status}): ${msg}`);
  }
  return { key, url: (await response.json()).url };
}

async function manusGet(relKey: string): Promise<{ key: string; url: string }> {
  const baseUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) throw new Error("Manus storage not configured");
  const key = normalizeKey(relKey);
  const dlUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  dlUrl.searchParams.set("path", key);
  const r = await fetch(dlUrl, { method: "GET", headers: buildAuthHeaders(apiKey) });
  return { key, url: (await r.json()).url };
}

// ─── S3 / Cloudflare R2 mode ─────────────────────────────────────────────────

function getS3Client(): S3Client {
  return new S3Client({
    region: ENV.s3Region || "auto",
    endpoint: ENV.s3Endpoint || undefined,
    credentials: { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey },
    forcePathStyle: !!ENV.s3Endpoint,
  });
}

async function s3Put(relKey: string, data: Buffer | Uint8Array | string, contentType: string): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as any);
  await client.send(new PutObjectCommand({ Bucket: ENV.s3Bucket, Key: key, Body: body, ContentType: contentType }));
  const publicUrl = ENV.s3PublicUrl
    ? `${ENV.s3PublicUrl.replace(/\/+$/, "")}/${key}`
    : `https://${ENV.s3Bucket}.s3.${ENV.s3Region}.amazonaws.com/${key}`;
  return { key, url: publicUrl };
}

async function s3Get(relKey: string, expiresIn = 3600): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }), { expiresIn });
  return { key, url };
}

// ─── Exports públicos ─────────────────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (ENV.storageType === "s3") return s3Put(relKey, data, contentType);
  return manusPut(relKey, data, contentType);
}

export async function storageGet(relKey: string, expiresIn = 3600): Promise<{ key: string; url: string }> {
  if (ENV.storageType === "s3") return s3Get(relKey, expiresIn);
  return manusGet(relKey);
}
