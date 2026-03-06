import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-auth";
import { getUserLibraryStatus } from "@/lib/user-library";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { code: 401, message: "未登录或会话已过期", data: null },
        { status: 401 }
      );
    }

    const itemId = String(request.nextUrl.searchParams.get("itemId") || "").trim();
    if (!itemId) {
      return NextResponse.json(
        { code: 400, message: "缺少 itemId", data: null },
        { status: 400 }
      );
    }

    const status = await getUserLibraryStatus(user.id, itemId);
    return NextResponse.json({
      code: 200,
      message: "success",
      data: { status },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取状态失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}
