import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 缓存 1 小时

interface DailymotionVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  url: string;
  created_time?: string;
}

interface DailymotionChannel {
  name: string;
  handle: string;
  avatar: string;
  videos: DailymotionVideo[];
  hasMore?: boolean;
  total?: number;
  page?: number;
}

// GraphQL 响应类型
interface GraphQLVideoNode {
  id: string;
  xid: string;
  title: string;
  thumbnailx60: string;
  thumbnailx120: string;
  thumbnailx240: string;
  thumbnailx720: string;
  bestAvailableQuality: string;
  duration: number;
  createdAt: string;
}

interface GraphQLResponse {
  data: {
    channel: {
      id: string;
      xid: string;
      displayName?: string;
      avatarURL?: string;
      channel_videos_all_videos: {
        pageInfo: {
          hasNextPage: boolean;
          nextPage: number;
        };
        edges: Array<{
          node: GraphQLVideoNode;
        }>;
      };
    };
  };
}


// Dailymotion 用户名 / channel handle 只允许字母数字与常见分隔符，
// 用来阻止 `../` 之类字符切换到 dailymotion.com 上其它路径。
const DAILYMOTION_USERNAME_REGEX = /^[A-Za-z0-9_.-]{1,64}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const pageRaw = searchParams.get('page') || '1';
  const page = Number.parseInt(pageRaw, 10);

  if (!username) {
    return NextResponse.json(
      { error: 'Missing username parameter' },
      { status: 400 }
    );
  }

  if (!DAILYMOTION_USERNAME_REGEX.test(username)) {
    return NextResponse.json(
      { error: 'Invalid username format' },
      { status: 400 }
    );
  }

  if (!Number.isFinite(page) || page < 1 || page > 500) {
    return NextResponse.json(
      { error: 'Invalid page parameter' },
      { status: 400 }
    );
  }

  try {
    // 先尝试使用 REST API（无需认证）
    try {
      const channelData = await fetchChannelDataFromRestAPI(username, page);
      return NextResponse.json(channelData);
    } catch (restError) {
      console.warn('[Dailymotion] REST API 失败，尝试 GraphQL:', restError instanceof Error ? restError.message : restError);
      // 如果 REST API 失败，尝试 GraphQL
      const channelData = await fetchChannelDataFromGraphQL(username, page);

      if (!channelData.videos || channelData.videos.length === 0) {
        return NextResponse.json(
          { error: 'No videos found for this channel' },
          { status: 404 }
        );
      }

      return NextResponse.json(channelData);
    }
  } catch (error) {
    console.warn('[Dailymotion] 获取数据失败:', error instanceof Error ? error.message : error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Dailymotion data';
    return NextResponse.json(
      { error: errorMessage },
      { status: 502 }
    );
  }
}

interface RestAPIVideo {
  id: string;
  title: string;
  thumbnail_240_url: string;
  duration: number;
  created_time: number;
}

interface RestAPIVideosResponse {
  list: RestAPIVideo[];
  page: number;
  limit: number;
  has_more: boolean;
}

