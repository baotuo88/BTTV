import { NextRequest, NextResponse } from "next/server";
import { assertSafeRemoteUrl } from "@/lib/server/safe-remote-url";
import { assertHostAllowed } from "@/lib/server/proxy-domain-allowlist";
import {
  applyProxyRateLimit,
  buildStrictProxyCorsHeaders,
  validateFirstPartyProxyRequest,
} from "@/lib/server/api-security";

export const runtime = "nodejs";

// 图片获取策略：
// 1) 首选：wsrv.nl 官方镜像（若可用，返回 webp，体积小）
// 2) 兜底：直连源站（豆瓣等），带对应 Referer
//
// 说明：先前使用的 wsrv.link0.me 已长期返回 502，若继续将其列入代理池，
// 每张图都要先等 8 秒超时才走兜底，Vercel serverless 10 秒上限下会大面积失败。
// 故去掉死代理，采用「并行竞速 + 短超时」策略，谁先返回用谁。

const WSRV_TIMEOUT_MS = 3500;
const DIRECT_TIMEOUT_MS = 6000;

const COMMON_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function buildRefererFor(hostname: string): string | undefined {
  const h = hostname.toLowerCase();
  if (h.endsWith("doubanio.com") || h.endsWith("douban.com")) {
    return "https://movie.douban.com/";
  }
  if (h.endsWith("themoviedb.org") || h.endsWith("tmdb.org")) {
    return "https://www.themoviedb.org/";
  }
  return undefined;
}

/**
 * 通过 wsrv.nl 官方镜像转码（去 protocol，官方要求）。
 */
async function fetchViaWsrv(originalUrl: string): Promise<Response> {
  // wsrv.nl 官方接收不带 protocol 的 URL
  const stripped = originalUrl.replace(/^https?:\/\//, "");
  const proxied = `https://wsrv.nl/?url=${encodeURIComponent(stripped)}&output=webp&q=85`;

  const response = await fetch(proxied, {
    headers: { "User-Agent": COMMON_UA },
    signal: AbortSignal.timeout(WSRV_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`wsrv.nl HTTP ${response.status}`);
  }
  return response;
}

/**
 * 直连源站。
 */
async function fetchDirect(url: URL): Promise<Response> {
  const headers: Record<string, string> = { "User-Agent": COMMON_UA };
  const referer = buildRefererFor(url.hostname);
  if (referer) headers["Referer"] = referer;

  const response = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`origin HTTP ${response.status}`);
  }
  return response;
}

/**
 * 并行竞速：wsrv.nl 与直连同时发，谁先 ok 用谁。全部失败再抛错。
 */
async function fetchImage(url: URL): Promise<Response> {
  const originalUrl = url.toString();

  const attempts: Promise<Response>[] = [
    fetchViaWsrv(originalUrl),
    fetchDirect(url),
  ];

  try {
    return await Promise.any(attempts);
  } catch (err) {
    // Promise.any 只会在全部失败时抛 AggregateError
    if (err instanceof AggregateError) {
      const detail = err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
      throw new Error(`所有获取方式都失败: ${detail}`);
    }
    throw err;
  }
}

export async function GET(request: NextRequest) {
  const firstPartyError = validateFirstPartyProxyRequest(request);
  if (firstPartyError) {
    return NextResponse.json(
      { code: 403, message: firstPartyError },
      { status: 403 }
    );
  }

  const rateLimitResponse = applyProxyRateLimit(request, "image");
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const url = request.nextUrl.searchParams.get('url');
    
    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    const safeUrl = await assertSafeRemoteUrl(url);
    await assertHostAllowed(safeUrl.hostname);

    // 并行竞速获取图片（wsrv.nl vs 直连），谁快用谁
    const response = await fetchImage(safeUrl);
    
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: (() => {
        const headers = buildStrictProxyCorsHeaders(request);
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return headers;
      })(),
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  const firstPartyError = validateFirstPartyProxyRequest(request);
  if (firstPartyError) {
    return NextResponse.json(
      { code: 403, message: firstPartyError },
      { status: 403 }
    );
  }

  const headers = buildStrictProxyCorsHeaders(request, {
    methods: ['GET', 'OPTIONS'],
  });
  headers.set('Access-Control-Max-Age', '86400');

  return new NextResponse(null, { status: 204, headers });
}
