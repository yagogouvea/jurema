import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ADMIN_JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "jumera-admin-secret-2026"
);
const ADMIN_COOKIE_NAME = "jumera_admin_token";
let adminToken: string;

// ─── Mock helpers ─────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getProducts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getProductBySlug: vi.fn().mockResolvedValue(null),
  getProductById: vi.fn().mockResolvedValue(null),
  createProduct: vi.fn().mockResolvedValue(1),
  updateProduct: vi.fn().mockResolvedValue(undefined),
  deleteProduct: vi.fn().mockResolvedValue(undefined),
  createOrder: vi.fn().mockResolvedValue(42),
  getOrders: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getOrderById: vi.fn().mockResolvedValue(null),
  updateOrderStatus: vi.fn().mockResolvedValue(undefined),
  getDashboardStats: vi.fn().mockResolvedValue({ totalOrders: 0, todayOrders: 0, totalRevenue: 0, lowStockProducts: 0 }),
  getActiveBanners: vi.fn().mockResolvedValue([]),
  getAllBanners: vi.fn().mockResolvedValue([]),
  createBanner: vi.fn().mockResolvedValue(1),
  updateBanner: vi.fn().mockResolvedValue(undefined),
  deleteBanner: vi.fn().mockResolvedValue(undefined),
  getAllSettings: vi.fn().mockResolvedValue({}),
  setSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({ url: "https://example.com/image.png" }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/image.png", key: "test-key" }),
}));

// ─── Context factories ─────────────────────────────────────────────────────────
function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

function makeAdminCtx(): TrpcContext {
  return {
    user: {
      id: 1, openId: "admin-open-id", name: "Admin", email: "admin@jumera.com",
      loginMethod: "manus", role: "admin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        authorization: `Bearer ${adminToken}`,
      },
    } as any,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
  };
}

function makeUserCtx(): TrpcContext {
  return {
    user: {
      id: 2, openId: "user-open-id", name: "User", email: "user@jumera.com",
      loginMethod: "manus", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  adminToken = await new SignJWT({ id: 1, username: "jurema@adm", name: "Admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(ADMIN_JWT_SECRET);
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("auth.me", () => {
  it("returns null for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user for authenticated users", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.role).toBe("admin");
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});

describe("products.list", () => {
  it("returns products list for public users", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.products.list({});
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("accepts category filter", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.products.list({ category: "times" });
    expect(result).toHaveProperty("items");
  });

  it("accepts gender filter", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.products.list({ gender: "masculino" });
    expect(result).toHaveProperty("items");
  });
});

describe("products.create (admin only)", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.products.create({
      name: "Test", slug: "test", price: "99.90",
      category: "times", gender: "masculino",
      images: [], isActive: true, isFeatured: false,
    })).rejects.toThrow();
  });

  it("allows admin to create product", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.products.create({
      name: "Camisa Flamengo 2025", slug: "camisa-flamengo-2025",
      price: "149.90", category: "tailandesa", gender: "masculino",
      images: ["https://example.com/img.jpg"], isActive: true, isFeatured: true,
    });
    expect(result).toHaveProperty("success", true);
  });
});

describe("orders.create", () => {
  it("creates order for public users and notifies owner", async () => {
    const { notifyOwner } = await import("./_core/notification");
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.orders.create({
      customerName: "João Silva",
      customerEmail: "joao@email.com",
      customerPhone: "11999999999",
      paymentMethod: "pix",
      subtotal: "149.90",
      shippingCost: "15.00",
      total: "164.90",
      items: [{
        productId: 1,
        productName: "Camisa Flamengo",
        size: "M",
        quantity: 1,
        unitPrice: "149.90",
        total: "149.90",
      }],
    });
    expect(result).toHaveProperty("orderNumber");
    expect(result.orderNumber).toMatch(/^JS/);
    expect(notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("Novo Pedido") })
    );
  });
});

describe("banners.list", () => {
  it("returns active banners for public users", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.banners.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("banners.listAll (admin only)", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.banners.listAll()).rejects.toThrow();
  });

  it("returns all banners for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.banners.listAll();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("dashboard.stats (admin only)", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.dashboard.stats()).rejects.toThrow();
  });

  it("returns stats for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.dashboard.stats();
    expect(result).toHaveProperty("totalOrders");
    expect(result).toHaveProperty("totalRevenue");
  });
});

describe("settings.getAll", () => {
  it("returns settings for public users", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.settings.getAll();
    expect(typeof result).toBe("object");
  });
});

describe("payment.createPreference", () => {
  it("returns message when MP not configured", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.payment.createPreference({
      orderId: 1,
      items: [{ title: "Camisa", quantity: 1, unit_price: 149.90 }],
      payer: { name: "João", email: "joao@email.com" },
    });
    expect(result).toHaveProperty("init_point");
    expect(result.init_point).toBeNull();
    expect(result).toHaveProperty("message");
  });
});