async function fetchChannelDataFromRestAPI(
  channelName: string,
  page: number = 1
): Promise<DailymotionChannel> {
  // 使用 Dailymotion REST API v1
  const limit = 30;
  
  // 获取用户信息
  const userResponse = await fetch(
    `https://api.dailymotion.com/user/${encodeURIComponent(channelName)}?fields=id,screenname,avatar_240_url`,
    { signal: AbortSignal.timeout(10_000) }
  );

  if (!userResponse.ok) {
    throw new Error(`Failed to fetch user: ${userResponse.status}`);
  }

  const userData = await userResponse.json();

  // 获取视频列表
  const videosResponse = await fetch(
    `https://api.dailymotion.com/user/${encodeURIComponent(channelName)}/videos?fields=id,title,thumbnail_240_url,duration,created_time&limit=${limit}&page=${page}`,
    { signal: AbortSignal.timeout(10_000) }
  );

  if (!videosResponse.ok) {
    throw new Error(`Failed to fetch videos: ${videosResponse.status}`);
  }
  
  const videosData: RestAPIVideosResponse = await videosResponse.json();
  
  const videos: DailymotionVideo[] = videosData.list.map((video: RestAPIVideo) => {
    const durationFormatted = formatDuration(video.duration);
    
    return {
      id: video.id,
      title: video.title,
      thumbnail: video.thumbnail_240_url,
      duration: durationFormatted,
      url: `https://www.dailymotion.com/video/${video.id}`,
      created_time: video.created_time.toString(),
    };
  });
  
  return {
    name: userData.screenname || channelName,
    handle: `@${channelName}`,
    avatar: userData.avatar_240_url || '',
    videos,
    hasMore: videosData.has_more,
    page: videosData.page,
    total: videosData.list.length, // REST API 不提供 total，只能返回当前页的数量
  };
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.DAILYMOTION_CLIENT_ID;
  const clientSecret = process.env.DAILYMOTION_CLIENT_SECRET;

  // 官方要求 client_credentials 必须带 client_id / client_secret，
  // 未配置时直接跳过 GraphQL，避免打空请求打爆响应时间
  if (!clientId || !clientSecret) {
    throw new Error('Dailymotion GraphQL 未配置 client_id/client_secret');
  }

  try {
    const response = await fetch('https://graphql.api.dailymotion.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[Dailymotion] OAuth token 请求失败:', response.status, errorText.slice(0, 200));
      throw new Error(`Failed to get access token: ${response.status}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('No access token in response');
    }

    return data.access_token;
  } catch (error) {
    console.warn('[Dailymotion] 获取 OAuth token 失败:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function fetchChannelDataFromGraphQL(
  channelName: string,
  page: number = 1
): Promise<DailymotionChannel> {
  // 先获取访问令牌
  const accessToken = await getAccessToken();

  const query = `query CHANNEL_VIDEOS_QUERY($channel_name: String!, $sort: String, $page: Int!, $allowExplicit: Boolean) {
  channel(name: $channel_name) {
    id
    xid
    displayName
    avatarURL(size: "x240")
    channel_videos_all_videos: videos(
      sort: $sort
      page: $page
      first: 30
      allowExplicit: $allowExplicit
    ) {
      pageInfo {
        hasNextPage
        nextPage
        __typename
      }
      edges {
        node {
          id
          xid
          title
          thumbnailx60: thumbnailURL(size: "x60")
          thumbnailx120: thumbnailURL(size: "x120")
          thumbnailx240: thumbnailURL(size: "x240")
          thumbnailx720: thumbnailURL(size: "x720")
          bestAvailableQuality
          duration
          createdAt
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}`;

  const variables = {
    channel_name: channelName,
    sort: 'recent',
    page: page,
    allowExplicit: false,
  };

  const response = await fetch('https://graphql.api.dailymotion.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Origin': 'https://www.dailymotion.com',
    },
    body: JSON.stringify({
      operationName: 'CHANNEL_VIDEOS_QUERY',
      variables,
      query,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('GraphQL error response:', errorText);
    throw new Error(`GraphQL request failed: ${response.status}`);
  }

  const data: GraphQLResponse = await response.json();

  if (!data.data?.channel) {
    throw new Error('Channel not found');
  }

  const channel = data.data.channel;
  const videos: DailymotionVideo[] = channel.channel_videos_all_videos.edges.map(
    (edge) => {
      const node = edge.node;
      const durationFormatted = formatDuration(node.duration);
      
      return {
        id: node.xid,
        title: node.title,
        thumbnail: node.thumbnailx240 || node.thumbnailx720 || node.thumbnailx120,
        duration: durationFormatted,
        url: `https://www.dailymotion.com/video/${node.xid}`,
        created_time: node.createdAt,
      };
    }
  );

  const pageInfo = channel.channel_videos_all_videos.pageInfo;

  return {
    name: channel.displayName || channelName,
    handle: `@${channelName}`,
    avatar: channel.avatarURL || '',
    videos,
    hasMore: pageInfo.hasNextPage,
    page: page,
    total: videos.length, // GraphQL 不提供 total count
  };
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
