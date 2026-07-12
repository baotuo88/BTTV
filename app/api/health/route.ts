import { NextResponse } from 'next/server';
import { getDatabase, isLocalStorageMode } from '@/lib/db';

/**
 * 健康检查 API
 * GET /api/health
 * 
 * 用于 Docker 容器健康检查和监控
 */
export async function GET() {
  const status: {
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    services: {
      api: 'ok';
      mongodb?: 'ok' | 'error';
      storage?: 'local' | 'error';
    };
    errors?: string[];
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      api: 'ok'
    }
  };

  const errors: string[] = [];

  if (isLocalStorageMode()) {
    try {
      const db = await getDatabase();
      await db.admin().ping();
      status.services.storage = 'local';
    } catch (error) {
      status.services.storage = 'error';
      errors.push(`Local storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 检查 MongoDB 连接
  if (!isLocalStorageMode() && process.env.MONGODB_URI) {
    try {
      const db = await getDatabase();
      await db.admin().ping();
      status.services.mongodb = 'ok';
    } catch (error) {
      status.services.mongodb = 'error';
      errors.push(`MongoDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 设置总体状态
  if (errors.length > 0) {
    status.status = 'degraded';
    status.errors = errors;
  }

  const httpStatus = status.status === 'ok' ? 200 : 503;

  return NextResponse.json(status, { status: httpStatus });
}
