import { NextResponse } from 'next/server';
import { clearUserSession } from '@/lib/user-auth';

export async function POST() {
  try {
    await clearUserSession();
    return NextResponse.json({ code: 200, message: '登出成功', data: null });
  } catch {
    return NextResponse.json(
      { code: 500, message: '登出失败', data: null },
      { status: 500 }
    );
  }
}
