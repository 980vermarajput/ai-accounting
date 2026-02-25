import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  encrypt,
  decrypt,
  signJwt,
  verifyJwt,
  buildGoogleAuthUrl,
} from "./auth";
import type { JwtPayload } from "./auth";

// 64 hex chars = 32 bytes — required format for ENCRYPTION_KEY
const VALID_ENCRYPTION_KEY = "a".repeat(64);
// Long enough secret for JWT_SECRET
const VALID_JWT_SECRET = "b".repeat(128);

// ─── encrypt / decrypt ────────────────────────────────────────────────────────

describe("encrypt / decrypt", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("round-trips a plaintext string", () => {
    const plaintext = "my-google-refresh-token-12345";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertext on every call (random IV)", () => {
    const plaintext = "same-text-different-iv";
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
    // But both must decrypt to the same value
    expect(decrypt(c1)).toBe(plaintext);
    expect(decrypt(c2)).toBe(plaintext);
  });

  it("round-trips unicode and special characters", () => {
    const plaintext = "रिफ्रेश-टोकन 🔐 <>&\"'";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("round-trips a long string (> 1 KB)", () => {
    const plaintext = "x".repeat(2000);
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow();
  });

  it("throws when ENCRYPTION_KEY is too short", () => {
    process.env.ENCRYPTION_KEY = "tooshort";
    expect(() => encrypt("test")).toThrow();
  });

  it("throws on decrypt when ciphertext is tampered (auth tag mismatch)", () => {
    const encrypted = encrypt("valid-secret-value");
    // Corrupt the last 4 bytes (inside the ciphertext portion)
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on decrypt when ciphertext is garbage", () => {
    expect(() => decrypt("this-is-not-valid-base64-gcm-data!!")).toThrow();
  });
});

// ─── signJwt / verifyJwt ──────────────────────────────────────────────────────

describe("signJwt / verifyJwt", () => {
  const payload: JwtPayload = {
    userId: "user-abc-123",
    firmId: "firm-xyz-456",
    email: "rajesh@sharmaassociates.in",
    role: "admin",
  };

  beforeEach(() => {
    process.env.JWT_SECRET = VALID_JWT_SECRET;
    process.env.JWT_EXPIRES_IN = "1h";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
    vi.useRealTimers();
  });

  it("round-trips the full payload", () => {
    const token = signJwt(payload);
    const decoded = verifyJwt(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.firmId).toBe(payload.firmId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  it("round-trips a member role payload", () => {
    const memberPayload: JwtPayload = { ...payload, role: "member" };
    const decoded = verifyJwt(signJwt(memberPayload));
    expect(decoded.role).toBe("member");
  });

  it("throws UNAUTHORIZED (Session expired) on an expired token", () => {
    // Sign while frozen at a date 6 years in the past — token will be expired by now
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const token = signJwt(payload); // expires at 2020-01-01T01:00:00Z
    vi.useRealTimers();

    expect(() => verifyJwt(token)).toThrowError(/Session expired/);
  });

  it("throws UNAUTHORIZED (Invalid session token) on a tampered token", () => {
    const token = signJwt(payload);
    // Corrupt the signature part (last segment)
    const parts = token.split(".");
    parts[2] = parts[2].slice(0, -4) + "XXXX";
    expect(() => verifyJwt(parts.join("."))).toThrowError(
      /Invalid session token/,
    );
  });

  it("throws UNAUTHORIZED on a completely garbage string", () => {
    expect(() => verifyJwt("not.a.jwt")).toThrowError(/Invalid session token/);
  });

  it("throws UNAUTHORIZED on a token signed with a different secret", () => {
    const token = signJwt(payload);
    process.env.JWT_SECRET = "c".repeat(128); // change secret
    expect(() => verifyJwt(token)).toThrowError(/Invalid session token/);
  });

  it("throws when JWT_SECRET is not set", () => {
    delete process.env.JWT_SECRET;
    expect(() => signJwt(payload)).toThrow(/JWT_SECRET is not configured/);
  });

  it("throws when JWT_SECRET starts with 'change-me'", () => {
    process.env.JWT_SECRET = "change-me-please";
    expect(() => signJwt(payload)).toThrow(/JWT_SECRET is not configured/);
  });
});

// ─── buildGoogleAuthUrl ───────────────────────────────────────────────────────

describe("buildGoogleAuthUrl", () => {
  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  it("throws when Google env vars are missing", () => {
    expect(() => buildGoogleAuthUrl()).toThrow(
      /Google OAuth environment variables not configured/,
    );
  });

  it("throws when only GOOGLE_CLIENT_ID is set", () => {
    process.env.GOOGLE_CLIENT_ID = "fake-id";
    expect(() => buildGoogleAuthUrl()).toThrow(
      /Google OAuth environment variables not configured/,
    );
  });

  it("returns a Google accounts URL when all env vars are set", () => {
    process.env.GOOGLE_CLIENT_ID = "fake-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "fake-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:4000/api/auth/google/callback";

    const url = buildGoogleAuthUrl();
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("offline");
    expect(url).toContain("consent");
  });

  it("includes the state parameter when provided", () => {
    process.env.GOOGLE_CLIENT_ID = "fake-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "fake-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:4000/api/auth/google/callback";

    const url = buildGoogleAuthUrl("random-csrf-state-123");
    expect(url).toContain("random-csrf-state-123");
  });

  it("includes required Gmail and Drive scopes", () => {
    process.env.GOOGLE_CLIENT_ID = "fake-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "fake-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:4000/api/auth/google/callback";

    const url = buildGoogleAuthUrl();
    expect(url).toContain("gmail");
    expect(url).toContain("drive");
    expect(url).toContain("userinfo");
  });
});
