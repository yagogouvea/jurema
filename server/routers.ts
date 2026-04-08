import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import { customerAuthRouter } from "./routers/customerAuth";
import { adminAuthRouter, ADMIN_COOKIE_NAME, ADMIN_JWT_SECRET } from "./routers/adminAuth";
import {
  getProducts, getProductBySlug, getProductById, createProduct, updateProduct, deleteProduct,
  createOrder, getOrders, getOrderById, updateOrderStatus, getDashboardStats,
  getActiveBanners, getAllBanners, createBanner, updateBanner, deleteBanner,
  getAllSettings, setSetting,
} from "./db";
import { getDb } from "./db";
import { sql, and, eq, ne } from "drizzle-orm";
import { products } from "../drizzle/schema";
import { jwtVerify } from "jose";

// Admin guard middleware usando JWT local (independente do Manus OAuth)
const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const cookieHeader = ctx.req.headers.cookie || "";
  const cookies = cookieHeader.split("; ").reduce((acc: Record<string, string>, c: string) => {
    const [k, v] = c.split("=");
    if (k) acc[k.trim()] = decodeURIComponent(v || "");
    return acc;
  }, {});
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Acesso restrito: faça login como administrador." });
  }
  try {
    await jwtVerify(token, ADMIN_JWT_SECRET);
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão expirada. Faça login novamente." });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  customerAuth: customerAuthRouter,
  adminAuth: adminAuthRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Products ───────────────────────────────────────────────────────────────
  products: router({
    list: publicProcedure
      .input(z.object({
        category: z.string().optional(),
        gender: z.string().optional(),
        team: z.string().optional(),
        search: z.string().optional(),
        isFeatured: z.boolean().optional(),
        featuredSection: z.enum(['destaque', 'mais-vendidos', 'nova-colecao']).optional(),
        orderBy: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        return getProducts(input ?? {});
      }),

    bySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const product = await getProductBySlug(input.slug);
        if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado.' });
        return product;
      }),

    byId: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const product = await getProductById(input.id);
        if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
        return product;
      }),

    // Admin operations
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        description: z.string().optional(),
        price: z.string(),
        originalPrice: z.string().optional(),
        images: z.array(z.string()).default([]),
        team: z.string().optional(),
        category: z.enum(['1linha-nacional', 'tailandesa-promocao', 'conj-calor-nacional', 'conj-calor-tailandesa', 'tailandesa', 'infantil', 'jogador-tailandesa', 'retro-tailandesa', 'conj-frio-tailandes', 'tailandesa-3xl', 'tailandesa-4xl']).default('tailandesa'),
        gender: z.enum(['masculino', 'feminino', 'infantil']).default('masculino'),
        isActive: z.boolean().default(true),
        isFeatured: z.boolean().default(false),
        featuredSection: z.enum(['destaque', 'mais-vendidos', 'nova-colecao']).optional(),
        reference: z.string().optional(),
        stock: z.array(z.object({ size: z.string(), quantity: z.number() })).optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.isFeatured && input.featuredSection) {
          const db = await getDb();
          if (db) {
            const result = await db.select({ count: sql`count(*)` }).from(products).where(and(eq(products.isFeatured, true), eq(products.featuredSection, input.featuredSection as any)));
            const count = Number(result?.[0]?.count ?? 0);
            if (count >= 8) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: `Seção "${input.featuredSection}" já tem 8 produtos. Remova um para adicionar outro.` });
            }
          }
        }
        await createProduct(input as any);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        slug: z.string().optional(),
        description: z.string().optional(),
        price: z.string().optional(),
        originalPrice: z.string().optional().nullable(),
        images: z.array(z.string()).optional(),
        team: z.string().optional(),
        category: z.enum(['1linha-nacional', 'tailandesa-promocao', 'conj-calor-nacional', 'conj-calor-tailandesa', 'tailandesa', 'infantil', 'jogador-tailandesa', 'retro-tailandesa', 'conj-frio-tailandes', 'tailandesa-3xl', 'tailandesa-4xl']).optional(),
        gender: z.enum(['masculino', 'feminino', 'infantil']).optional(),
        isActive: z.boolean().optional(),
        isFeatured: z.boolean().optional(),
        featuredSection: z.enum(['destaque', 'mais-vendidos', 'nova-colecao']).optional(),
        reference: z.string().optional(),
        stock: z.array(z.object({ size: z.string(), quantity: z.number() })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        if (data.isFeatured && data.featuredSection) {
          const db = await getDb();
          if (db) {
            const result = await db.select({ count: sql`count(*)` }).from(products).where(and(eq(products.isFeatured, true), eq(products.featuredSection, data.featuredSection as any), ne(products.id, id)));
            const count = Number(result?.[0]?.count ?? 0);
            if (count >= 8) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: `Seção "${data.featuredSection}" já tem 8 produtos. Remova um para adicionar outro.` });
            }
          }
        }
        await updateProduct(id, data as any);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteProduct(input.id);
        return { success: true };
      }),
  }),

  // ─── Orders ─────────────────────────────────────────────────────────────────
  orders: router({
    create: publicProcedure
      .input(z.object({
        customerName: z.string().min(1),
        customerEmail: z.string().email(),
        customerPhone: z.string().optional(),
        addressStreet: z.string().optional(),
        addressNumber: z.string().optional(),
        addressComplement: z.string().optional(),
        addressNeighborhood: z.string().optional(),
        addressCity: z.string().optional(),
        addressState: z.string().optional(),
        addressZip: z.string().optional(),
        paymentMethod: z.enum(['pix', 'credit_card', 'boleto']),
        subtotal: z.string(),
        shippingCost: z.string().default('0'),
        total: z.string(),
        items: z.array(z.object({
          productId: z.number(),
          productName: z.string(),
          productImage: z.string().optional(),
          size: z.string(),
          quantity: z.number().min(1),
          unitPrice: z.string(),
          total: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        const orderNumber = `JS${Date.now().toString().slice(-8)}`;
        const orderId = await createOrder({ ...input, orderNumber });
        // Notify owner
        try {
          await notifyOwner({
            title: `🛒 Novo Pedido #${orderNumber}`,
            content: `Cliente: ${input.customerName}\nEmail: ${input.customerEmail}\nTotal: R$ ${input.total}\nPagamento: ${input.paymentMethod}\nItens: ${input.items.length}\nCidade: ${input.addressCity || 'N/A'}/${input.addressState || 'N/A'}`,
          });
        } catch (e) {
          console.error('Failed to notify owner:', e);
        }
        return { orderNumber, orderId };
      }),

    list: adminProcedure
      .input(z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional())
      .query(async ({ input }) => {
        return getOrders(input ?? {});
      }),

    byId: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const order = await getOrderById(input.id);
        if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
        return order;
      }),

    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
        paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
      }))
      .mutation(async ({ input }) => {
        await updateOrderStatus(input.id, input.status, input.paymentStatus);
        return { success: true };
      }),
  }),

  // ─── Banners ────────────────────────────────────────────────────────────────
  banners: router({
    list: publicProcedure.query(async () => {
      return getActiveBanners();
    }),

    listAll: adminProcedure.query(async () => {
      return getAllBanners();
    }),

    create: adminProcedure
      .input(z.object({
        title: z.string().min(1),
        subtitle: z.string().optional(),
        imageUrl: z.string().min(1),
        linkUrl: z.string().optional(),
        buttonText: z.string().optional(),
        isActive: z.boolean().default(true),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        await createBanner(input as any);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        subtitle: z.string().optional(),
        imageUrl: z.string().optional(),
        linkUrl: z.string().optional(),
        buttonText: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateBanner(id, data as any);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteBanner(input.id);
        return { success: true };
      }),

    generateWithAI: adminProcedure
      .input(z.object({
        description: z.string().min(5),
        title: z.string().min(1),
        subtitle: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const prompt = `Create a professional sports e-commerce banner for a football jersey store called "Jumera Sport". 
Style: Dark background (#0D0D0D), red accents (#C8102E), modern sports aesthetic.
Content: ${input.description}
The banner should be visually striking with dynamic composition, suitable for a hero carousel.
Wide format, high energy, professional quality.`;

        const { url } = await generateImage({ prompt });

        // Upload to S3
        let finalUrl: string = url ?? '';
        try {
          if (!finalUrl) throw new Error('No image URL');
          const response = await fetch(finalUrl);
          const buffer = Buffer.from(await response.arrayBuffer());
          const { url: s3Url } = await storagePut(`banners/ai-${Date.now()}.png`, buffer, 'image/png');
          finalUrl = s3Url;
        } catch (e) {
          console.error('Failed to upload banner to S3:', e);
        }

        return {
          imageUrl: finalUrl,
          title: input.title,
          subtitle: input.subtitle || '',
        };
      }),
  }),

  // ─── Settings ────────────────────────────────────────────────────────────────
  settings: router({
    getAll: publicProcedure.query(async () => {
      return getAllSettings();
    }),

    setMany: adminProcedure
      .input(z.array(z.object({ key: z.string(), value: z.string() })))
      .mutation(async ({ input }) => {
        for (const { key, value } of input) {
          await setSetting(key, value);
        }
        return { success: true };
      }),
  }),

  // ─── Dashboard ───────────────────────────────────────────────────────────────
  dashboard: router({
    stats: adminProcedure.query(async () => {
      return getDashboardStats();
    }),
  }),

  // ─── Payment (Mercado Pago) ──────────────────────────────────────────────────
  payment: router({
    createPreference: publicProcedure
      .input(z.object({
        orderId: z.number(),
        items: z.array(z.object({
          title: z.string(),
          quantity: z.number(),
          unit_price: z.number(),
        })),
        payer: z.object({ name: z.string(), email: z.string() }),
        paymentMethod: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const settings = await getAllSettings();
        const accessToken = settings.mp_access_token;

        if (!accessToken || accessToken.length < 10) {
          return { init_point: null, message: 'Mercado Pago não configurado. Configure o Access Token no painel admin.' };
        }

        try {
          const mpUrl = 'https://api.mercadopago.com/checkout/preferences';
          const response = await fetch(mpUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              items: input.items.map(item => ({
                title: item.title,
                quantity: item.quantity,
                unit_price: item.unit_price,
                currency_id: 'BRL',
              })),
              payer: { name: input.payer.name, email: input.payer.email },
              external_reference: String(input.orderId),
              back_urls: {
                success: 'https://jumera-sport.manus.space/pedido/confirmacao',
                failure: 'https://jumera-sport.manus.space/checkout',
                pending: 'https://jumera-sport.manus.space/pedido/confirmacao',
              },
              auto_return: 'approved',
            }),
          });

          if (!response.ok) {
            const err = await response.text();
            console.error('MP Error:', err);
            return { init_point: null, message: 'Erro ao criar preferência de pagamento.' };
          }

          const data = await response.json();
          return { init_point: data.init_point, id: data.id };
        } catch (e) {
          console.error('MP exception:', e);
          return { init_point: null, message: 'Erro na integração com Mercado Pago.' };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
