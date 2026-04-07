import { z } from "zod";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";

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

      // Query raw SQL via Drizzle
      const result: any = await (db as any).execute(
        (db as any).raw`SELECT * FROM admin_users WHERE username = ${input.username} LIMIT 1`
      );
      const admin = result?.[0];
      if (!admin || !admin.password) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas" });

      let valid = false;
      try {
        valid = await bcrypt.compare(input.password, admin.password);
      } catch (err) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas" });
      }
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas" });

      const token = await new SignJWT({ 
        id: admin.id, 
        username: admin.username, 
        name: admin.name 
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("7d")
        .sign(ADMIN_JWT_SECRET);

      try {
        ctx.res.cookie(ADMIN_COOKIE, token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: "/",
        });
      } catch (err) {
        console.error("[Admin Auth] Cookie error:", err);
      }

      return { success: true, name: admin.name };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.req.cookies?.[ADMIN_COOKIE];
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, ADMIN_JWT_SECRET);
      return { id: payload.id, username: payload.username, name: payload.name };
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
