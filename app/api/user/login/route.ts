import { NextRequest, NextResponse } from 'next/server';
import { createUserSession, loginUser } from '@/lib/user-auth';

export async function POST(request: NextRequest) {
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
