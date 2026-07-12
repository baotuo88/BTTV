import { NextRequest, NextResponse } from "next/server";
import { ensureAdminApiAuth } from "@/lib/api-auth";
import {
  getEnvSiteConfig,
  getSiteConfigForDisplay,
  saveSiteConfigToDB,
} from "@/lib/site-config";
import type { SiteConfigData } from "@/types/site-config";

function sanitizePayload(body: unknown): Partial<SiteConfigData> {
  if (!body || typeof body !== "object") return {};
  const payload = body as Record<string, unknown>;
  const nextPayload: Partial<SiteConfigData> = {};

  if (typeof payload.siteName === "string") {
    nextPayload.siteName = payload.siteName;
  }
  if (typeof payload.siteTitle === "string") {
    nextPayload.siteTitle = payload.siteTitle;
  }
  if (typeof payload.siteDescription === "string") {
    nextPayload.siteDescription = payload.siteDescription;
  }

  return nextPayload;
}

export async function GET() {
  try {
    const config = await getSiteConfigForDisplay();
    return NextResponse.json({
      code: 200,
      message: "Success",
      data: config,
      envFallback: getEnvSiteConfig(),
    });
  } catch (error) {
    console.error("读取站点配置失败:", error);
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : "Failed to read site config",
        data: null,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = await ensureAdminApiAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const payload = sanitizePayload(body);

    if (!payload.siteName && !payload.siteTitle && !payload.siteDescription) {
      return NextResponse.json(
        {
          code: 400,
          message: "至少需要提供一个站点字段",
          data: null,
        },
        { status: 400 }
      );
    }

    const config = await saveSiteConfigToDB(payload);
    return NextResponse.json({
      code: 200,
      message: "保存成功",
      data: config,
    });
  } catch (error) {
    console.error("保存站点配置失败:", error);
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : "Failed to save site config",
        data: null,
      },
      { status: 500 }
    );
  }
}
