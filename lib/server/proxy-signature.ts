import "server-only";

import crypto from "node:crypto";

const PROXY_SIGN_VERSION = "v1";
const DEFAULT_PROXY_SIGN_TTL = 10 * 60;

const globalForProxySign = globalThis as unknown as {
  proxySignSecret?: string;
};

function getSecret(): string {
  const value = process.env.PROXY_SIGN_SECRET?.trim();
  if (value) return value;

  const fallback = process.env.ADMIN_PASSWORD?.trim();
  if (fallback) return fallback;

  if (!globalForProxySign.proxySignSecret) {
    globalForProxySign.proxySignSecret = crypto.randomBytes(32).toString("hex");
  }

  return globalForProxySign.proxySignSecret;
}

function buildPayload(url: string, expiresAt: number): string {
  return `${PROXY_SIGN_VERSION}:${url}:${expiresAt}`;
}

function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

export interface SignedProxyToken {
  expiresAt: number;
  signature: string;
}

export function createProxySignature(
  url: string,
  ttlSeconds: number = DEFAULT_PROXY_SIGN_TTL
): SignedProxyToken {
  const safeTtl = Number.isFinite(ttlSeconds)
    ? Math.max(30, Math.min(ttlSeconds, 24 * 60 * 60))
    : DEFAULT_PROXY_SIGN_TTL;

  const expiresAt = Math.floor(Date.now() / 1000) + safeTtl;
  const payload = buildPayload(url, expiresAt);

  return {
    expiresAt,
    signature: signPayload(payload),
  };
}

export function verifyProxySignature(params: {
  url: string;
  expiresAt: number;
  signature: string;
}): boolean {
  const { url, expiresAt, signature } = params;

  if (!Number.isInteger(expiresAt)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt < now) return false;

  const payload = buildPayload(url, expiresAt);
  const expected = signPayload(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
