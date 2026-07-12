import "server-only";

import dns from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254",
  "metadata.google.internal",
]);

function normalizeHostname(hostname: string): string {
  return hostname.trim().replace(/\.$/, "").toLowerCase();
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [first, second] = parts;

  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first >= 224) return true;

  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice(7));
  }

  const [firstSegment = "0"] = normalized.split(":");
  const firstValue = Number.parseInt(firstSegment || "0", 16);

  if (Number.isNaN(firstValue)) {
    return true;
  }

  if ((firstValue & 0xfe00) === 0xfc00) return true;
  if ((firstValue & 0xffc0) === 0xfe80) return true;

  return false;
}

function isUnsafeIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

export async function assertSafeRemoteUrl(input: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error("无效的远程地址");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("仅允许 HTTP/HTTPS 远程地址");
  }

  if (url.username || url.password) {
    throw new Error("远程地址不允许包含认证信息");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("不允许访问本机或保留地址");
  }

  if (isIP(hostname)) {
    if (isUnsafeIpAddress(hostname)) {
      throw new Error("不允许访问内网或本机地址");
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("远程主机解析失败");
  }

  if (
    addresses.length === 0 ||
    addresses.some((entry) => isUnsafeIpAddress(entry.address))
  ) {
    throw new Error("不允许访问内网或本机地址");
  }

  return url;
}
