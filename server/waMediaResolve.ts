/**
 * Resolução de URLs de mídia WhatsApp (storage Manus / presign).
 * Compartilhado entre waRouter (webhook + tRPC) e waMessageMediaRoute (proxy PDV).
 */

/** URL pública no mesmo host do PDV — redireciona para presign do storage (cookie de sessão não exigido). */
export function manusStoragePublicPath(relKey: string): string {
  const norm = relKey.replace(/^\/+/, "");
  return "/manus-storage/" + norm.split("/").map(encodeURIComponent).join("/");
}

/**
 * Devolve URL HTTP atualizada para exibir mídia no painel (presign do storage).
 * @param mediaStorageKey — chave persistida (ex.: `wa-media/1/abc.jpg`); preferida quando presente.
 * @param mediaUrl — proxy `/manus-storage/...`, URL https legada, etc.
 */
export async function resolveStoredMediaToViewUrl(
  mediaUrl: string | null | undefined,
  mediaStorageKey?: string | null | undefined
): Promise<string | null> {
  const keyDirect = mediaStorageKey && String(mediaStorageKey).trim();
  if (keyDirect) {
    try {
      const { storageGet } = await import("./storage");
      const { url } = await storageGet(keyDirect);
      return url;
    } catch (e) {
      console.warn(`[resolveStoredMedia] storageGet("${keyDirect}") falhou:`, e);
    }
  }

  const s = mediaUrl && String(mediaUrl).trim();
  if (!s) return null;
  if (s.startsWith("/manus-storage/")) {
    const enc = s.slice("/manus-storage/".length);
    const key = enc.split("/").map((p) => decodeURIComponent(p)).join("/");
    const { storageGet } = await import("./storage");
    const { url } = await storageGet(key);
    return url;
  }
  const m = s.match(/(wa-media\/\d+\/[^?\s#'"]+)/i);
  if (m) {
    try {
      const { storageGet } = await import("./storage");
      const { url } = await storageGet(m[1]);
      return url;
    } catch {
      /* segue para passthrough */
    }
  }
  if (/^https?:\/\//i.test(s)) return s;
  return s;
}
