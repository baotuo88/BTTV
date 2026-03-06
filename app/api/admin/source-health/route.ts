import { NextRequest, NextResponse } from "next/server";
import { ensureAdminApiAuth } from "@/lib/api-auth";
import type { VodSource } from "@/types/drama";

interface SourceHealthResult {
  key: string;
  name: string;
  api: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
}

async function checkOneSource(source: VodSource): Promise<SourceHealthResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    // 多数 CMS 支持 ac=list&page=1，使用轻量探活
    const probeUrl = source.api.includes("?")
      ? `${source.api}&ac=list&pg=1`
      : `${source.api}?ac=list&pg=1`;

    const response = await fetch(probeUrl, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json,text/plain,*/*" },
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        key: source.key,
        name: source.name,
        api: source.api,
        ok: false,
        statusCode: response.status,
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    }

    // 尝试解析，避免“200 但返回异常页”
    const text = await response.text();
    const validPayload = text.trim().startsWith("{") || text.includes('"list"');
    return {
      key: source.key,
      name: source.name,
      api: source.api,
      ok: validPayload,
      statusCode: response.status,
      latencyMs,
      error: validPayload ? undefined : "响应内容异常",
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      key: source.key,
      name: source.name,
      api: source.api,
      ok: false,
      latencyMs,
      error: error instanceof Error ? error.message : "检测失败",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const authError = await ensureAdminApiAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const sources = Array.isArray(body?.sources) ? (body.sources as VodSource[]) : [];
    if (!sources.length) {
      return NextResponse.json(
        { code: 400, message: "请提供待检测的视频源", data: null },
        { status: 400 }
      );
    }

    const results = await Promise.all(sources.map((source) => checkOneSource(source)));
    const healthyCount = results.filter((item) => item.ok).length;

    return NextResponse.json({
      code: 200,
      message: "检测完成",
      data: {
        results,
        total: results.length,
        healthy: healthyCount,
        unhealthy: results.length - healthyCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : "检测失败",
        data: null,
      },
      { status: 500 }
    );
  }
}
