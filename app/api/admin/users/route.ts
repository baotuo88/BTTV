import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { listUsers, removeUser, setUserDisabled } from '@/lib/user-auth';

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

// GET - 获取用户列表（支持关键字搜索）
export async function GET(request: NextRequest) {
  const authError = await ensureAdminAuth();
  if (authError) return authError;

  try {
    const keyword = request.nextUrl.searchParams.get('q') || '';
    const users = await listUsers(keyword);

    return NextResponse.json({
      code: 200,
      message: '获取成功',
      data: { users },
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : '获取用户列表失败',
        data: null,
      },
      { status: 500 }
    );
  }
}

// PATCH - 启用/禁用用户
export async function PATCH(request: NextRequest) {
  const authError = await ensureAdminAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const userId = String(body?.userId || '').trim();
    const { disabled } = body || {};

    if (!userId || typeof disabled !== 'boolean') {
      return NextResponse.json(
        { code: 400, message: '参数错误（需要 userId 和 disabled）', data: null },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(userId)) {
      return NextResponse.json(
        { code: 400, message: '用户 ID 无效', data: null },
        { status: 400 }
      );
    }

    await setUserDisabled(userId, disabled);

    return NextResponse.json({
      code: 200,
      message: disabled ? '用户已禁用' : '用户已启用',
      data: null,
    });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : '更新用户状态失败',
        data: null,
      },
      { status: 500 }
    );
  }
}

// DELETE - 删除用户
export async function DELETE(request: NextRequest) {
  const authError = await ensureAdminAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const userId = String(body?.userId || '').trim();

    if (!userId) {
      return NextResponse.json(
        { code: 400, message: '请提供 userId', data: null },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(userId)) {
      return NextResponse.json(
        { code: 400, message: '用户 ID 无效', data: null },
        { status: 400 }
      );
    }

    await removeUser(userId);

    return NextResponse.json({
      code: 200,
      message: '用户已删除',
      data: null,
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : '删除用户失败',
        data: null,
      },
      { status: 500 }
    );
  }
}
