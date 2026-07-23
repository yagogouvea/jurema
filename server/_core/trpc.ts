import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TrpcContext } from "./context";

function formatZodMessage(err: ZodError): string {
  const msgs = err.issues
    .map((i) => (typeof i.message === "string" ? i.message.trim() : ""))
    .filter(Boolean);
  // Dedup preservando ordem
  return [...new Set(msgs)].join(" · ") || "Dados inválidos";
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    if (cause instanceof ZodError) {
      const message = formatZodMessage(cause);
      return {
        ...shape,
        message,
        data: {
          ...shape.data,
          zodError: cause.flatten(),
        },
      };
    }
    // Alguns clients/serializações colocam o array de issues em message
    if (typeof shape.message === "string" && shape.message.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(shape.message);
        if (Array.isArray(parsed) && parsed[0]?.message) {
          const message = [...new Set(parsed.map((i: any) => String(i.message || "")).filter(Boolean))].join(" · ");
          if (message) return { ...shape, message };
        }
      } catch {
        /* ignore */
      }
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
