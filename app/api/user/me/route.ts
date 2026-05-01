import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/user-auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { code: 401, message: '未登录', data: null },
        { status: 401 }
      );
    }

    return NextResponse.json({
      code: 200,
      message: 'success',
      data: { user },
    });
  } catch {
    return NextResponse.json(
      { code: 500, message: '获取用户信息失败', data: null },
      { status: 500 }
    );
  }
}
