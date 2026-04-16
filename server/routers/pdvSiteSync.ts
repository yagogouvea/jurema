/**
 * pdvSiteSync.ts
 * Router de integração PDV → Site (catálogo unificado)
 *
 * Fluxo: PDV é a fonte de verdade. O site é apenas vitrine (somente leitura).
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import mysql from "mysql2/promise";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import { verifyPdvToken } from "./pdvAuth";

// ─── helpers de autenticação PDV ─────────────────────────────────────

async function requirePdvAuth(ctx: any) {
  const req = ctx.req as import("express").Request;
  const seller = await verifyPdvToken(req);
  if (!seller) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login no PDV" });
  return seller;
}

async function requirePdvAdmin(ctx: any) {
  const seller = await requirePdvAuth(ctx);
  if (seller.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador" });
  return seller;
}

// ─── helpers de banco ────────────────────────────────────────────────────────

async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DATABASE_URL not set" });
  return mysql.createConnection(url);
}

async function dbExecute(sql: string, params?: any[]): Promise<any[]> {
  const conn = await getDb();
  try {
    const [rows] = await conn.execute(sql, params);
    return rows as any[];
  } finally {
    await conn.end();
  }
}

async function dbRun(sql: string, params?: any[]): Promise<any> {
  const conn = await getDb();
  try {
    const [result] = await conn.execute(sql, params);
    return result;
  } finally {
    await conn.end();
  }
}

// ─── helpers de produto ──────────────────────────────────────────────────────

function extractCodigoBase(codigo: string): string {
  if (!codigo) return codigo;
  const parts = codigo.split("-");
  if (parts.length <= 2) return codigo;
  return parts.slice(0, -1).join("-");
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 200);
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  const rows = await dbExecute(
    `SELECT slug FROM products WHERE slug LIKE ?`,
    [`${baseSlug}%`]
  );
  const existing = new Set(rows.map((r: any) => r.slug));
  if (!existing.has(baseSlug)) return baseSlug;
  let i = 2;
  while (existing.has(`${baseSlug}-${i}`)) i++;
  return `${baseSlug}-${i}`;
}

// ─── router ─────────────────────────────────────────────────────────────────

export const pdvSiteSyncRouter = router({

  /**
   * Importa todos os produtos do PDV para o catálogo do site.
   * Agrupa por código base (modelo), cria um produto por modelo,
   * com variantes de tamanho em product_stock.
   * Produtos importados ficam DESATIVADOS por padrão.
   */
  importSiteProducts: publicProcedure
    .input(z.object({
      clearExisting: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const pdvRows = await dbExecute(
        `SELECT codigo, linha, modelo, time, descricao, tamanho, tipo,
                estoque, precoAtacado, precoVarejo, isActive, fotoUrl, temporada,
                ptAtacado, ptVarejo
         FROM pdv_products
         WHERE isActive = 1
         ORDER BY codigo`
      );

      if (!pdvRows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum produto ativo no PDV" });
      }

      // Agrupar por código base
      const groups = new Map<string, {
        codigoBase: string;
        linha: string;
        modelo: string;
        time: string;
        descricao: string;
        tipo: string;
        precoAtacado: number;
        precoVarejo: number;
        fotoUrl: string | null;
        temporada: string | null;
        variants: Array<{ tamanho: string; estoque: number; codigo: string }>;
      }>();

      for (const row of pdvRows) {
        const codigoBase = row.codigo
          ? extractCodigoBase(row.codigo)
          : `${row.time}-${row.modelo}`;

        if (!groups.has(codigoBase)) {
          groups.set(codigoBase, {
            codigoBase,
            linha: row.linha || "",
            modelo: row.modelo || "",
            time: row.time || "",
            descricao: row.descricao || "",
            tipo: row.tipo || "CAMISETA",
            precoAtacado: parseFloat(row.precoAtacado) || 0,
            precoVarejo: parseFloat(row.precoVarejo) || 0,
            fotoUrl: row.fotoUrl || null,
            temporada: row.temporada || null,
            variants: [],
          });
        }
        const group = groups.get(codigoBase)!;
        group.variants.push({
          tamanho: row.tamanho,
          estoque: row.estoque || 0,
          codigo: row.codigo || "",
        });
        if (parseFloat(row.precoAtacado) > group.precoAtacado) {
          group.precoAtacado = parseFloat(row.precoAtacado);
        }
        if (parseFloat(row.precoVarejo) > group.precoVarejo) {
          group.precoVarejo = parseFloat(row.precoVarejo);
        }
        if (!group.fotoUrl && row.fotoUrl) {
          group.fotoUrl = row.fotoUrl;
        }
      }

      if (input.clearExisting) {
        // Limpa todos os produtos do site (tanto pdvSynced=1 quanto antigos fictícios pdvSynced=0)
        await dbRun(`DELETE FROM product_stock`);
        await dbRun(`DELETE FROM products`);
      }

      const existingRows = await dbExecute(
        `SELECT id, pdvCodigoBase FROM products WHERE pdvSynced = 1`
      );
      const existingMap = new Map<string, number>(
        existingRows.map((r: any) => [r.pdvCodigoBase as string, r.id as number])
      );

      let created = 0;
      let updated = 0;
      let errors = 0;

      for (const [codigoBase, group] of Array.from(groups.entries())) {
        try {
          const productName = [group.time, group.modelo, group.descricao]
            .filter(Boolean)
            .join(" - ") || codigoBase;

          const images = group.fotoUrl ? [group.fotoUrl] : [];

          if (existingMap.has(codigoBase)) {
            const productId = existingMap.get(codigoBase)!;
            await dbRun(
              `UPDATE products SET
                name = ?, price = ?, originalPrice = ?, images = ?,
                team = ?, reference = ?, updatedAt = NOW()
               WHERE id = ?`,
              [
                productName,
                group.precoVarejo,
                group.precoAtacado,
                JSON.stringify(images),
                group.time || null,
                codigoBase,
                productId,
              ]
            );
            await dbRun(`DELETE FROM product_stock WHERE productId = ?`, [productId]);
            for (const v of group.variants) {
              await dbRun(
                `INSERT INTO product_stock (productId, size, quantity) VALUES (?, ?, ?)`,
                [productId, v.tamanho, v.estoque]
              );
            }
            updated++;
          } else {
            const baseSlug = generateSlug(productName);
            const slug = await ensureUniqueSlug(baseSlug);

            const result = await dbRun(
              `INSERT INTO products
                (name, slug, description, price, originalPrice, images, team,
                 category, gender, subcategory, isActive, isFeatured,
                 reference, salesCount, pdvCodigoBase, pdvSynced, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'tailandesa', 'masculino', ?, 0, 0, ?, 0, ?, 1, NOW(), NOW())`,
              [
                productName,
                slug,
                [group.linha, group.modelo, group.descricao, group.tipo].filter(Boolean).join(" | "),
                group.precoVarejo,
                group.precoAtacado,
                JSON.stringify(images),
                group.time || null,
                group.time || null,
                codigoBase,
                codigoBase,
              ]
            );

            const productId = result.insertId;
            for (const v of group.variants) {
              await dbRun(
                `INSERT INTO product_stock (productId, size, quantity) VALUES (?, ?, ?)`,
                [productId, v.tamanho, v.estoque]
              );
            }
            created++;
          }
        } catch (err) {
          console.error(`[pdvSiteSync] Error importing ${codigoBase}:`, err);
          errors++;
        }
      }

      return {
        success: true,
        totalGroups: groups.size,
        created,
        updated,
        errors,
        message: `Importação concluída: ${created} criados, ${updated} atualizados, ${errors} erros`,
      };
    }),

  /**
   * Lista produtos do site (apenas os sincronizados do PDV)
   */
  listSiteProducts: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      isActive: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
      isNewProduct: z.boolean().optional(),
      featuredSection: z.enum(["destaque", "mais-vendidos", "nova-colecao"]).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(30),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const offset = (input.page - 1) * input.pageSize;
      const conditions: string[] = ["p.pdvSynced = 1"];
      const params: any[] = [];

      if (input.search) {
        conditions.push("(p.name LIKE ? OR p.reference LIKE ? OR p.team LIKE ? OR p.pdvCodigoBase LIKE ?)");
        const s = `%${input.search}%`;
        params.push(s, s, s, s);
      }
      if (input.isActive !== undefined) {
        conditions.push("p.isActive = ?");
        params.push(input.isActive ? 1 : 0);
      }
      if (input.isFeatured !== undefined) {
        conditions.push("p.isFeatured = ?");
        params.push(input.isFeatured ? 1 : 0);
      }
      if (input.isNewProduct !== undefined) {
        conditions.push("p.isNewProduct = ?");
        params.push(input.isNewProduct ? 1 : 0);
      }
      if (input.featuredSection) {
        conditions.push("p.featuredSection = ?");
        params.push(input.featuredSection);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;

      const countRows = await dbExecute(
        `SELECT COUNT(*) as total FROM products p ${where}`,
        params
      );
      const total = (countRows[0] as any)?.total || 0;

      const rows = await dbExecute(
        `SELECT p.id, p.name, p.slug, p.price, p.originalPrice, p.images,
                p.team, p.category, p.gender, p.isActive, p.isFeatured, p.featuredSection,
                p.reference, p.pdvCodigoBase, p.salesCount, p.isNewProduct,
                (SELECT SUM(ps.quantity) FROM product_stock ps WHERE ps.productId = p.id) as totalStock,
                (SELECT GROUP_CONCAT(CONCAT(ps.size, ':', ps.quantity) ORDER BY ps.size SEPARATOR ',')
                 FROM product_stock ps WHERE ps.productId = p.id) as stockDetails
         FROM products p ${where}
         ORDER BY p.isNewProduct DESC, p.createdAt DESC
         LIMIT ${input.pageSize} OFFSET ${offset}`,
        params
      );

      return {
        items: rows.map((r: any) => ({
          ...r,
          images: typeof r.images === "string" ? JSON.parse(r.images) : (r.images || []),
          isActive: Boolean(r.isActive),
          isFeatured: Boolean(r.isFeatured),
          isNewProduct: Boolean(r.isNewProduct),
          totalStock: r.totalStock || 0,
          stockDetails: r.stockDetails || "",
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  /**
   * Atualiza campos do produto no site
   */
  updateSiteProduct: publicProcedure
    .input(z.object({
      productId: z.number().int(),
      isActive: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
      featuredSection: z.enum(["destaque", "mais-vendidos", "nova-colecao"]).nullable().optional(),
      category: z.string().optional(),
      gender: z.enum(["masculino", "feminino", "infantil"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const sets: string[] = [];
      const params: any[] = [];

      if (input.isActive !== undefined) { sets.push("isActive = ?"); params.push(input.isActive ? 1 : 0); }
      if (input.isFeatured !== undefined) { sets.push("isFeatured = ?"); params.push(input.isFeatured ? 1 : 0); }
      if (input.featuredSection !== undefined) { sets.push("featuredSection = ?"); params.push(input.featuredSection); }
      if (input.category !== undefined) { sets.push("category = ?"); params.push(input.category); }
      if (input.gender !== undefined) { sets.push("gender = ?"); params.push(input.gender); }

      if (!sets.length) return { success: true };

      // Limpa o badge "NOVO" ao editar pela primeira vez
      sets.push("isNewProduct = 0");
      sets.push("updatedAt = NOW()");
      params.push(input.productId);

      await dbRun(
        `UPDATE products SET ${sets.join(", ")} WHERE id = ?`,
        params
      );

      return { success: true };
    }),

  /**
   * Upload de foto via S3 — atualiza fotoUrl no PDV e no site
   */
  uploadProductPhoto: publicProcedure
    .input(z.object({
      codigoBase: z.string(),
      imageBase64: z.string(),
      fileName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const matches = input.imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de imagem inválido" });

      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      const ext = mimeType.split("/")[1] || "jpg";
      const suffix = Date.now().toString(36);
      const fileKey = `products/${input.codigoBase}-${suffix}.${ext}`;

      const { url } = await storagePut(fileKey, buffer, mimeType);

      await dbRun(
        `UPDATE pdv_products SET fotoUrl = ? WHERE codigo LIKE ?`,
        [url, `${input.codigoBase}%`]
      );

      // Limpa badge "NOVO" e atualiza imagem
      await dbRun(
        `UPDATE products SET images = ?, isNewProduct = 0, updatedAt = NOW() WHERE pdvCodigoBase = ? AND pdvSynced = 1`,
        [JSON.stringify([url]), input.codigoBase]
      );

      return { success: true, url };
    }),

  /**
   * Sincroniza estoque do PDV para o site
   */
  syncStockFromPdv: publicProcedure
    .mutation(async ({ ctx }) => {
      await requirePdvAdmin(ctx);
      const siteProducts = await dbExecute(
        `SELECT id, pdvCodigoBase FROM products WHERE pdvSynced = 1 AND pdvCodigoBase IS NOT NULL`
      );

      let synced = 0;
      for (const sp of siteProducts) {
        const pdvVariants = await dbExecute(
          `SELECT tamanho, estoque FROM pdv_products WHERE codigo LIKE ? AND isActive = 1`,
          [`${sp.pdvCodigoBase}%`]
        );

        if (!pdvVariants.length) continue;

        for (const v of pdvVariants) {
          await dbRun(
            `UPDATE product_stock SET quantity = ?, updatedAt = NOW()
             WHERE productId = ? AND size = ?`,
            [v.estoque, sp.id, v.tamanho]
          );
        }
        synced++;
      }

      return { success: true, synced, message: `${synced} produtos sincronizados` };
    }),

  /**
   * Estatísticas para o painel
   */
  getSiteStats: publicProcedure
    .query(async ({ ctx }) => {
      await requirePdvAdmin(ctx);
      const rows = await dbExecute(
        `SELECT
          COUNT(*) as total,
          SUM(isActive = 1) as active,
          SUM(isActive = 0) as inactive,
          SUM(isFeatured = 1) as featured,
          SUM(featuredSection = 'destaque') as sectionDestaque,
          SUM(featuredSection = 'mais-vendidos') as sectionMaisVendidos,
          SUM(featuredSection = 'nova-colecao') as sectionNovaColecao
         FROM products WHERE pdvSynced = 1`
      );

      const r = (rows[0] as any) || {};
      return {
        total: r.total || 0,
        active: r.active || 0,
        inactive: r.inactive || 0,
        featured: r.featured || 0,
        sections: {
          destaque: r.sectionDestaque || 0,
          maisVendidos: r.sectionMaisVendidos || 0,
          novaColecao: r.sectionNovaColecao || 0,
        },
      };
    }),
});

// ─── Auto-sync: chamado automaticamente ao criar/atualizar produto no PDV ────

/**
 * Sincroniza um grupo de produtos PDV (mesmo código base) para o catálogo do site.
 * Cria o produto se não existir (isActive=false, isNewProduct=true).
 * Atualiza nome/preço/estoque se já existir, mas preserva isActive e isNewProduct.
 */
export async function autoSyncProductToSite(codigoBase: string): Promise<void> {
  try {
    // Buscar todas as variantes do produto no PDV
    const variants = await dbExecute(
      `SELECT codigo, linha, modelo, time, descricao, tamanho, tipo,
              estoque, precoAtacado, precoVarejo, fotoUrl
       FROM pdv_products
       WHERE codigo LIKE ? AND isActive = 1
       ORDER BY tamanho`,
      [`${codigoBase}-%`]
    );

    // Tentar também códigos exatos (sem hífen no final, ex: produto sem tamanho)
    const variantsExact = await dbExecute(
      `SELECT codigo, linha, modelo, time, descricao, tamanho, tipo,
              estoque, precoAtacado, precoVarejo, fotoUrl
       FROM pdv_products
       WHERE codigo = ? AND isActive = 1`,
      [codigoBase]
    );

    const allVariants = [...variants, ...variantsExact];
    if (allVariants.length === 0) return;

    const first = allVariants[0] as any;
    const productName = [first.time, first.modelo, first.descricao]
      .filter(Boolean).join(" - ") || codigoBase;
    const precoVarejo = Math.max(...allVariants.map((v: any) => parseFloat(v.precoVarejo) || 0));
    const precoAtacado = Math.max(...allVariants.map((v: any) => parseFloat(v.precoAtacado) || 0));
    const fotoUrl = allVariants.find((v: any) => v.fotoUrl)?.fotoUrl || null;
    const images = fotoUrl ? JSON.stringify([fotoUrl]) : JSON.stringify([]);

    // Verificar se já existe no site
    const existing = await dbExecute(
      `SELECT id FROM products WHERE pdvCodigoBase = ? AND pdvSynced = 1`,
      [codigoBase]
    );

    if (existing.length > 0) {
      // Atualiza nome, preço e imagem — preserva isActive e isNewProduct
      const productId = (existing[0] as any).id;
      await dbRun(
        `UPDATE products SET
           name = ?, price = ?, originalPrice = ?, images = ?,
           team = ?, updatedAt = NOW()
         WHERE id = ?`,
        [productName, precoVarejo, precoAtacado, images, first.time || null, productId]
      );

      // Atualizar estoque
      for (const v of allVariants as any[]) {
        await dbRun(
          `INSERT INTO product_stock (productId, size, quantity)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
          [productId, v.tamanho, v.estoque]
        );
      }
    } else {
      // Criar novo produto no site (inativo, marcado como novo)
      const baseSlug = generateSlug(productName);
      const slug = await ensureUniqueSlug(baseSlug);

      const result = await dbRun(
        `INSERT INTO products
           (name, slug, description, price, originalPrice, images, team,
            category, gender, subcategory, isActive, isFeatured,
            reference, salesCount, pdvCodigoBase, pdvSynced, isNewProduct, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'tailandesa', 'masculino', ?, 0, 0, ?, 0, ?, 1, 1, NOW(), NOW())`,
        [
          productName, slug,
          [first.linha, first.modelo, first.descricao, first.tipo].filter(Boolean).join(" | "),
          precoVarejo, precoAtacado, images,
          first.time || null,
          first.time || null,
          codigoBase, codigoBase,
        ]
      );

      const productId = (result as any).insertId;

      // Inserir estoque
      for (const v of allVariants as any[]) {
        await dbRun(
          `INSERT INTO product_stock (productId, size, quantity) VALUES (?, ?, ?)`,
          [productId, v.tamanho, v.estoque]
        );
      }

      console.log(`[AutoSync] Novo produto criado no site: ${codigoBase} → id=${productId}`);
    }
  } catch (err) {
    console.error(`[AutoSync] Erro ao sincronizar ${codigoBase}:`, err);
  }
}
