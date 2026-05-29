/**
 * Gera PDF a partir de docs/arquitetura-whatsapp-ia.html
 * Uso: node scripts/generate-wa-architecture-pdf.mjs
 *
 * Tenta Playwright; se indisponível, usa Chrome/Edge headless (Windows).
 */
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "docs", "arquitetura-whatsapp-ia.html");
const pdfPath = path.join(root, "docs", "arquitetura-whatsapp-ia.pdf");

if (!fs.existsSync(htmlPath)) {
  console.error("HTML não encontrado:", htmlPath);
  process.exit(1);
}

const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;

function chromeCandidates() {
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const pfx = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  return [
    path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pfx, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(pfx, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter((p) => fs.existsSync(p));
}

async function viaPlaywright() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", bottom: "14mm", left: "14mm", right: "14mm" },
  });
  await browser.close();
}

function viaChrome() {
  const bin = chromeCandidates()[0];
  if (!bin) throw new Error("Chrome/Edge não encontrado");
  execFileSync(bin, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ], { stdio: "inherit" });
}

try {
  await viaPlaywright();
} catch {
  viaChrome();
}

if (!fs.existsSync(pdfPath)) {
  console.error("Falha ao gerar PDF");
  process.exit(1);
}
console.log("PDF gerado:", pdfPath);
