import { Express, Request, Response } from "express";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export function registerUploadRoutes(app: Express) {
  // Handle multipart file uploads for product images
  app.post("/api/upload", async (req: Request, res: Response) => {
    try {
      // Check auth via cookie - simplified check
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        const body = Buffer.concat(chunks);
        const contentType = req.headers["content-type"] || "image/jpeg";
        const filename = (req.headers["x-filename"] as string) || "image.jpg";
        const key = `products/${nanoid()}-${filename}`;

        try {
          const { url } = await storagePut(key, body, contentType);
          res.json({ url, key });
        } catch (err) {
          console.error("Upload error:", err);
          res.status(500).json({ error: "Upload failed" });
        }
      });
    } catch (err) {
      res.status(500).json({ error: "Upload failed" });
    }
  });
}
