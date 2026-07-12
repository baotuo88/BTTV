import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, DramaListData, VodSource } from '@/types/drama';
import { searchDramaList } from '@/lib/drama-search';
import {
  applyJsonRateLimit,
  validateFirstPartyProxyRequest,
} from '@/lib/server/api-security';

export async function POST(request: NextRequest) {
  // 第一方来源校验：拒绝跨站/无来源请求
  const firstPartyError = validateFirstPartyProxyRequest(request);
  if (firstPartyError) {
    return NextResponse.json(
      { code: 403, message: firstPartyError, data: null },
      { status: 403 }
    );
  }

  // IP 限流：每 IP 每分钟最多 60 次，避免被刷爆上游源
  const rateLimitResponse = applyJsonRateLimit(request, {
    scope: 'drama:list',
    max: 60,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const source: VodSource = body.source;

    if (!source || !source.api) {
      return NextResponse.json<ApiResponse<DramaListData>>(
        {
          code: 400,
          msg: '缺少视频源信息',
          data: { list: [], page: 1, pagecount: 0, limit: 24, total: 0 },
        },
        { status: 400 }
      );
    }

    const data = await searchDramaList({
      source,
      keyword: body.keyword,
      type_id: body.type_id,
      page: body.page || '1',
      limit: body.limit || '24',
    });

    return NextResponse.json<ApiResponse<DramaListData>>({
      code: 200,
      msg: 'success',
      data,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[Drama API] 请求失败: ${errMsg}`);

    return NextResponse.json<ApiResponse<DramaListData>>(
      {
        code: 500,
        msg: '获取影视列表失败',
        data: { list: [], page: 1, pagecount: 1, limit: 24, total: 0 },
      },
      { status: 500 }
    );
  }
}
