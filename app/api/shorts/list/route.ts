import { NextRequest, NextResponse } from "next/server";
import { getShortsSourcesFromDB, getShortsSourceByKey } from "@/lib/shorts-sources-db";
import type { ShortDramaSource } from "@/types/shorts-source";
import { ensurePlaybackApiAuth } from "@/lib/api-auth";
import { applyJsonRateLimit } from "@/lib/server/api-security";
import { assertSafeSourceApi } from "@/lib/server/vod-source-security";

export interface ShortDrama {
  vod_id: number;
  vod_name: string;
  vod_pic: string;
  vod_remarks: string;
  vod_time: string;
  type_name: string;
}

interface ShortDramaApiItem {
  vod_id: number;
  vod_name: string;
  vod_pic?: string;
  vod_remarks?: string;
  vod_time?: string;
  type_name?: string;
}

interface ShortDramaApiResponse {
  page: number;
  pagecount: number;
  total: number;
  list: ShortDramaApiItem[];
}

export interface ShortsListResponse {
  code: number;
  msg: string;
  page: number;
  pagecount: number;
  total: number;
  list: ShortDrama[];
  source: string;
  sources: { key: string; name: string }[];
}

export async function GET(request: NextRequest) {
  const playbackAuthError = await ensurePlaybackApiAuth();
  if (playbackAuthError) return playbackAuthError;

  const rateLimitResponse = applyJsonRateLimit(request, {
    scope: "shorts:list",
    max: 60,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const pageRaw = searchParams.get("pg") || "1";
    const pageNum = Number.parseInt(pageRaw, 10);
    if (!Number.isFinite(pageNum) || pageNum < 1 || pageNum > 500) {
      return NextResponse.json(
        { code: 400, msg: "分页参数不合法", data: null },
        { status: 400 }
      );
    }
    const page = String(pageNum);
    const sourceKey = searchParams.get("source");

    // 从数据库获取短剧源配置
    let sources: ShortDramaSource[];
    try {
      sources = await getShortsSourcesFromDB();
    } catch {
      sources = [];
    }

    // 如果没有配置短剧源，返回错误
    if (sources.length === 0) {
      return NextResponse.json(
        { code: 404, msg: "暂未配置短剧源，请先在后台添加短剧源", data: null },
        { status: 404 }
      );
    }

    // 获取指定的资源站配置，默认使用第一个
    let source: ShortDramaSource | null = null;
    
    if (sourceKey) {
      try {
        source = await getShortsSourceByKey(sourceKey);
      } catch {
        source = sources.find(s => s.key === sourceKey) || null;
      }
    }

    // 如果没有找到指定的源，使用第一个
    if (!source) {
      source = sources[0];
    }

    // 校验源地址是否安全（防止历史数据里塞入内网 / 本机地址）
    try {
      await assertSafeSourceApi(source.api);
    } catch (err) {
      console.warn(`[shorts/list] 短剧源 ${source.key} 地址不安全:`, err instanceof Error ? err.message : err);
      return NextResponse.json(
        { code: 400, msg: "短剧源地址不合法", data: null },
        { status: 400 }
      );
    }

    // 构建 API URL
    let apiUrl = `${source.api}?pg=${page}`;
    if (source.typeId) {
      apiUrl += `&t=${source.typeId}`;
    }

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 300 }, // 5分钟缓存
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = (await response.json()) as ShortDramaApiResponse;

    return NextResponse.json({
      code: 200,
      msg: "success",
      data: {
        page: data.page,
        pagecount: data.pagecount,
        total: data.total,
        list: data.list.map((item) => ({
          vod_id: item.vod_id,
          vod_name: item.vod_name,
          vod_pic: item.vod_pic || "",
          vod_remarks: item.vod_remarks || "",
          vod_time: item.vod_time || "",
          type_name: item.type_name || "",
        })),
        source: source.key,
        sources: sources.map(s => ({ key: s.key, name: s.name })),
      },
    });
  } catch (error) {
    console.error("[Shorts List API Error]", error);
    return NextResponse.json(
      { code: 500, msg: "获取短剧列表失败", data: null },
      { status: 500 }
    );
  }
}
