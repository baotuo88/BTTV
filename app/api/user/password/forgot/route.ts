import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/user-password-reset";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { code: 400, message: "请输入邮箱", data: null },
        { status: 400 }
      );
    }

    await requestPasswordReset(email);
    return NextResponse.json({
      code: 200,
      message: "如果邮箱已注册，验证码已发送（请检查收件箱或垃圾箱）",
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "发送失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}
