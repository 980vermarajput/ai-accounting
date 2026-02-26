// Run: node scripts/debug-token.cjs
// Diagnoses how the encrypted refresh token is stored in the DB

"use strict";
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const p = new PrismaClient();
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const keyHex = process.env.ENCRYPTION_KEY;

if (!keyHex || keyHex.length !== 64) {
  console.error("❌ ENCRYPTION_KEY not set or wrong length. Check apps/api/.env");
  process.exit(1);
}
const key = Buffer.from(keyHex, "hex");

async function main() {
  const u = await p.user.findFirst({ where: { googleRefreshTokenEnc: { not: null } } });
  if (!u) {
    console.log("⚠️  No user with a stored refresh token found. Sign in first.");
    return;
  }

  const raw = u.googleRefreshTokenEnc;
  console.log("\n=== Stored token diagnostics ===");
  console.log("Is Buffer:", Buffer.isBuffer(raw));
  console.log("Length:", raw.length);
  console.log("First 40 bytes (hex):", raw.toString("hex").slice(0, 80));
  console.log("As utf8 string (first 80 chars):", raw.toString("utf8").slice(0, 80));
  console.log("As base64 string (first 80 chars):", raw.toString("base64").slice(0, 80));

  // Path A: current (broken) — toString() on Uint8Array gives "70,43,111,..."
  console.log("\n--- Path A (BROKEN): Uint8Array.toString() → base64 decode ---");
  try {
    const data = Buffer.from(raw.toString("utf8"), "base64");
    console.log("Decoded length:", data.length);
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const enc = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const d = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    d.setAuthTag(authTag);
    const plain = Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    console.log("✅ SUCCESS — token starts with:", plain.slice(0, 20));
  } catch (e) {
    console.log("❌ FAILED:", e.message);
  }

  // Path C: THE FIX — Buffer.from(Uint8Array).toString('utf8') recovers the base64 string
  console.log("\n--- Path C (FIX): Buffer.from(raw).toString('utf8') → base64 decode ---");
  try {
    const base64str = Buffer.from(raw).toString("utf8");
    console.log("Recovered base64 string (first 80):", base64str.slice(0, 80));
    const data = Buffer.from(base64str, "base64");
    console.log("Decoded length:", data.length);
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const enc = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const d = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    d.setAuthTag(authTag);
    const plain = Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    console.log("✅ SUCCESS — token starts with:", plain.slice(0, 20));
  } catch (e) {
    console.log("❌ FAILED:", e.message);
  }

  // Path B: treat the raw bytes directly as the binary ciphertext (iv+tag+enc)
  console.log("\n--- Path B: raw Uint8Array directly as binary ciphertext ---");
  try {
    const data = raw;
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const enc = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const d = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    d.setAuthTag(authTag);
    const plain = Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    console.log("✅ SUCCESS — token starts with:", plain.slice(0, 20));
  } catch (e) {
    console.log("❌ FAILED:", e.message);
  }
}

main().finally(() => p.$disconnect());
