import { Drama, DramaListData, VodSource } from '@/types/drama';

// ---- 内部类型 ----

interface DramaListItem {
  vod_id: number | string;
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
  page: number;
  pagecount: number;
  limit: number;
  total: number;
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

function formatDramaList(list: DramaListItem[]): Drama[] {
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
    tags: item.vod_class ? item.vod_class.split(',').map((tag) => tag.trim()) : [],
    vod_class: item.vod_class || '',
  }));
}

// ---- 对外函数 ----

export interface SearchDramaOptions {
  source: VodSource;
  keyword?: string;
  type_id?: string;
  page?: number | string;
  limit?: number | string;
  timeoutMs?: number;
}

/**
 * 直接从视频源获取影视列表，返回 DramaListData。
 * 抽自旧 /api/drama/list POST 处理函数，避免服务端自己 HTTP 调自己触发 fan-out。
 */
export async function searchDramaList(
  options: SearchDramaOptions
): Promise<DramaListData> {
  const { source, keyword, type_id, page = '1', limit = '24', timeoutMs = 15000 } = options;

  const emptyResult: DramaListData = {
    list: [],
    page: parseInt(String(page)) || 1,
    pagecount: 0,
    limit: parseInt(String(limit)) || 24,
    total: 0,
  };

  let response: Response;

  if (source.searchProxy && keyword) {
    response = await fetch(source.searchProxy, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        api: source.api,
        keyword,
        page: parseInt(String(page)) || 1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } else {
    const apiParams: Record<string, string> = {
      ac: 'detail',
      pg: String(page),
    };
    if (type_id) apiParams.t = type_id;
    if (keyword) apiParams.wd = keyword;

    const queryString = new URLSearchParams(apiParams).toString();
    const apiUrl = `${source.api}?${queryString}`;

    response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const responseText = await response.text();

  // XML/HTML 响应 -> 空结果
  if (
    responseText.startsWith('<?xml') ||
    responseText.startsWith('<!DOCTYPE') ||
    responseText.startsWith('<html')
  ) {
    return emptyResult;
  }

  let parsedData: unknown;
  try {
    parsedData = JSON.parse(responseText);
  } catch {
    return emptyResult;
  }

  if (source.searchProxy && keyword && isProxyResponse(parsedData)) {
    if (!parsedData.success) return emptyResult;
    return {
      list: formatDramaList(parsedData.data || []),
      page: parseInt(String(page)) || 1,
      pagecount: 1,
      limit: parseInt(String(limit)) || 24,
      total: parsedData.data?.length || 0,
    };
  }

  if (isStandardResponse(parsedData)) {
    if (parsedData.code !== 1) return emptyResult;
    return {
      list: formatDramaList(parsedData.list || []),
      page: parseInt(String(page)) || 1,
      pagecount: parsedData.pagecount || 1,
      limit: parseInt(String(limit)) || 24,
      total: parsedData.total || 0,
    };
  }

  return emptyResult;
}
