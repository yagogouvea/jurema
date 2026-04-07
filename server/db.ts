import { eq, and, like, desc, asc, sql, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, products, productStock, orders, orderItems, banners, storeSettings } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts(opts: {
  category?: string; gender?: string; team?: string; search?: string;
  isFeatured?: boolean; featuredSection?: string; orderBy?: string; limit?: number; offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { category, gender, team, search, isFeatured, featuredSection, orderBy = 'featured', limit = 20, offset = 0 } = opts;

  const conditions = [eq(products.isActive, true)];
  if (category) conditions.push(eq(products.category, category as any));
  if (gender) conditions.push(eq(products.gender, gender as any));
  if (team) conditions.push(like(products.team, `%${team}%`));
  if (search) conditions.push(or(like(products.name, `%${search}%`), like(products.team, `%${search}%`)) as any);
  if (isFeatured !== undefined) conditions.push(eq(products.isFeatured, isFeatured));
  if (featuredSection !== undefined) conditions.push(eq(products.featuredSection, featuredSection as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let orderClause;
  switch (orderBy) {
    case 'newest': orderClause = desc(products.createdAt); break;
    case 'sales': orderClause = desc(products.salesCount); break;
    case 'bestseller': orderClause = desc(products.salesCount); break;
    case 'price_asc': orderClause = asc(products.price); break;
    case 'price_desc': orderClause = desc(products.price); break;
    default: orderClause = desc(products.isFeatured);
  }

  const [items, countResult] = await Promise.all([
    db.select().from(products).where(where).orderBy(orderClause).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(products).where(where),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function getProductBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const [product] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  if (!product) return null;
  const stock = await db.select().from(productStock).where(eq(productStock.productId, product.id));
  return { ...product, stock };
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;
  const stock = await db.select().from(productStock).where(eq(productStock.productId, product.id));
  return { ...product, stock };
}

// Helper para converter preço string (com vírgula ou ponto) para decimal
function parsePrice(priceStr: string | undefined): string | null {
  if (!priceStr) return null;
  // Remove espaços e substitui vírgula por ponto
  const normalized = priceStr.trim().replace(',', '.');
  // Valida se é um número válido
  const num = parseFloat(normalized);
  if (isNaN(num)) return null;
  // Retorna com 2 casas decimais
  return num.toFixed(2);
}

export async function createProduct(data: {
  name: string; slug: string; description?: string; price: string; originalPrice?: string;
  team?: string; category: string; gender: string; isActive: boolean; isFeatured: boolean;
  featuredSection?: string; images: string[]; stock: { size: string; quantity: number }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(products).values({
    name: data.name, slug: data.slug, description: data.description || null,
    price: parsePrice(data.price) || "0.00", originalPrice: parsePrice(data.originalPrice),
    team: data.team || null, category: data.category as any, gender: data.gender as any,
    isActive: data.isActive, isFeatured: data.isFeatured, featuredSection: (data.featuredSection as any) || null,
    images: data.images,
  });
  const productId = (result as any).insertId;
  if (data.stock && data.stock.length > 0) {
    for (const s of data.stock) {
      await db.insert(productStock).values({ productId, size: s.size as any, quantity: s.quantity });
    }
  }
  return productId;
}

export async function updateProduct(id: number, data: Partial<{
  name: string; slug: string; description: string; price: string; originalPrice: string;
  team: string; category: string; gender: string; isActive: boolean; isFeatured: boolean;
  featuredSection: string; images: string[]; stock: { size: string; quantity: number }[];
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.slug !== undefined) updateData.slug = data.slug;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.price !== undefined) updateData.price = parsePrice(data.price) || "0.00";
  if (data.originalPrice !== undefined) updateData.originalPrice = parsePrice(data.originalPrice);
  if (data.team !== undefined) updateData.team = data.team || null;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.gender !== undefined) updateData.gender = data.gender;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.isFeatured !== undefined) updateData.isFeatured = data.isFeatured;
  if (data.featuredSection !== undefined) updateData.featuredSection = (data.featuredSection as any) || null;
  if (data.images !== undefined) updateData.images = data.images;
  if (Object.keys(updateData).length > 0) {
    await db.update(products).set(updateData).where(eq(products.id, id));
  }
  if (data.stock) {
    await db.delete(productStock).where(eq(productStock.productId, id));
    for (const s of data.stock) {
      await db.insert(productStock).values({ productId: id, size: s.size as any, quantity: s.quantity });
    }
  }
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(productStock).where(eq(productStock.productId, id));
  await db.delete(products).where(eq(products.id, id));
}

// ─── Orders ───────────────────────────────────────────────────────────────────
export async function createOrder(data: {
  orderNumber: string; customerName: string; customerEmail: string; customerPhone?: string;
  addressZip?: string; addressStreet?: string; addressNumber?: string; addressComplement?: string;
  addressNeighborhood?: string; addressCity?: string; addressState?: string;
  paymentMethod: string; subtotal: string; shippingCost: string; total: string;
  items: { productId: number; productName: string; productImage?: string; size: string; quantity: number; unitPrice: string; total: string }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(orders).values({
    orderNumber: data.orderNumber, customerName: data.customerName,
    customerEmail: data.customerEmail, customerPhone: data.customerPhone || null,
    addressZip: data.addressZip || null, addressStreet: data.addressStreet || null,
    addressNumber: data.addressNumber || null, addressComplement: data.addressComplement || null,
    addressNeighborhood: data.addressNeighborhood || null, addressCity: data.addressCity || null,
    addressState: data.addressState || null, paymentMethod: data.paymentMethod as any,
    subtotal: data.subtotal, shippingCost: data.shippingCost, total: data.total,
  });
  const orderId = (result as any).insertId;
  for (const item of data.items) {
    await db.insert(orderItems).values({
      orderId, productId: item.productId, productName: item.productName,
      productImage: item.productImage || null, size: item.size, quantity: item.quantity,
      unitPrice: item.unitPrice, total: item.total,
    });
    // Update stock
    await db.execute(sql`UPDATE product_stock SET quantity = GREATEST(0, quantity - ${item.quantity}) WHERE product_id = ${item.productId} AND size = ${item.size}`);
    // Update sales count
    await db.execute(sql`UPDATE products SET sales_count = sales_count + ${item.quantity} WHERE id = ${item.productId}`);
  }
  return orderId;
}

export async function getOrders(opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { limit = 50, offset = 0 } = opts;
  const [items, countResult] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(orders),
  ]);
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function getOrderById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { ...order, items };
}

export async function updateOrderStatus(id: number, status?: string, paymentStatus?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = {};
  if (status) updateData.status = status;
  if (paymentStatus) updateData.paymentStatus = paymentStatus;
  if (Object.keys(updateData).length > 0) {
    await db.update(orders).set(updateData).where(eq(orders.id, id));
  }
}

// ─── Banners ──────────────────────────────────────────────────────────────────
export async function getActiveBanners() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(banners).where(eq(banners.isActive, true)).orderBy(asc(banners.sortOrder));
}

export async function getAllBanners() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(banners).orderBy(asc(banners.sortOrder));
}

