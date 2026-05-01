import "server-only";

import { getAllVodSourcesFromDB } from "@/lib/vod-sources-db";
import { getAllShortsSourcesFromDB } from "@/lib/shorts-sources-db";
import { getDatabase } from "@/lib/db";
import { COLLECTIONS } from "@/lib/constants/db";

const STATIC_ALLOWED_HOSTS = [
  "movie.douban.com",
  "img1.doubanio.com",
  "img2.doubanio.com",
  "img3.doubanio.com",
  "img9.doubanio.com",
  "wsrv.link0.me",
  "api.dailymotion.com",
  "graphql.api.dailymotion.com",
  "geo.dailymotion.com",
  "www.dailymotion.com",
  "www.dmcdn.net",
  "dmcdn.net",
  "danmuapi1-eight.vercel.app",
];

interface PlayerConfigDocument {
  _id: string;
  iframePlayers?: Array<{ url?: string }>;
}

interface CacheEntry {
  expiresAt: number;
  hosts: Set<string>;
}

let cachedHosts: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function parseHostPatterns(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function isIpLike(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function extractHost(input: string): string | null {
  try {
    const url = new URL(input);
    return normalizeHost(url.hostname);
  } catch {
    return null;
  }
}

function addHostAndParentDomain(target: Set<string>, host: string) {
  if (!host || isIpLike(host)) return;

  target.add(host);

  const parts = host.split(".");
  if (parts.length >= 3) {
    const parent = parts.slice(-2).join(".");
    target.add(parent);
  }
}

function addAllowedPattern(target: Set<string>, pattern: string) {
  const normalized = normalizeHost(pattern);
  if (!normalized) return;
  target.add(normalized);
}

function hostMatches(hostname: string, allowed: string): boolean {
  if (allowed.startsWith("*.")) {
    const suffix = allowed.slice(2);
    if (!suffix) return false;
    if (hostname === suffix) return true;
    return hostname.endsWith(`.${suffix}`);
  }

  if (hostname === allowed) return true;
  return hostname.endsWith(`.${allowed}`);
}

async function collectDynamicHosts(): Promise<Set<string>> {
  const result = new Set<string>();

  const [vodSources, shortsSources] = await Promise.all([
    getAllVodSourcesFromDB().catch(() => []),
    getAllShortsSourcesFromDB().catch(() => []),
  ]);

  for (const source of vodSources) {
    const candidates = [source.api, source.search_proxy, source.parse_proxy];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const host = extractHost(candidate);
      if (host) addHostAndParentDomain(result, host);
    }
  }

  for (const source of shortsSources) {
    const host = extractHost(source.api);
    if (host) addHostAndParentDomain(result, host);
  }

  try {
    const db = await getDatabase();
    const collection = db.collection<PlayerConfigDocument>(COLLECTIONS.PLAYER_CONFIG);
    const config = await collection.findOne({ _id: "player_config" });

    for (const player of config?.iframePlayers || []) {
      if (!player.url) continue;
      const host = extractHost(player.url);
      if (host) addHostAndParentDomain(result, host);
    }
  } catch {
    // Ignore DB errors and fallback to static hosts.
  }

  return result;
}

async function getAllowedHostsSet(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedHosts && cachedHosts.expiresAt > now) {
    return cachedHosts.hosts;
  }

  const hosts = new Set<string>();

  for (const host of STATIC_ALLOWED_HOSTS) {
    addHostAndParentDomain(hosts, normalizeHost(host));
  }

  const envPatterns = parseHostPatterns(process.env.PROXY_ALLOWED_HOSTS);
  for (const pattern of envPatterns) {
    addAllowedPattern(hosts, pattern);
  }

  const dynamicHosts = await collectDynamicHosts();
  for (const host of dynamicHosts) {
    addHostAndParentDomain(hosts, host);
  }

  cachedHosts = {
    expiresAt: now + CACHE_TTL_MS,
    hosts,
  };

  return hosts;
}

export async function assertHostAllowed(hostname: string): Promise<void> {
  const normalized = normalizeHost(hostname);
  if (!normalized) {
    throw new Error("目标域名无效");
  }

  const allowedHosts = await getAllowedHostsSet();

  for (const allowed of allowedHosts) {
    if (hostMatches(normalized, allowed)) {
      return;
    }
  }

  throw new Error(`目标域名不在白名单: ${normalized}`);
}
