import { NextRequest, NextResponse } from "next/server";
import { getSourceQualityRows } from "@/lib/vod-source-health";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { keys?: string[] };
    const keys = Array.isArray(body?.keys)
      ? body.keys.filter((key) => typeof key === "string" && key.trim())
      : [];
    if (!keys.length) {
      return NextResponse.json({ code: 200, message: "ok", data: [] });
    }
    const rows = await getSourceQualityRows(keys);
    const data = rows.map((row) => ({
      key: row.key,
      successRatePct: Math.round(row.successRate * 1000) / 10,
      avgFirstFrameMs: row.avgFirstFrameMs,
      stallCount: row.stallCount,
      autoSwitchCount: row.autoSwitchCount,
    }));
    return NextResponse.json({ code: 200, message: "ok", data });
  } catch (error) {
    return NextResponse.json(
      { code: 500, message: error instanceof Error ? error.message : "获取失败", data: null },
      { status: 500 }
    );
  }
}
