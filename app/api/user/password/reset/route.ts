import { NextRequest, NextResponse } from "next/server";
import { resetPasswordByCode } from "@/lib/user-password-reset";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "");
    const code = String(body?.code || "");
    const newPassword = String(body?.newPassword || "");

    await resetPasswordByCode(email, code, newPassword);

    return NextResponse.json({
      code: 200,
      message: "密码重置成功，请使用新密码登录",
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "密码重置失败";
    return NextResponse.json(
      { code: 400, message, data: null },
      { status: 400 }
    );
  }
}
