import { NextRequest } from 'next/server';
import { getVodSourcesFromDB } from '@/lib/vod-sources-db';
import { VodSource } from '@/types/drama';
import { recordSourceProbeResults, sortVodSourcesByHealth } from '@/lib/vod-source-health';

interface VodItem {
  id: string | number;
  name: string;
  type_name?: string;
  year?: string | number;
  area?: string;
  remarks?: string;
}

interface MatchResult {
  source_key: string;
  source_name: string;
  vod_id: string | number;
  vod_name: string;
  match_confidence: 'high' | 'medium' | 'low';
  priority: number; // 实际选源优先级（越小越优先）
  source_priority: number; // 配置优先级
}

interface SearchSingleSourceResult {
  match: MatchResult | null;
  probe: {
    key: string;
    ok: boolean;
    latencyMs: number;
    statusCode?: number;
    error?: string;
  };
}

// 计算匹配置信度
function getMatchConfidence(vodName: string, title: string): 'high' | 'medium' | 'low' {
  const normalizedVodName = vodName.toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().trim();
  
  if (normalizedVodName === normalizedTitle) {
    return 'high';
  }
  
  if (normalizedVodName.includes(normalizedTitle) || normalizedTitle.includes(normalizedVodName)) {
    return 'medium';
  }
  
  return 'low';
}

// 搜索单个视频源
async function searchSingleSource(
  origin: string,
  source: VodSource,
  effectivePriority: number,
  title: string,
  cookieHeader?: string
): Promise<SearchSingleSourceResult> {
  const start = Date.now();
  try {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    // 使用 POST 请求，传递完整的 source 对象
    const response = await fetch(`${origin}/api/drama/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: source,
        page: 1,
        limit: 20,
        keyword: title,
      }),
      signal: AbortSignal.timeout(10000), // 10秒超时
    });
    
    if (!response.ok) {
      return {
        match: null,
        probe: {
          key: source.key,
          ok: false,
          latencyMs: Date.now() - start,
          statusCode: response.status,
          error: `HTTP ${response.status}`,
        },
      };
    }
    
    const result = await response.json();
    
    if (result.code === 200 && result.data?.list?.length > 0) {
      // 查找最匹配的结果
      const list: VodItem[] = result.data.list;
      
      // 优先精确匹配
      let bestMatch = list.find(item => 
        item.name.toLowerCase().trim() === title.toLowerCase().trim()
      );
      
      // 其次包含匹配
      if (!bestMatch) {
        bestMatch = list.find(item =>
          item.name.toLowerCase().includes(title.toLowerCase()) ||
          title.toLowerCase().includes(item.name.toLowerCase())
        );
      }
      
      // 使用第一个结果
      if (!bestMatch && list.length > 0) {
        bestMatch = list[0];
      }
      
      if (bestMatch) {
        return {
          match: {
            source_key: source.key,
            source_name: source.name,
            vod_id: bestMatch.id,
            vod_name: bestMatch.name,
            match_confidence: getMatchConfidence(bestMatch.name, title),
            priority: effectivePriority,
            source_priority: source.priority ?? 999,
          },
          probe: {
            key: source.key,
            ok: true,
            latencyMs: Date.now() - start,
            statusCode: response.status,
          },
        };
      }
    }
    
    return {
      match: null,
      probe: {
        key: source.key,
        ok: true,
        latencyMs: Date.now() - start,
        statusCode: response.status,
      },
    };
  } catch (error) {
    return {
      match: null,
      probe: {
        key: source.key,
        ok: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : '搜索失败',
      },
    };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const title = searchParams.get('title');
  const doubanId = searchParams.get('douban_id');
  
  if (!title) {
    return new Response('Missing title parameter', { status: 400 });
  }
  
  // 获取所有视频源
  const allSources = await getVodSourcesFromDB();
  const orderedSources = await sortVodSourcesByHealth(allSources);
  
  if (orderedSources.length === 0) {
    return new Response('No video sources configured', { status: 404 });
  }
  
  const origin = request.nextUrl.origin;
  const cookieHeader = request.headers.get('cookie') || '';
  
  // 创建 SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 发送初始化信息
      const initData = {
        type: 'init',
        doubanId,
        title,
        totalSources: orderedSources.length,
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initData)}\n\n`));
      
      console.log(`\n🔍 开始流式搜索视频源: ${title}`);
      
      let completedCount = 0;
      let foundCount = 0;
      
      // 并行搜索所有源，但每个完成后立即发送结果
      const probeResults: SearchSingleSourceResult['probe'][] = [];
      const promises = orderedSources.map(async (source, index) => {
        try {
          const searchResult = await searchSingleSource(
            origin,
            source,
            index,
            title,
            cookieHeader
          );
          probeResults.push(searchResult.probe);
          completedCount++;
          
          if (searchResult.match) {
            foundCount++;
            console.log(`  ✅ ${source.name} 找到: ${searchResult.match.vod_name}`);
          } else {
            console.log(`  ❌ ${source.name} 未找到`);
          }
          
          // 发送单个源的结果
          const resultData = {
            type: 'result',
            sourceKey: source.key,
            sourceName: source.name,
            match: searchResult.match,
            completed: completedCount,
            total: orderedSources.length,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
        } catch (error) {
          completedCount++;
          console.error(`  ❌ ${source.name} 搜索出错:`, error);
          probeResults.push({
            key: source.key,
            ok: false,
            latencyMs: 0,
            error: error instanceof Error ? error.message : '搜索失败',
          });
          
          // 发送错误结果
          const errorData = {
            type: 'result',
            sourceKey: source.key,
            sourceName: source.name,
            match: null,
            completed: completedCount,
            total: orderedSources.length,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
        }
      });
      
      // 等待所有搜索完成
      await Promise.all(promises);
      try {
        await recordSourceProbeResults(probeResults);
      } catch (error) {
        console.warn("记录流式匹配健康状态失败:", error);
      }
      
      console.log(`\n📊 搜索完成: 找到 ${foundCount} 个可用源\n`);
      
      // 发送完成信号
      const doneData = {
        type: 'done',
        totalSources: orderedSources.length,
        foundCount,
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`));
      
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
