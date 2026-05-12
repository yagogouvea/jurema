import { describe, it, expect, vi, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { verifyPdvToken } from "./routers/pdvAuth";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { Request } from "express";

const PDV_JWT_FALLBACK = process.env.JWT_SECRET || "pdv_jwt_secret_fallback";
const enc = () => new TextEncoder().encode(PDV_JWT_FALLBACK);

async function signPdvJwt(payload: { sellerId: number; name: string; username: string; role: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(enc());
}

function mockReq(partial: { cookie?: string; authorization?: string }): Request {
  const headers: Record<string, string | undefined> = {};
  if (partial.cookie !== undefined) headers.cookie = partial.cookie;
  if (partial.authorization !== undefined) headers.authorization = partial.authorization;
  return { headers } as Request;
}

describe("verifyPdvToken", () => {
  it("aceita Bearer válido mesmo com cookie pdv_token inválido", async () => {
    const good = await signPdvJwt({ sellerId: 99, name: "T", username: "t", role: "admin" });
    const r = await verifyPdvToken(
      mockReq({ cookie: "pdv_token=not.a.valid.jwt", authorization: `Bearer ${good}` })
    );
    expect(r?.sellerId).toBe(99);
  });

  it("usa só cookie quando não há Authorization", async () => {
    const good = await signPdvJwt({ sellerId: 7, name: "C", username: "c", role: "seller" });
    const r = await verifyPdvToken(mockReq({ cookie: `pdv_token=${good}` }));
    expect(r?.sellerId).toBe(7);
  });

  it("Bearer inválido seguido de cookie válido", async () => {
    const good = await signPdvJwt({ sellerId: 3, name: "X", username: "x", role: "seller" });
    const r = await verifyPdvToken(
      mockReq({
        cookie: `pdv_token=${good}`,
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.e30.signature_invalid",
      })
    );
    expect(r?.sellerId).toBe(3);
  });

  it("prefixo Bearer case-insensitive", async () => {
    const good = await signPdvJwt({ sellerId: 2, name: "B", username: "b", role: "admin" });
    const r = await verifyPdvToken(mockReq({ authorization: `bearer ${good}` }));
    expect(r?.sellerId).toBe(2);
  });
});

describe("PDV tRPC: cookie lixo + Bearer do login", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error("DATABASE_URL necessário para integração");
    }
  });

  it("getLinhas funciona com Authorization Bearer após login (cookie inválido no req)", async () => {
    const cookieStub = vi.fn();
    const ctxLogin: TrpcContext = {
      user: null,
      req: { headers: {} } as TrpcContext["req"],
      res: { cookie: cookieStub, clearCookie: vi.fn() } as TrpcContext["res"],
    };
    const logged = await appRouter.createCaller(ctxLogin).pdvAuth.login({
      username: "vanessa",
      password: "jurema@123",
    });
    expect(logged.token).toBeTruthy();

    const ctxApi: TrpcContext = {
      user: null,
      req: {
        headers: {
          cookie: "pdv_token=invalid.jwt.token",
          authorization: `Bearer ${logged.token}`,
        },
      } as TrpcContext["req"],
      res: { cookie: vi.fn(), clearCookie: vi.fn() } as TrpcContext["res"],
    };
    const linhas = await appRouter.createCaller(ctxApi).pdvProducts.getLinhas();
    expect(Array.isArray(linhas)).toBe(true);
    expect(linhas.length).toBeGreaterThan(0);
  });
});
