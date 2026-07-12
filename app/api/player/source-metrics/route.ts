import { NextRequest, NextResponse } from "next/server";
import { recordSourcePlaybackMetric } from "@/lib/vod-source-health";
import type { SourcePlaybackMetricEvent } from "@/types/vod-source-health";

function isValidEventType(eventType: string): boolean {
  return (
    eventType === "first_frame" ||
    eventType === "playback_success" ||
    eventType === "stall" ||
    eventType === "auto_switch" ||
    eventType === "retry"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      events?: Array<{ key?: string; eventType?: string; valueMs?: number }>;
    };
    const rawEvents = Array.isArray(body?.events) ? body.events : [];

    const events: SourcePlaybackMetricEvent[] = rawEvents
      .filter((event) => event?.key && event?.eventType && isValidEventType(event.eventType))
      .map((event) => ({
        key: String(event.key),
        eventType: event.eventType as SourcePlaybackMetricEvent["eventType"],
        valueMs: Number.isFinite(event.valueMs) ? Number(event.valueMs) : undefined,
      }));

    if (!events.length) {
      return NextResponse.json(
        { code: 400, message: "无有效埋点事件", data: null },
        { status: 400 }
      );
    }

    await recordSourcePlaybackMetric(events);
    return NextResponse.json({ code: 200, message: "ok", data: { count: events.length } });
  } catch (error) {
    return NextResponse.json(
      { code: 500, message: error instanceof Error ? error.message : "上报失败", data: null },
      { status: 500 }
    );
  }
}
