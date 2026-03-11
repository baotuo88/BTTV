import { NextRequest, NextResponse } from "next/server";
import { ensureAdminApiAuth } from "@/lib/api-auth";
import {
  getDefaultOperationsConfig,
  getOperationsConfigForDisplay,
  saveOperationsConfigToDB,
} from "@/lib/operations-config";
import type { OperationsConfigData } from "@/types/operations-config";

function sanitizePayload(input: unknown): Partial<OperationsConfigData> {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const payload: Partial<OperationsConfigData> = {};

  if (source.announcement !== undefined) {
    payload.announcement = source.announcement as OperationsConfigData["announcement"];
  }
  if (source.quickEntries !== undefined) {
    payload.quickEntries = source.quickEntries as OperationsConfigData["quickEntries"];
  }
  if (source.navLinks !== undefined) {
    payload.navLinks = source.navLinks as OperationsConfigData["navLinks"];
  }
  if (source.showGithubLink !== undefined) {
    payload.showGithubLink = Boolean(source.showGithubLink);
  }

  return payload;
}

export async function GET() {
  try {
    const config = await getOperationsConfigForDisplay();
    return NextResponse.json({
      code: 200,
      message: "Success",
      data: config,
      defaults: getDefaultOperationsConfig(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: 500,
        message:
          error instanceof Error ? error.message : "Failed to read operations config",
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
    const config = await saveOperationsConfigToDB(payload);
    return NextResponse.json({
      code: 200,
      message: "保存成功",
      data: config,
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: 500,
        message:
          error instanceof Error ? error.message : "Failed to save operations config",
        data: null,
      },
      { status: 500 }
    );
  }
}
