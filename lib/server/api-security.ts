import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/server/client-ip";
import { applyRateLimit } from "@/lib/server/rate-limit";

interface RateLimitRule {
  prefix: string;
  max: number;
  windowMs: number;
}

const SAME_SITE_FETCH_VALUES = new Set(["same-origin", "same-site", "none"]);

function setRateLimitHeaders(
  response: NextResponse,
  values: { limit: number; remaining: number; resetAt: number; retryAfterSeconds?: number }
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(values.limit));
  response.headers.set("X-RateLimit-Remaining", String(values.remaining));
  response.headers.set("X-RateLimit-Reset", String(values.resetAt));
  if (values.retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(values.retryAfterSeconds));
  }
  return response;
}

export function applyJsonRateLimit(
  request: NextRequest,
  options: {
    scope: string;
    max: number;
    windowMs: number;
    message?: string;
  }
): NextResponse | null {
  const ip = getClientIp(request);
  const result = applyRateLimit({
    key: `${options.scope}:${ip}`,
    max: options.max,
    windowMs: options.windowMs,
  });

  if (!result.allowed) {
    const response = NextResponse.json(
      {
        code: 429,
        message: options.message || "请求过于频繁，请稍后重试",
        data: null,
      },
      { status: 429 }
    );

    return setRateLimitHeaders(response, {
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.resetAt,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  return null;
}

export function rateLimitRulesForProxy(route: "video" | "image"): RateLimitRule[] {
  if (route === "video") {
    return [
      { prefix: "proxy:video:global", max: 180, windowMs: 60_000 },
      { prefix: "proxy:video:burst", max: 30, windowMs: 10_000 },
    ];
  }

  return [
    { prefix: "proxy:image:global", max: 240, windowMs: 60_000 },
    { prefix: "proxy:image:burst", max: 50, windowMs: 10_000 },
  ];
}

export function applyProxyRateLimit(
  request: NextRequest,
  route: "video" | "image"
): NextResponse | null {
  const ip = getClientIp(request);
  const rules = rateLimitRulesForProxy(route);

  let finalResult:
    | { limit: number; remaining: number; resetAt: number; retryAfterSeconds: number }
    | null = null;

  for (const rule of rules) {
    const result = applyRateLimit({
      key: `${rule.prefix}:${ip}`,
      max: rule.max,
      windowMs: rule.windowMs,
    });

    finalResult = {
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.resetAt,
      retryAfterSeconds: result.retryAfterSeconds,
    };

    if (!result.allowed) {
      const response = NextResponse.json(
        {
          code: 429,
          message: "请求过于频繁，请稍后重试",
          data: null,
        },
        { status: 429 }
      );

      return setRateLimitHeaders(response, finalResult);
    }
  }

  if (!finalResult) return null;

  // Success paths don't use this helper return, but keep API consistent.
  return null;
}

export function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function validateFirstPartyProxyRequest(request: NextRequest): string | null {
  const targetOrigin = request.nextUrl.origin;

  const secFetchSite = request.headers.get("sec-fetch-site");
  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");

  if (!secFetchSite && !originHeader && !refererHeader) {
    return "缺少请求来源信息";
  }

  if (secFetchSite && !SAME_SITE_FETCH_VALUES.has(secFetchSite)) {
    return "禁止跨站访问代理接口";
  }

  if (originHeader && originHeader !== targetOrigin) {
    return "跨域 Origin 不被允许";
  }

  if (refererHeader) {
    try {
      const refererOrigin = new URL(refererHeader).origin;
      if (refererOrigin !== targetOrigin) {
        return "跨域 Referer 不被允许";
      }
    } catch {
      return "Referer 头格式无效";
    }
  }

  return null;
}

export function buildStrictProxyCorsHeaders(
  request: NextRequest,
  options: {
    allowHeaders?: string[];
    exposeHeaders?: string[];
    methods?: string[];
  } = {}
): Headers {
  const headers = new Headers();
  const originHeader = request.headers.get("origin");
  const targetOrigin = request.nextUrl.origin;

  if (originHeader && originHeader === targetOrigin) {
    headers.set("Access-Control-Allow-Origin", originHeader);
    headers.set("Vary", "Origin");
  }

  const methods = options.methods || ["GET", "HEAD", "OPTIONS"];
  headers.set("Access-Control-Allow-Methods", methods.join(", "));
  headers.set(
    "Access-Control-Allow-Headers",
    (options.allowHeaders || ["Range", "Content-Type"]).join(", ")
  );

  if (options.exposeHeaders && options.exposeHeaders.length > 0) {
    headers.set("Access-Control-Expose-Headers", options.exposeHeaders.join(", "));
  }

  return headers;
}