export async function createBanner(data: {
  title: string; subtitle?: string; imageUrl: string; linkUrl?: string;
  buttonText?: string; isActive: boolean; sortOrder: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(banners).values(data);
  return (result as any).insertId;
}

export async function updateBanner(id: number, data: Partial<{
  title: string; subtitle: string; imageUrl: string; linkUrl: string;
  buttonText: string; isActive: boolean; sortOrder: number;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(banners).set(data as any).where(eq(banners.id, id));
}

export async function deleteBanner(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(banners).where(eq(banners.id, id));
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(storeSettings);
  return Object.fromEntries(rows.map(r => [r.key, r.value ?? '']));
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(storeSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalOrders: 0, todayOrders: 0, totalRevenue: 0, lowStockProducts: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [totalOrdersResult, todayOrdersResult, revenueResult, lowStockResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(orders),
    db.select({ count: sql<number>`count(*)` }).from(orders).where(sql`created_at >= ${today}`),
    db.select({ sum: sql<number>`COALESCE(SUM(total), 0)` }).from(orders).where(eq(orders.paymentStatus, 'paid')),
    db.select({ count: sql<number>`count(*)` }).from(productStock).where(sql`quantity <= 3 AND quantity > 0`),
  ]);
  return {
    totalOrders: Number(totalOrdersResult[0]?.count ?? 0),
    todayOrders: Number(todayOrdersResult[0]?.count ?? 0),
    totalRevenue: Number(revenueResult[0]?.sum ?? 0),
    lowStockProducts: Number(lowStockResult[0]?.count ?? 0),
  };
}
