import "server-only";

import crypto from "node:crypto";

const PROXY_SIGN_VERSION = "v1";
const DEFAULT_PROXY_SIGN_TTL = 10 * 60;

/**
 * 获取代理签名密钥。
 *
 * 必须显式配置 `PROXY_SIGN_SECRET` 环境变量（推荐 `openssl rand -hex 32`）。
 * 允许回退到 `ADMIN_PASSWORD` 以兼容早期部署，但强烈建议独立配置。
 *
 * 为什么不再回退到随机密钥：serverless 平台（如 Vercel）每个冷启动实例的
 * globalThis 都是独立的。若靠内存随机密钥，实例 A 签发的 m3u8 分片 URL
 * 到实例 B 会验签失败，用户会看到间歇性 403 且难以复现。
 */
function getSecret(): string {
  const value = process.env.PROXY_SIGN_SECRET?.trim();
  if (value) return value;

  const fallback = process.env.ADMIN_PASSWORD?.trim();
  if (fallback) return fallback;

  throw new Error(
    "[proxy-signature] 未配置 PROXY_SIGN_SECRET。请在部署环境变量中设置一个稳定的 32+ 字节随机字符串（建议：openssl rand -hex 32）。否则 serverless 冷启动会导致签名不一致，用户会随机看到 403。"
  );
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
