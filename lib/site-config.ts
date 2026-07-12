import "server-only";

import { getDatabase } from "@/lib/db";
import { COLLECTIONS } from "@/lib/constants/db";
import type { SiteConfigData } from "@/types/site-config";

interface SiteConfigDocument {
  id: 1;
  siteName: string;
  siteTitle: string;
  siteDescription: string;
  updatedAt: Date;
}

const FALLBACK_SITE_NAME = "宝拓影视";
const FALLBACK_SITE_TITLE_SUFFIX = "免费影视在线观看";
const FALLBACK_SITE_DESCRIPTION =
  "宝拓影视 - 免费观看最新热门影视剧集，海量高清资源在线播放，支持多集连播";

function getDefaultTitle(siteName: string): string {
  return `${siteName} - ${FALLBACK_SITE_TITLE_SUFFIX}`;
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

export function getEnvSiteConfig(): SiteConfigData {
  const siteName = sanitizeText(
    process.env.SITE_NAME ?? process.env.NEXT_PUBLIC_SITE_NAME,
    FALLBACK_SITE_NAME,
    60
  );
  const siteTitle = sanitizeText(
    process.env.SITE_TITLE ?? process.env.NEXT_PUBLIC_SITE_TITLE,
    getDefaultTitle(siteName),
    120
  );
  const siteDescription = sanitizeText(
    process.env.SITE_DESCRIPTION ?? process.env.NEXT_PUBLIC_SITE_DESCRIPTION,
    FALLBACK_SITE_DESCRIPTION,
    240
  );

  return {
    siteName,
    siteTitle,
    siteDescription,
  };
}

function mapDocToConfig(
  doc: SiteConfigDocument | null,
  fallback: SiteConfigData
): SiteConfigData {
  if (!doc) return fallback;

  const siteName = sanitizeText(doc.siteName, fallback.siteName, 60);
  const siteTitle = sanitizeText(doc.siteTitle, getDefaultTitle(siteName), 120);
  const siteDescription = sanitizeText(
    doc.siteDescription,
    fallback.siteDescription,
    240
  );

  return {
    siteName,
    siteTitle,
    siteDescription,
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export async function getSiteConfigForDisplay(): Promise<SiteConfigData> {
  const fallback = getEnvSiteConfig();
  try {
    const db = await getDatabase();
    const collection = db.collection<SiteConfigDocument>(COLLECTIONS.SITE_CONFIG);
    const doc = await collection.findOne({ id: 1 });
    return mapDocToConfig(doc, fallback);
  } catch (error) {
    console.warn("读取站点配置失败，使用环境变量回退:", error);
    return fallback;
  }
}

export async function saveSiteConfigToDB(
  payload: Partial<SiteConfigData>
): Promise<SiteConfigData> {
  const fallback = await getSiteConfigForDisplay();
  const siteName = sanitizeText(payload.siteName, fallback.siteName, 60);
  const siteTitle = sanitizeText(payload.siteTitle, getDefaultTitle(siteName), 120);
  const siteDescription = sanitizeText(
    payload.siteDescription,
    fallback.siteDescription,
    240
  );
  const updatedAt = new Date();

  const db = await getDatabase();
  const collection = db.collection<SiteConfigDocument>(COLLECTIONS.SITE_CONFIG);
  await collection.updateOne(
    { id: 1 },
    {
      $set: {
        siteName,
        siteTitle,
        siteDescription,
        updatedAt,
      },
      $setOnInsert: { id: 1 as const },
    },
    { upsert: true }
  );

  return {
    siteName,
    siteTitle,
    siteDescription,
    updatedAt: updatedAt.toISOString(),
  };
}
