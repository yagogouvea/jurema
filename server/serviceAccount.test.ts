import { describe, it, expect } from "vitest";
import { createSign } from "crypto";

describe("Google Service Account Validation", () => {
  it("should have GOOGLE_SERVICE_ACCOUNT_JSON env var set", () => {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    expect(raw).toBeTruthy();
  });

  it("should parse the JSON and contain required fields", () => {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
    const sa = JSON.parse(raw);
    expect(sa.type).toBe("service_account");
    expect(sa.client_email).toBeTruthy();
    expect(sa.private_key).toContain("-----BEGIN PRIVATE KEY-----");
    expect(sa.token_uri).toBe("https://oauth2.googleapis.com/token");
  });

  it("should obtain a valid access token from Google OAuth", async () => {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
    const sa = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);

    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })).toString("base64url");

    const signingInput = `${header}.${payload}`;
    const sign = createSign("RSA-SHA256");
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key, "base64url");
    const jwt = `${signingInput}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    expect(tokenRes.ok).toBe(true);
    const tokenData = await tokenRes.json();
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.token_type).toBe("Bearer");
  }, 15000);

  it("should be able to read the Jumera spreadsheet", async () => {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
    const sa = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);

    // Get token
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })).toString("base64url");

    const signingInput = `${header}.${payload}`;
    const sign = createSign("RSA-SHA256");
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key, "base64url");
    const jwt = `${signingInput}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Try to read the spreadsheet
    const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    expect(readRes.ok).toBe(true);
    const data = await readRes.json();
    expect(data.sheets).toBeTruthy();
    expect(data.sheets.length).toBeGreaterThan(0);
    
    // Verify the expected sheets exist
    const sheetNames = data.sheets.map((s: any) => s.properties.title);
    console.log("Abas encontradas:", sheetNames);
    expect(sheetNames).toContain("PRODUTOS");
  }, 15000);
});
