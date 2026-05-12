import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Request, Response } from "express";
import { getSessionCookieOptions } from "../_core/cookies";
import { createPdvMysqlConnection } from "../pdvMysql";

const PDV_COOKIE = "pdv_token";
const PDV_SALT = "pdv_salt_jumera";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + PDV_SALT).digest("hex");
}

async function getDb() {
  return createPdvMysqlConnection();
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
  const cookieHeader = req.headers.cookie || "";
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(v.join("="));
  });
  const authHeader = req.headers.authorization?.trim() ?? "";
  const bearer =
    authHeader.length > 0 && /^bearer\s+/i.test(authHeader)
      ? authHeader.replace(/^bearer\s+/i, "").trim()
      : "";
  // Bearer primeiro: localStorage costuma ser o JWT atual; cookie antigo não deve bloquear.
  const cookieTok = cookies[PDV_COOKIE];
  const tryTokens = [...(bearer ? [bearer] : []), ...(cookieTok && cookieTok !== bearer ? [cookieTok] : [])];
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || "pdv_jwt_secret_fallback");
  for (const t of tryTokens) {
    if (!t?.length) continue;
    try {
      const { payload } = await jwtVerify(t, secret);
      return payload as { sellerId: number; name: string; username: string; role: string };
    } catch {
      /* tenta próximo */
    }
  }
  return null;
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
        // Normaliza o username para lowercase antes de comparar (case-insensitive)
        const normalizedUsername = input.username.trim().toLowerCase();
        const [rows] = await db.execute(
          "SELECT id, name, username, passwordHash, role, isActive FROM pdv_sellers WHERE LOWER(username) = ?",
          [normalizedUsername]
        );
        await db.end();
        
        const sellers = rows as any[];
        if (sellers.length === 0) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[pdvAuth.login] usuário não encontrado:", normalizedUsername);
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }

        const seller = sellers[0];
        if (!seller.isActive) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Usuário inativo" });
        }

        const expectedHash = hashPassword(input.password);
        if (seller.passwordHash !== expectedHash) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[pdvAuth.login] senha incorreta para usuário:", normalizedUsername);
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }
        
        const token = await createPdvToken(seller);
        const req = ctx.req as Request;
        const res = ctx.res as Response;
        const cookieOpts = getSessionCookieOptions(req);
        res.cookie(PDV_COOKIE, token, {
          ...cookieOpts,
          maxAge: 8 * 60 * 60 * 1000, // 8 hours
        });
        
        return {
          success: true,
          token, // JWT para o frontend salvar no localStorage e enviar via Authorization header
          seller: {
            id: seller.id,
            name: seller.name,
            username: seller.username,
            role: seller.role,
          },
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (process.env.NODE_ENV === "development") {
          console.error("[pdvAuth.login] erro de banco/rede:", err);
        }
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
    const req = ctx.req as Request;
    const res = ctx.res as Response;
    const cookieOpts = getSessionCookieOptions(req);
    res.clearCookie(PDV_COOKIE, { ...cookieOpts, maxAge: -1 });
    return { success: true };
  }),
});
