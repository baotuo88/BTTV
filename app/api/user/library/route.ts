import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-auth";
import {
  ensureLibraryType,
  listUserLibraryItems,
  removeUserLibraryItem,
  upsertUserLibraryItem,
} from "@/lib/user-library";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { code: 401, message: "未登录或会话已过期", data: null },
        { status: 401 }
      );
    }

    const typeParam = request.nextUrl.searchParams.get("type") || "";
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || "100");
    const listType = typeParam ? ensureLibraryType(typeParam) : undefined;
    const items = await listUserLibraryItems(user.id, listType, limitParam);

    return NextResponse.json({
      code: 200,
      message: "success",
      data: { items },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取清单失败";
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
    const listType = ensureLibraryType(String(body?.listType || ""));
    const itemId = String(body?.itemId || "").trim();
    const title = String(body?.title || "").trim();
    const cover = String(body?.cover || "");
    const mediaType = String(body?.mediaType || "");
    const sourceKey = String(body?.sourceKey || "");
    const sourceName = String(body?.sourceName || "");

    if (!itemId || !title) {
      return NextResponse.json(
        { code: 400, message: "缺少 itemId 或 title", data: null },
        { status: 400 }
      );
    }

    await upsertUserLibraryItem({
      userId: user.id,
      listType,
      itemId,
      title,
      cover,
      mediaType,
      sourceKey,
      sourceName,
    });

    return NextResponse.json({
      code: 200,
      message: "已加入清单",
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "添加失败";
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
    const listType = ensureLibraryType(String(body?.listType || ""));
    const itemId = String(body?.itemId || "").trim();
    if (!itemId) {
      return NextResponse.json(
        { code: 400, message: "缺少 itemId", data: null },
        { status: 400 }
      );
    }

    await removeUserLibraryItem(user.id, listType, itemId);
    return NextResponse.json({
      code: 200,
      message: "已移除",
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "移除失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}
