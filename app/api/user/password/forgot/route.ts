import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/user-password-reset";
import { applyJsonRateLimit } from "@/lib/server/api-security";

export async function POST(request: NextRequest) {
  const rateLimitResponse = applyJsonRateLimit(request, {
    scope: "auth:password-forgot",
    max: 6,
    windowMs: 10 * 60_000,
    message: "请求过于频繁，请稍后再试",
  });
  if (rateLimitResponse) return rateLimitResponse;

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
