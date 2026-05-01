import { NextRequest, NextResponse } from 'next/server';
import { createUserSession, loginUser } from '@/lib/user-auth';
import { applyJsonRateLimit } from '@/lib/server/api-security';

export async function POST(request: NextRequest) {
  const rateLimitResponse = applyJsonRateLimit(request, {
    scope: 'auth:user-login',
    max: 12,
    windowMs: 10 * 60_000,
    message: '登录尝试过于频繁，请稍后重试',
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const account = String(body?.account || '');
    const password = String(body?.password || '');

    if (!account || !password) {
      return NextResponse.json(
        { code: 400, message: '请输入账号和密码', data: null },
        { status: 400 }
      );
    }

    const user = await loginUser(account, password);
    await createUserSession(user.id);

    return NextResponse.json({
      code: 200,
      message: '登录成功',
      data: { user },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败';
    return NextResponse.json(
      { code: 401, message, data: null },
      { status: 401 }
    );
  }
}
