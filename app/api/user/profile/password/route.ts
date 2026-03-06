import { NextRequest, NextResponse } from "next/server";
import { changeOwnPassword, getCurrentUser } from "@/lib/user-auth";

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { code: 401, message: "未登录或会话已过期", data: null },
        { status: 401 }
      );
    }

    const body = await request.json();
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");
    await changeOwnPassword(currentUser.id, currentPassword, newPassword);

    return NextResponse.json({
      code: 200,
      message: "密码已更新",
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "修改密码失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}
