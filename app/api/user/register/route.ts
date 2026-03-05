import { NextRequest, NextResponse } from 'next/server';
import { createUserSession, registerUser, validateRegisterInput } from '@/lib/user-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body?.username || '');
    const email = String(body?.email || '');
    const password = String(body?.password || '');

    const error = validateRegisterInput(username, email, password);
    if (error) {
      return NextResponse.json({ code: 400, message: error, data: null }, { status: 400 });
    }

    const user = await registerUser(username, email, password);
    await createUserSession(user.id);

    return NextResponse.json({
      code: 200,
      message: '注册成功',
      data: { user },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败';
    return NextResponse.json(
      { code: 500, message, data: null },
      { status: message.includes('已') ? 400 : 500 }
    );
  }
}
