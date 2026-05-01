import "server-only";

import { getDatabase } from "@/lib/db";
import { COLLECTIONS } from "@/lib/constants/db";
import type {
  OperationsAnnouncement,
  OperationsConfigData,
  OperationsNavLink,
  OperationsQuickEntry,
} from "@/types/operations-config";

interface OperationsConfigDoc {
  id: 1;
  announcement: OperationsAnnouncement;
  quickEntries: OperationsQuickEntry[];
  navLinks: OperationsNavLink[];
  showGithubLink: boolean;
  updatedAt: Date;
}

const DEFAULT_OPERATIONS_CONFIG: OperationsConfigData = {
  announcement: {
    enabled: false,
    text: "",
    href: "",
  },
  quickEntries: [
    {
      id: "entry-1",
      enabled: true,
      title: "热门推荐",
      subtitle: "精选高分影片，快速开看",
      href: "/browse/latest",
    },
    {
      id: "entry-2",
      enabled: true,
      title: "追剧日历",
      subtitle: "每日更新，追更不迷路",
      href: "/calendar",
    },
    {
      id: "entry-3",
      enabled: true,
      title: "短剧专区",
      subtitle: "碎片时间，轻松追更",
      href: "/shorts",
    },
  ],
  navLinks: [],
  showGithubLink: true,
};

function trimWithMaxLength(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function sanitizeAnnouncement(input: unknown): OperationsAnnouncement {
  const source = input as Partial<OperationsAnnouncement> | undefined;
  return {
    enabled: Boolean(source?.enabled),
    text: trimWithMaxLength(source?.text, "", 120),
    href: trimWithMaxLength(source?.href, "", 240),
  };
}

function sanitizeQuickEntries(input: unknown): OperationsQuickEntry[] {
  const sourceList = Array.isArray(input) ? input : DEFAULT_OPERATIONS_CONFIG.quickEntries;
  return sourceList.slice(0, 6).map((item, index) => {
    const source = item as Partial<OperationsQuickEntry> | undefined;
    return {
      id: trimWithMaxLength(source?.id, `entry-${index + 1}`, 40),
      enabled: Boolean(source?.enabled),
      title: trimWithMaxLength(source?.title, `运营入口 ${index + 1}`, 40),
      subtitle: trimWithMaxLength(source?.subtitle, "", 80),
      href: trimWithMaxLength(source?.href, "/", 240),
    };
  });
}

function sanitizeNavLinks(input: unknown): OperationsNavLink[] {
  const sourceList = Array.isArray(input) ? input : [];
  return sourceList.slice(0, 6).map((item, index) => {
    const source = item as Partial<OperationsNavLink> | undefined;
    return {
      id: trimWithMaxLength(source?.id, `nav-${index + 1}`, 40),
      enabled: Boolean(source?.enabled),
      label: trimWithMaxLength(source?.label, `菜单${index + 1}`, 20),
      href: trimWithMaxLength(source?.href, "/", 240),
      newTab: Boolean(source?.newTab),
    };
  });
}

function mergeWithDefault(config: Partial<OperationsConfigData>): OperationsConfigData {
  return {
    announcement: sanitizeAnnouncement(config.announcement),
    quickEntries: sanitizeQuickEntries(config.quickEntries),
    navLinks: sanitizeNavLinks(config.navLinks),
    showGithubLink: config.showGithubLink ?? true,
    updatedAt: config.updatedAt,
  };
}

function docToData(doc: OperationsConfigDoc | null): OperationsConfigData {
  if (!doc) {
    return DEFAULT_OPERATIONS_CONFIG;
  }
  return {
    announcement: sanitizeAnnouncement(doc.announcement),
    quickEntries: sanitizeQuickEntries(doc.quickEntries),
    navLinks: sanitizeNavLinks(doc.navLinks),
    showGithubLink: doc.showGithubLink ?? true,
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export function getDefaultOperationsConfig(): OperationsConfigData {
  return DEFAULT_OPERATIONS_CONFIG;
}

export async function getOperationsConfigForDisplay(): Promise<OperationsConfigData> {
  try {
    const db = await getDatabase();
    const collection = db.collection<OperationsConfigDoc>(COLLECTIONS.OPERATIONS_CONFIG);
    const doc = await collection.findOne({ id: 1 });
    return docToData(doc);
  } catch (error) {
    console.warn("读取运营配置失败，回退默认配置:", error);
    return DEFAULT_OPERATIONS_CONFIG;
  }
}

export async function saveOperationsConfigToDB(
  payload: Partial<OperationsConfigData>
): Promise<OperationsConfigData> {
  const now = new Date();
  const current = await getOperationsConfigForDisplay();
  const merged = mergeWithDefault({
    ...current,
    ...payload,
    announcement: payload.announcement ?? current.announcement,
    quickEntries: payload.quickEntries ?? current.quickEntries,
    navLinks: payload.navLinks ?? current.navLinks,
  });
  const db = await getDatabase();
  const collection = db.collection<OperationsConfigDoc>(COLLECTIONS.OPERATIONS_CONFIG);

  await collection.updateOne(
    { id: 1 },
    {
      $set: {
        id: 1,
        announcement: merged.announcement,
        quickEntries: merged.quickEntries,
        navLinks: merged.navLinks,
        showGithubLink: merged.showGithubLink,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  return {
    ...merged,
    updatedAt: now.toISOString(),
  };
}
