import { NextResponse } from "next/server";
import { ensureAdminApiAuth } from "@/lib/api-auth";
import {
  getSourceQualityRows,
  getSourceQualityTrends,
  resetSourceQualityMetrics,
} from "@/lib/vod-source-health";
import { getVodSourcesFromDB } from "@/lib/vod-sources-db";

export async function GET(request: Request) {
  const authError = await ensureAdminApiAuth();
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const windowDays = Number(url.searchParams.get("windowDays") || 7);
    const [rows, vodSources] = await Promise.all([
      getSourceQualityRows(),
      getVodSourcesFromDB(),
    ]);
    const nameMap = new Map(vodSources.map((source) => [source.key, source.name]));
    const data = rows.map((row) => ({
      ...row,
      name: nameMap.get(row.key) || row.key,
      successRatePct: Math.round(row.successRate * 1000) / 10,
    }));
    const trends = await getSourceQualityTrends(windowDays);

    return NextResponse.json({
      code: 200,
      message: "ok",
      data: {
        rows: data,
        trends,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { code: 500, message: error instanceof Error ? error.message : "获取失败", data: null },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const authError = await ensureAdminApiAuth();
  if (authError) return authError;
  try {
    await resetSourceQualityMetrics();
    return NextResponse.json({ code: 200, message: "重置成功", data: null });
  } catch (error) {
    return NextResponse.json(
      { code: 500, message: error instanceof Error ? error.message : "重置失败", data: null },
      { status: 500 }
    );
  }
}
