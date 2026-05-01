import useSWR from "swr";
import type { SiteConfigData } from "@/types/site-config";

const FALLBACK_SITE_NAME =
  process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "宝拓影视";
const FALLBACK_SITE_TITLE =
  process.env.NEXT_PUBLIC_SITE_TITLE?.trim() ||
  `${FALLBACK_SITE_NAME} - 免费影视在线观看`;
const FALLBACK_SITE_DESCRIPTION =
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION?.trim() ||
  "宝拓影视 - 免费观看最新热门影视剧集，海量高清资源在线播放，支持多集连播";

const FALLBACK_CONFIG: SiteConfigData = {
  siteName: FALLBACK_SITE_NAME,
  siteTitle: FALLBACK_SITE_TITLE,
  siteDescription: FALLBACK_SITE_DESCRIPTION,
};

interface SiteConfigApiResponse {
  code: number;
  message: string;
  data: SiteConfigData | null;
}

const fetcher = async (url: string): Promise<SiteConfigApiResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.json() as Promise<SiteConfigApiResponse>;
};

export function useSiteConfig(): SiteConfigData {
  const { data } = useSWR("/api/site-config", fetcher, {
    revalidateOnFocus: false,
  });

  if (data?.code === 200 && data.data) {
    return data.data;
  }

  return FALLBACK_CONFIG;
}
