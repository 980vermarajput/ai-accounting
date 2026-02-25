import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requireAdmin } from "./auth";
import { signJwt } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";

const VALID_JWT_SECRET = "b".repeat(128);

/** Minimal Express Request mock */
function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

const mockRes = {} as Response;

// ─── requireAuth ──────────────────────────────────────────────────────────────

describe("requireAuth", () => {
  const payload: JwtPayload = {
    userId: "user-abc-123",
    firmId: "firm-xyz-456",
    email: "rajesh@sharmaassociates.in",
    role: "admin",
  };

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.JWT_SECRET = VALID_JWT_SECRET;
    process.env.JWT_EXPIRES_IN = "1h";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  // ── Dev bypass ──────────────────────────────────────────────────

  it("dev bypass: sets req.user and calls next() with no args for valid X-Dev-User JSON", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq({ "x-dev-user": JSON.stringify(payload) });

    requireAuth(req, mockRes, next);

    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(/* no args = success */);
  });

  it("dev bypass: falls through to JWT check when X-Dev-User is invalid JSON", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq({ "x-dev-user": "{{invalid-json}}" });

    requireAuth(req, mockRes, next);

    // No Authorization header present either → should be called with 401 error
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("dev bypass: ignored when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq({ "x-dev-user": JSON.stringify(payload) });

    requireAuth(req, mockRes, next);

    // X-Dev-User must be ignored; no Authorization header → 401
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  // ── Bearer JWT ──────────────────────────────────────────────────

  it("accepts a valid Bearer JWT and sets req.user", () => {
    const token = signJwt(payload);
    const next = vi.fn() as unknown as NextFunction;
    // No X-Dev-User header — forces the real JWT path even in development
    const req = mockReq({ authorization: `Bearer ${token}` });

    requireAuth(req, mockRes, next);

    expect(req.user?.userId).toBe(payload.userId);
    expect(req.user?.firmId).toBe(payload.firmId);
    expect(req.user?.role).toBe(payload.role);
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 401 when Authorization header is missing entirely", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq({});

    requireAuth(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("returns 401 when Authorization header is not Bearer scheme", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq({ authorization: "Basic dXNlcjpwYXNz" });

    requireAuth(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("returns 401 for a syntactically invalid JWT", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq({ authorization: "Bearer not.a.valid.jwt.here" });

    requireAuth(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("returns 401 for a JWT signed with a different secret", () => {
    const token = signJwt(payload);
    process.env.JWT_SECRET = "d".repeat(128); // rotate secret
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq({ authorization: `Bearer ${token}` });

    requireAuth(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });
});

// ─── requireAdmin ─────────────────────────────────────────────────────────────

describe("requireAdmin", () => {
  it("calls next() without error for an admin user", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq() as Request & { user: { role: string } };
    req.user = {
      userId: "u1",
      firmId: "f1",
      email: "a@b.com",
      role: "admin",
    } as any;

    requireAdmin(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("returns 403 for a member user", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq() as Request & { user: { role: string } };
    req.user = {
      userId: "u1",
      firmId: "f1",
      email: "a@b.com",
      role: "member",
    } as any;

    requireAdmin(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it("returns 403 when req.user is not set (requireAuth not applied)", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = mockReq();

    requireAdmin(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });
});
