import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { resetUserPassword } from '@/lib/user-auth';

async function ensureAdminAuth() {
  const authenticated = await validateSession();
  if (!authenticated) {
    return NextResponse.json(
      { code: 401, message: '未登录或会话已过期', data: null },
      { status: 401 }
    );
  }
  return null;
}

// POST - 重置用户密码
export async function POST(request: NextRequest) {
  const authError = await ensureAdminAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const userId = String(body?.userId || '').trim();
    const newPassword = String(body?.newPassword || '');

    if (!userId || !newPassword) {
      return NextResponse.json(
        { code: 400, message: '请提供 userId 和 newPassword', data: null },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(userId)) {
      return NextResponse.json(
        { code: 400, message: '用户 ID 无效', data: null },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { code: 400, message: '密码至少 6 位', data: null },
        { status: 400 }
      );
    }

    await resetUserPassword(userId, newPassword);

    return NextResponse.json({
      code: 200,
      message: '密码已重置，用户需重新登录',
      data: null,
    });
  } catch (error) {
    console.error('重置用户密码失败:', error);
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : '重置用户密码失败',
        data: null,
      },
      { status: 500 }
    );
  }
}
