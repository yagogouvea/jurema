import { getDb } from "../db-connect";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { customers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const CUSTOMER_COOKIE = "jumera_customer_token";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "jumera-secret-key-2026");

export async function getCustomerFromRequest(req: { headers: Record<string, string | string[] | undefined>; cookies?: Record<string, string> }) {
  try {
    const cookieHeader = req.headers?.cookie as string | undefined;
    if (!cookieHeader) return null;

    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((c) => {
      const [k, ...v] = c.trim().split("=");
      if (k) cookies[k.trim()] = decodeURIComponent(v.join("="));
    });

    const token = cookies[CUSTOMER_COOKIE];
    // Retorna null imediatamente se não houver cookie — evita query desnecessária no banco
    if (!token) return null;

    // Verifica o JWT antes de consultar o banco
    let payload: any;
    try {
      const result = await jwtVerify(token, JWT_SECRET);
      payload = result.payload;
    } catch {
      return null; // Token inválido — não consulta o banco
    }

    const db = await getDb();
    if (!db) return null;

    const result = await db.select().from(customers).where(eq(customers.id, payload.id as number)).limit(1);
    return result[0] ?? null;
  } catch {
    return null;
  }
}

function formatCPF(cpf: string) {
  return cpf.replace(/\D/g, "");
}

function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10 || check === 11) check = 0;
  if (check !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10 || check === 11) check = 0;
  return check === parseInt(digits[10]);
}

export const customerAuthRouter = router({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
        email: z.string().email("E-mail inválido"),
        cpf: z.string().min(11, "CPF inválido"),
        phone: z.string().min(10, "Telefone inválido"),
        password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
        confirmPassword: z.string(),
        addressZip: z.string().optional(),
        addressStreet: z.string().optional(),
        addressNumber: z.string().optional(),
        addressComplement: z.string().optional(),
        addressNeighborhood: z.string().optional(),
        addressCity: z.string().optional(),
        addressState: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.password !== input.confirmPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "As senhas não coincidem." });
      }

      const cpfDigits = formatCPF(input.cpf);
      if (!validateCPF(cpfDigits)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

      // Verificar email duplicado
      const existingEmail = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, input.email)).limit(1);
      if (existingEmail.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já está cadastrado." });
      }

      // Verificar CPF duplicado
      const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      const existingCPF = await db.select({ id: customers.id }).from(customers).where(eq(customers.cpf, cpfFormatted)).limit(1);
      if (existingCPF.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Este CPF já está cadastrado." });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);

      const [result] = await db.insert(customers).values({
        name: input.name,
        email: input.email,
        cpf: cpfFormatted,
        phone: input.phone,
        passwordHash,
        addressZip: input.addressZip,
        addressStreet: input.addressStreet,
        addressNumber: input.addressNumber,
        addressComplement: input.addressComplement,
        addressNeighborhood: input.addressNeighborhood,
        addressCity: input.addressCity,
        addressState: input.addressState,
      });

      const customerId = (result as any).insertId as number;

      // Gerar token JWT
      const token = await new SignJWT({ id: customerId, email: input.email })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(JWT_SECRET);

      // Setar cookie
      ctx.res.cookie(CUSTOMER_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return {
        success: true,
        customer: {
          id: customerId,
          name: input.name,
          email: input.email,
          cpf: cpfFormatted,
          phone: input.phone,
        },
      };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email("E-mail inválido"),
        password: z.string().min(1, "Senha obrigatória"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

      const result = await db.select().from(customers).where(eq(customers.email, input.email)).limit(1);
      const customer = result[0];

      if (!customer) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
      }

      const passwordMatch = await bcrypt.compare(input.password, customer.passwordHash);
      if (!passwordMatch) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
      }

      const token = await new SignJWT({ id: customer.id, email: customer.email })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(JWT_SECRET);

      ctx.res.cookie(CUSTOMER_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return {
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          cpf: customer.cpf,
          phone: customer.phone,
          addressZip: customer.addressZip,
          addressStreet: customer.addressStreet,
          addressNumber: customer.addressNumber,
          addressComplement: customer.addressComplement,
          addressNeighborhood: customer.addressNeighborhood,
          addressCity: customer.addressCity,
          addressState: customer.addressState,
        },
      };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    const customer = await getCustomerFromRequest(ctx.req as any);
    if (!customer) return null;
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      cpf: customer.cpf,
      phone: customer.phone,
      addressZip: customer.addressZip,
      addressStreet: customer.addressStreet,
      addressNumber: customer.addressNumber,
      addressComplement: customer.addressComplement,
      addressNeighborhood: customer.addressNeighborhood,
      addressCity: customer.addressCity,
      addressState: customer.addressState,
    };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(CUSTOMER_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
    return { success: true };
  }),
});
