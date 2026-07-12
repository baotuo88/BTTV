import "server-only";

import type { NextRequest } from "next/server";

const FALLBACK_IP = "unknown";

function cleanupIp(raw: string): string {
  let ip = raw.trim();
  if (!ip) return FALLBACK_IP;

  // Forwarded header may include quoted values.
  if (ip.startsWith('"') && ip.endsWith('"')) {
    ip = ip.slice(1, -1).trim();
  }

  // Strip IPv6 brackets and optional port, e.g. [2001:db8::1]:443
  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]")).trim();
  }

  // Strip IPv4 port, e.g. 1.2.3.4:1234
  if (ip.includes(".") && ip.includes(":")) {
    const lastColon = ip.lastIndexOf(":");
    const maybePort = ip.slice(lastColon + 1);
    if (/^\d+$/.test(maybePort)) {
      ip = ip.slice(0, lastColon);
    }
  }

  return ip || FALLBACK_IP;
}

function getForwardedForIp(value: string | null): string | null {
  if (!value) return null;

  // Example: for=203.0.113.43;proto=https
  const parts = value.split(",");
  for (const part of parts) {
    const match = part.match(/for=([^;]+)/i);
    if (match?.[1]) {
      const cleaned = cleanupIp(match[1]);
      if (cleaned !== FALLBACK_IP) return cleaned;
    }
  }

  return null;
}

function getXForwardedForIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  const cleaned = cleanupIp(first);
  return cleaned === FALLBACK_IP ? null : cleaned;
}

export function getClientIp(request: NextRequest): string {
  const headers = request.headers;

  const forwardedIp = getForwardedForIp(headers.get("forwarded"));
  if (forwardedIp) return forwardedIp;

  const xForwardedForIp = getXForwardedForIp(headers.get("x-forwarded-for"));
  if (xForwardedForIp) return xForwardedForIp;

  const directCandidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("true-client-ip"),
  ];

  for (const candidate of directCandidates) {
    if (!candidate) continue;
    const cleaned = cleanupIp(candidate);
    if (cleaned !== FALLBACK_IP) return cleaned;
  }

  return FALLBACK_IP;
}
