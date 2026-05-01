import { NextRequest, NextResponse } from "next/server";
import { createSession, validatePassword } from "@/lib/auth";
import { isAdminPasswordConfigured } from "@/lib/admin-session";
import { applyJsonRateLimit } from "@/lib/server/api-security";

export async function POST(request: NextRequest) {
  const rateLimitResponse = applyJsonRateLimit(request, {
    scope: "auth:admin-login",
    max: 8,
    windowMs: 10 * 60_000,
    message: "登录尝试过于频繁，请 10 分钟后重试",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: '请输入密码' },
        { status: 400 }
      );
    }

    if (!isAdminPasswordConfigured()) {
      return NextResponse.json(
        { error: "管理员密码未配置，请先设置 ADMIN_PASSWORD" },
        { status: 503 }
      );
    }

    // 验证密码
    if (!validatePassword(password)) {
      return NextResponse.json(
        { error: '密码错误' },
        { status: 401 }
      );
    }

    // 创建会话
    await createSession();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: '登录失败' },
      { status: 500 }
    );
  }
}
