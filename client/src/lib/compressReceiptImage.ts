/** Reduz foto de comprovante antes de gravar — evita LONGBLOB enorme no MySQL. */

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

export async function compressReceiptImage(file: File): Promise<{
  base64: string;
  mimeType: string;
  preview: string;
}> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Imagem deve ter no máximo 8MB");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não deu para ler a imagem"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Arquivo não é uma imagem válida"));
    el.src = dataUrl;
  });

  let { width, height } = img;
  if (width > MAX_EDGE || height > MAX_EDGE) {
    const scale = Math.min(MAX_EDGE / width, MAX_EDGE / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não deu para processar a imagem");
  ctx.drawImage(img, 0, 0, width, height);
  const preview = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = preview.split(",")[1] || "";
  if (!base64) throw new Error("Não deu para processar a imagem");
  return { base64, mimeType: "image/jpeg", preview };
}
