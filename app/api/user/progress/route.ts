import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-auth";
import {
  getUserProgressByDrama,
  listUserProgress,
  removeUserProgress,
  upsertUserProgress,
} from "@/lib/user-progress";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { code: 401, message: "未登录或会话已过期", data: null },
        { status: 401 }
      );
    }

    const dramaId = String(request.nextUrl.searchParams.get("dramaId") || "").trim();
    const sourceKey = String(request.nextUrl.searchParams.get("sourceKey") || "").trim();
    const limit = Number(request.nextUrl.searchParams.get("limit") || "50");

    if (dramaId) {
      const item = await getUserProgressByDrama(user.id, dramaId, sourceKey);
      return NextResponse.json({
        code: 200,
        message: "success",
        data: { item },
      });
    }

    const items = await listUserProgress(user.id, limit);
    return NextResponse.json({
      code: 200,
      message: "success",
      data: { items },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取进度失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { code: 401, message: "未登录或会话已过期", data: null },
        { status: 401 }
      );
    }

    const body = await request.json();
    const dramaId = String(body?.dramaId || "").trim();
    const dramaName = String(body?.dramaName || "").trim();
    const episodeIndex = Number(body?.episodeIndex);
    const positionSeconds = Number(body?.positionSeconds || 0);

    if (!dramaId || !dramaName || Number.isNaN(episodeIndex)) {
      return NextResponse.json(
        { code: 400, message: "缺少必要参数", data: null },
        { status: 400 }
      );
    }

    await upsertUserProgress({
      userId: user.id,
      dramaId,
      dramaName,
      cover: String(body?.cover || ""),
      sourceKey: String(body?.sourceKey || ""),
      sourceName: String(body?.sourceName || ""),
      episodeIndex,
      episodeName: String(body?.episodeName || ""),
      positionSeconds: Number.isNaN(positionSeconds) ? 0 : positionSeconds,
      durationSeconds: Number(body?.durationSeconds || 0),
    });

    return NextResponse.json({
      code: 200,
      message: "进度已同步",
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步进度失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { code: 401, message: "未登录或会话已过期", data: null },
        { status: 401 }
      );
    }

    const body = await request.json();
    const dramaId = String(body?.dramaId || "").trim();
    const sourceKey = String(body?.sourceKey || "").trim();
    if (!dramaId) {
      return NextResponse.json(
        { code: 400, message: "缺少 dramaId", data: null },
        { status: 400 }
      );
    }

    await removeUserProgress(user.id, dramaId, sourceKey);
    return NextResponse.json({
      code: 200,
      message: "已删除进度",
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除进度失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}
