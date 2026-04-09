import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Request, Response } from "express";

const PDV_COOKIE = "pdv_token";
const PDV_SALT = "pdv_salt_jumera";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + PDV_SALT).digest("hex");
}

async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return mysql.createConnection(url);
}

async function createPdvToken(seller: { id: number; name: string; username: string; role: string }) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || "pdv_jwt_secret_fallback");
  return new SignJWT({ 
    sellerId: seller.id, 
    name: seller.name, 
    username: seller.username, 
    role: seller.role 
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifyPdvToken(req: Request): Promise<{ sellerId: number; name: string; username: string; role: string } | null> {
  try {
    const cookieHeader = req.headers.cookie || "";
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach(part => {
      const [k, ...v] = part.trim().split("=");
      if (k) cookies[k.trim()] = decodeURIComponent(v.join("="));
    });
    const token = cookies[PDV_COOKIE];
    if (!token) return null;
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "pdv_jwt_secret_fallback");
    const { payload } = await jwtVerify(token, secret);
    return payload as { sellerId: number; name: string; username: string; role: string };
  } catch {
    return null;
  }
}

export const pdvAuthRouter = router({
  login: publicProcedure
    .input(z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      
      try {
        const [rows] = await db.execute(
          "SELECT id, name, username, passwordHash, role, isActive FROM pdv_sellers WHERE username = ?",
          [input.username.toLowerCase()]
        );
        await db.end();
        
        const sellers = rows as any[];
        if (sellers.length === 0) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }
        
        const seller = sellers[0];
        if (!seller.isActive) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Usuário inativo" });
        }
        
        const expectedHash = hashPassword(input.password);
        if (seller.passwordHash !== expectedHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }
        
        const token = await createPdvToken(seller);
        const res = ctx.res as Response;
        res.cookie(PDV_COOKIE, token, {
          httpOnly: true,
          sameSite: "lax",
          maxAge: 8 * 60 * 60 * 1000, // 8 hours
          path: "/",
        });
        
        return {
          success: true,
          seller: {
            id: seller.id,
            name: seller.name,
            username: seller.username,
            role: seller.role,
          },
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao fazer login" });
      }
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    const req = ctx.req as Request;
    const seller = await verifyPdvToken(req);
    if (!seller) return null;
    return seller;
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const res = ctx.res as Response;
    res.clearCookie(PDV_COOKIE, { path: "/" });
    return { success: true };
  }),
});
