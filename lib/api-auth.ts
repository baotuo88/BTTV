import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { getCurrentUser } from "@/lib/user-auth";

function unauthorizedResponse() {
  return NextResponse.json(
    { code: 401, message: "未登录或会话已过期", data: null },
    { status: 401 }
  );
}

export async function ensureUserOrAdminApiAuth(): Promise<NextResponse | null> {
  const isAdmin = await validateSession();
  if (isAdmin) return null;

  const user = await getCurrentUser();
  if (user) return null;

  return unauthorizedResponse();
}

export async function ensureAdminApiAuth(): Promise<NextResponse | null> {
  const isAdmin = await validateSession();
  if (isAdmin) return null;

  return unauthorizedResponse();
}
