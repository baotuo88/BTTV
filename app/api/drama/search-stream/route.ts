import { NextRequest } from 'next/server';
import { getVodSourcesFromDB } from '@/lib/vod-sources-db';
import { VodSource } from '@/types/drama';
import {
  recordSourceProbeResults,
  sortVodSourcesByHealth,
} from '@/lib/vod-source-health';

interface DramaListItem {
  vod_id: number;
  vod_name: string;
  vod_pic?: string;
  vod_remarks?: string;
  type_name?: string;
  vod_time?: string;
  vod_play_from?: string;
  vod_sub?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_area?: string;
  vod_year?: string;
  vod_score?: string;
  vod_total?: number;
  vod_blurb?: string;
  vod_class?: string;
}

interface DramaListResponse {
  code: number;
  msg: string;
  list: DramaListItem[];
}

interface ProxySearchResponse {
  success: boolean;
  message: string;
  data: DramaListItem[];
}

function isProxyResponse(data: unknown): data is ProxySearchResponse {
  return typeof data === 'object' && data !== null && 'success' in data && 'data' in data;
}

function isStandardResponse(data: unknown): data is DramaListResponse {
  return typeof data === 'object' && data !== null && 'code' in data && 'list' in data;
}

function formatDramaList(list: DramaListItem[], source: VodSource) {
  return list.map((item) => ({
    id: item.vod_id,
    name: item.vod_name,
    subName: item.vod_sub || '',
    pic: item.vod_pic || '',
    remarks: item.vod_remarks || '',
    type: item.type_name || '影视',
    time: item.vod_time || '',
    playFrom: item.vod_play_from || '',
    actor: item.vod_actor || '',
    director: item.vod_director || '',
    area: item.vod_area || '',
    year: item.vod_year || '',
    score: item.vod_score || '0.0',
    total: item.vod_total || 0,
    blurb: item.vod_blurb || '',
    tags: item.vod_class ? item.vod_class.split(',').map((tag: string) => tag.trim()) : [],
    vod_class: item.vod_class || '',
    source: source,
  }));
}

// 搜索单个源
async function searchSingleSource(source: VodSource, keyword: string) {
  const start = Date.now();
  try {
    let response: Response;

    // 如果有搜索代理，使用 POST 请求
    if (source.searchProxy) {
      response = await fetch(source.searchProxy, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({
          api: source.api,
          keyword: keyword,
          page: 1,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      // 标准 GET 请求
      const apiParams = new URLSearchParams({
        ac: 'detail',
        pg: '1',
        wd: keyword,
      });
      
      const apiUrl = `${source.api}?${apiParams.toString()}`;
      
      response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
    }

    if (!response.ok) {
      return {
        source,
        results: [],
        error: 'API请求失败',
        latencyMs: Date.now() - start,
        statusCode: response.status,
      };
    }

    const data: unknown = await response.json();

    // 处理代理 API 响应格式
    if (source.searchProxy && isProxyResponse(data)) {
      if (!data.success) {
        return {
          source,
          results: [],
          error: data.message || '搜索失败',
          latencyMs: Date.now() - start,
          statusCode: response.status,
        };
      }
      const formattedList = formatDramaList(data.data || [], source);
      return {
        source,
        results: formattedList,
        error: null,
        latencyMs: Date.now() - start,
        statusCode: response.status,
      };
    }

    // 处理标准 API 响应格式
    if (isStandardResponse(data)) {
      if (data.code !== 1) {
        return {
          source,
          results: [],
          error: data.msg || '未知错误',
          latencyMs: Date.now() - start,
          statusCode: response.status,
        };
      }
      const formattedList = formatDramaList(data.list || [], source);
      return {
        source,
        results: formattedList,
        error: null,
        latencyMs: Date.now() - start,
        statusCode: response.status,
      };
    }

    return {
      source,
      results: [],
      error: '无法解析响应格式',
      latencyMs: Date.now() - start,
      statusCode: response.status,
    };
  } catch (error) {
    return { 
      source, 
      results: [], 
      error: error instanceof Error ? error.message : '搜索失败',
      latencyMs: Date.now() - start,
    };
  }
}

// 流式搜索 API - 使用 Server-Sent Events
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const keyword = searchParams.get('q');

  if (!keyword) {
    return new Response(JSON.stringify({ error: '缺少搜索关键词' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 获取所有视频源
  const allSources = await getVodSourcesFromDB();
  const orderedSources = await sortVodSourcesByHealth(allSources);
  
  if (orderedSources.length === 0) {
    return new Response(JSON.stringify({ error: '未配置视频源' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 创建 ReadableStream 实现流式响应
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // 发送初始信息
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ 
          type: 'init', 
          totalSources: orderedSources.length,
          sources: orderedSources.map((s, index) => ({
            key: s.key,
            name: s.name,
            rank: index + 1,
          })),
        })}\n\n`
      ));

      // 并行搜索所有源，但每个完成就立即推送
      const searchPromises = orderedSources.map(async (source) => {
        const result = await searchSingleSource(source, keyword);
        
        // 每个源完成后立即推送结果
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'result',
            sourceKey: source.key,
            sourceName: source.name,
            count: result.results.length,
            results: result.results,
            error: result.error,
          })}\n\n`
        ));
        
        return result;
      });

      // 等待所有搜索完成
      const settled = await Promise.all(searchPromises);
      try {
        await recordSourceProbeResults(
          settled.map((item) => ({
            key: item.source.key,
            ok: !item.error,
            latencyMs: item.latencyMs || 0,
            statusCode: item.statusCode,
            error: item.error || undefined,
          }))
        );
      } catch (error) {
        console.warn("记录视频源健康状态失败:", error);
      }

      // 发送完成信号
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: 'done' })}\n\n`
      ));
      
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
