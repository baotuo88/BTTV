const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

let signingKeyPromise: Promise<CryptoKey> | null = null;

function getCryptoOrThrow(): Crypto {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) {
    throw new Error("当前运行环境不支持 Web Crypto");
  }
  return cryptoImpl;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function constantTimeEqualStrings(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

function getAdminPassword(): string | null {
  const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
  return configuredPassword || null;
}

async function getSigningKey(): Promise<CryptoKey> {
  const password = getAdminPassword();
  if (!password) {
    throw new Error("管理员密码未配置");
  }

  if (!signingKeyPromise) {
    signingKeyPromise = getCryptoOrThrow().subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }

  return signingKeyPromise;
}

async function signPayload(payload: string): Promise<string> {
  const signature = await getCryptoOrThrow().subtle.sign(
    "HMAC",
    await getSigningKey(),
    encoder.encode(payload)
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

export function isAdminPasswordConfigured(): boolean {
  return !!getAdminPassword();
}

export function validateAdminPassword(password: string): boolean {
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    return false;
  }

  return constantTimeEqualStrings(password, adminPassword);
}

export async function createAdminSessionToken(): Promise<string> {
  const cryptoImpl = getCryptoOrThrow();
  const nonce = new Uint8Array(16);
  cryptoImpl.getRandomValues(nonce);

  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        exp: Date.now() + ADMIN_SESSION_MAX_AGE * 1000,
        nonce: bytesToBase64Url(nonce),
      })
    )
  );

  return `${payload}.${await signPayload(payload)}`;
}

export async function verifyAdminSessionToken(
  token: string | null | undefined
): Promise<boolean> {
  if (!token) {
    return false;
  }

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) {
    return false;
  }

  let expectedSignature: string;
  try {
    expectedSignature = await signPayload(payload);
  } catch {
    return false;
  }

  if (!constantTimeEqualStrings(signature, expectedSignature)) {
    return false;
  }

  try {
    const decodedPayload = JSON.parse(
      decoder.decode(base64UrlToBytes(payload))
    ) as { exp?: unknown };

    return typeof decodedPayload.exp === "number" && decodedPayload.exp > Date.now();
  } catch {
    return false;
  }
}
