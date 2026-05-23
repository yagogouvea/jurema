/** Valida buffer de imagem Sofia (JPEG/PNG/WebP) antes de gravar ou servir. */

const MIN_BYTES = 256;

export function detectSofiaImageMime(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (!buf || buf.length < MIN_BYTES) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function isValidSofiaPhotoBuffer(buf: Buffer): boolean {
  return detectSofiaImageMime(buf) !== null;
}

export function invalidSofiaPhotoMessage(sizeBytes: number): string {
  if (sizeBytes > 0 && sizeBytes < MIN_BYTES) {
    return `Imagem inválida ou corrompida (${sizeBytes} bytes). Selecione a foto novamente.`;
  }
  return "Arquivo não é uma imagem JPEG, PNG ou WebP válida (mín. 256 bytes).";
}
