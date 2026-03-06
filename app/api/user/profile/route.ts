import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, updateUserProfileUsername } from "@/lib/user-auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { code: 401, message: "未登录或会话已过期", data: null },
        { status: 401 }
      );
    }

    return NextResponse.json({
      code: 200,
      message: "success",
      data: { user },
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : "获取个人资料失败",
        data: null,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { code: 401, message: "未登录或会话已过期", data: null },
        { status: 401 }
      );
    }

    const body = await request.json();
    const username = String(body?.username || "");
    const user = await updateUserProfileUsername(currentUser.id, username);

    return NextResponse.json({
      code: 200,
      message: "资料已更新",
      data: { user },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新资料失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}
