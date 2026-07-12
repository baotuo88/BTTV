import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  validateAdminPassword,
  verifyAdminSessionToken,
} from "@/lib/admin-session";

// 创建会话
export async function createSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = await createAdminSessionToken();

  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
}

// 删除会话
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
}

// 验证会话
export async function validateSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const isValid = await verifyAdminSessionToken(sessionToken);

  if (!isValid && sessionToken) {
    cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
  }

  return isValid;
}

// 验证密码
export function validatePassword(password: string): boolean {
  return validateAdminPassword(password);
}
