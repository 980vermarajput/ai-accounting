import crypto from "crypto";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { ApiError } from "./api-error";

// ─── Types ──────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  firmId: string;
  email: string;
  role: "admin" | "member";
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number; // Unix ms
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

// ─── Google OAuth Client ─────────────────────────────────────────

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw ApiError.internal(
      "Google OAuth environment variables not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)",
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ─── OAuth URL Builder ───────────────────────────────────────────

/**
 * Build the Google OAuth consent URL.
 * We request offline access (refresh token) and force consent to always
 * get a new refresh token even if user has already granted access.
 */
export function buildGoogleAuthUrl(state?: string): string {
  const oauth2Client = getOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    state,
  });
}

// ─── Token Exchange ──────────────────────────────────────────────

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<GoogleTokens> {
  const oauth2Client = getOAuthClient();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw ApiError.badRequest(
      "Google did not return tokens — ensure offline access and consent were requested",
    );
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ?? Date.now() + 3600 * 1000,
  };
}

// ─── User Profile ────────────────────────────────────────────────

/**
 * Fetch the authenticated user's Google profile using their access token.
 */
export async function fetchGoogleProfile(
  accessToken: string,
): Promise<GoogleProfile> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  if (!data.id || !data.email) {
    throw ApiError.internal("Could not fetch Google user profile");
  }

  return {
    googleId: data.id,
    email: data.email,
    name: data.name ?? data.email,
    picture: data.picture ?? undefined,
  };
}

// ─── AES-256-GCM Encryption ──────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw ApiError.internal(
      "ENCRYPTION_KEY must be set as a 64-character hex string (32 bytes)",
    );
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypts a string using AES-256-GCM with a random IV.
 * Returns a single base64 string: iv(12) + authTag(16) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv || authTag || ciphertext → base64
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypts a string previously encrypted with encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(ciphertext, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    throw ApiError.internal(
      "Failed to decrypt stored token — ENCRYPTION_KEY may have changed. Sign out and sign back in to re-encrypt your credentials.",
    );
  }
}

// ─── JWT ─────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.startsWith("change-me")) {
    throw ApiError.internal("JWT_SECRET is not configured");
  }
  return secret;
}

/**
 * Sign a JWT session token for an authenticated user.
 */
export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn:
      (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) ?? "7d",
    issuer: "ai-accounting",
    audience: "ai-accounting-client",
  });
}

/**
 * Verify and decode a JWT. Throws ApiError.unauthorized on failure.
 */
export function verifyJwt(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: "ai-accounting",
      audience: "ai-accounting-client",
    });
    return decoded as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized("Session expired — please sign in again");
    }
    throw ApiError.unauthorized("Invalid session token");
  }
}
