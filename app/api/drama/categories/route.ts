import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Category } from '@/types/drama';
import { ensurePlaybackApiAuth } from '@/lib/api-auth';
import { assertSafeVodSource } from '@/lib/server/vod-source-security';

interface CategoryResponse {
  code: number;
  msg?: string;
  class?: Array<{
    type_id: number | string;
    type_name: string;
    type_pid?: number | string;
  }>;
}

export async function POST(request: NextRequest) {
  const playbackAuthError = await ensurePlaybackApiAuth();
  if (playbackAuthError) return playbackAuthError;

  try {
    const body = await request.json();

    try {
      await assertSafeVodSource(body?.source);
    } catch (err) {
      return NextResponse.json<ApiResponse<Category[]>>(
        {
          code: 400,
          msg: err instanceof Error ? err.message : '视频源地址不合法',
          data: [],
        },
        { status: 400 }
      );
    }

    // 构建API请求参数
    const apiParams = new URLSearchParams({
      ac: 'list',
    });

    const apiUrl = `${body.source.api}?${apiParams.toString()}`;

    // 调用影视API获取分类
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error('API请求失败');
    }

    const data: CategoryResponse = await response.json();

    if (data.code !== 1 || !data.class) {
      throw new Error('获取分类失败');
    }

    // 格式化分类数据
    const categories: Category[] = data.class.map((item) => ({
      id: item.type_id,
      name: item.type_name,
      icon: 'fas fa-film',
      count: 0,
    }));

    const result: ApiResponse<Category[]> = {
      code: 200,
      msg: 'success',
      data: categories,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Categories API error:', error);

    const errorResult: ApiResponse<Category[]> = {
      code: 500,
      msg: '获取分类失败',
      data: [],
    };

    return NextResponse.json(errorResult, { status: 500 });
  }
}
