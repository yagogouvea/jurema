import { z } from "zod";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { publicProcedure, router } from "../\_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { adminUsers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const ADMIN_JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "jumera-admin-secret-2026"
);
const ADMIN_COOKIE = "jumera_admin_token";

export const adminAuthRouter = router({
  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Query usando Drizzle ORM
      const admin = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.username, input.username))
        .limit(1)
        .then((rows) => rows[0]);
      if (!admin) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas" });

      const valid = await bcrypt.compare(input.password, admin.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas" });

      const token = await new SignJWT({ 
        id: admin.id, 
        username: admin.username, 
        name: admin.name 
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("7d")
        .sign(ADMIN_JWT_SECRET);

      ctx.res.cookie(ADMIN_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return { success: true, name: admin.name };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.req.cookies?.[ADMIN_COOKIE];
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, ADMIN_JWT_SECRET);
      return { 
        id: payload.id as number, 
        username: payload.username as string, 
        name: payload.name as string 
      };
    } catch {
      return null;
    }
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(ADMIN_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
    return { success: true };
  }),
});

export const ADMIN_COOKIE_NAME = ADMIN_COOKIE;
export { ADMIN_JWT_SECRET };
export type { AdminUser } from "../../drizzle/schema";
