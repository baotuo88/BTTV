import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { getDatabase } from './db';
import { COLLECTIONS } from './constants/db';
import type { AdminUserItem, UserPublic } from '@/types/user';

const scrypt = promisify(scryptCallback);

const USER_SESSION_COOKIE = 'user_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

interface UserDoc {
  _id?: ObjectId;
  username: string;
  username_lower: string;
  email: string;
  email_lower: string;
  password_hash: string;
  is_disabled?: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

interface UserSessionDoc {
  _id?: ObjectId;
  token_hash: string;
  user_id: ObjectId;
  created_at: string;
  expires_at: Date;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const [, salt, hash] = parts;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const known = Buffer.from(hash, 'hex');

  if (derived.length !== known.length) return false;
  return timingSafeEqual(derived, known);
}

function toPublicUser(user: UserDoc): UserPublic {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  };
}

function toAdminUser(user: UserDoc, activeSessionCount: number): AdminUserItem {
  return {
    ...toPublicUser(user),
    disabled: !!user.is_disabled,
    activeSessionCount,
  };
}

export function validateRegisterInput(username: string, email: string, password: string): string | null {
  if (!username || !email || !password) return '请完整填写用户名、邮箱和密码';
  if (!isValidUsername(username)) return '用户名需为 2-20 位（支持中英文、数字、下划线）';
  if (!isValidEmail(email)) return '邮箱格式不正确';
  if (password.length < 6) return '密码至少 6 位';
  return null;
}

export function validateProfileUsername(username: string): string | null {
  if (!username) return "用户名不能为空";
  if (!isValidUsername(username)) return "用户名需为 2-20 位（支持中英文、数字、下划线）";
  return null;
}

export async function registerUser(username: string, email: string, password: string): Promise<UserPublic> {
  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);

  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);

  const existed = await users.findOne({
    $or: [{ email_lower: normalizedEmail }, { username_lower: normalizedUsername }],
  });
  if (existed) {
    if (existed.email_lower === normalizedEmail) {
      throw new Error('该邮箱已被注册');
    }
    throw new Error('该用户名已被占用');
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);

  const doc: UserDoc = {
    username: username.trim(),
    username_lower: normalizedUsername,
    email: normalizedEmail,
    email_lower: normalizedEmail,
    password_hash: passwordHash,
    is_disabled: false,
    created_at: now,
    updated_at: now,
  };

  const result = await users.insertOne(doc);
  doc._id = result.insertedId;
  return toPublicUser(doc);
}

export async function loginUser(account: string, password: string): Promise<UserPublic> {
  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);

  const normalizedAccount = account.trim().toLowerCase();
  const user = await users.findOne({
    $or: [{ email_lower: normalizedAccount }, { username_lower: normalizedAccount }],
  });

  if (!user) {
    throw new Error('账号或密码错误');
  }

  if (user.is_disabled) {
    throw new Error('账号已被禁用');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new Error('账号或密码错误');
  }

  const now = new Date().toISOString();
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        last_login_at: now,
        updated_at: now,
      },
    }
  );

  user.last_login_at = now;
  return toPublicUser(user);
}

export async function listUsers(keyword: string = ''): Promise<AdminUserItem[]> {
  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);

  const normalized = keyword.trim().toLowerCase();
  const safeKeyword = escapeRegex(normalized);
  const filter = normalized
    ? {
        $or: [
          { username_lower: { $regex: safeKeyword, $options: 'i' } },
          { email_lower: { $regex: safeKeyword, $options: 'i' } },
        ],
      }
    : {};

  const docs = await users
    .find(filter)
    .sort({ created_at: -1 })
    .limit(200)
    .toArray();

  if (docs.length === 0) return [];

  const userIds = docs
    .filter((doc): doc is UserDoc & { _id: ObjectId } => !!doc._id)
    .map((doc) => doc._id);
  const now = new Date();

  const counts = await sessions
    .aggregate<{ _id: ObjectId; count: number }>([
      { $match: { user_id: { $in: userIds }, expires_at: { $gt: now } } },
      { $group: { _id: '$user_id', count: { $sum: 1 } } },
    ])
    .toArray();

  const sessionCountMap = new Map<string, number>(
    counts.map((item) => [String(item._id), item.count])
  );

  return docs.map((doc) =>
    toAdminUser(doc, sessionCountMap.get(String(doc._id)) || 0)
  );
}

export async function setUserDisabled(userId: string, disabled: boolean): Promise<void> {
  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);

  const targetId = new ObjectId(userId);
  const result = await users.updateOne(
    { _id: targetId },
    {
      $set: {
        is_disabled: disabled,
        updated_at: new Date().toISOString(),
      },
    }
  );

  if (result.matchedCount === 0) {
    throw new Error('用户不存在');
  }

  if (disabled) {
    await sessions.deleteMany({ user_id: targetId });
  }
}

export async function removeUser(userId: string): Promise<void> {
  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);

  const targetId = new ObjectId(userId);
  const result = await users.deleteOne({ _id: targetId });
  if (result.deletedCount === 0) {
    throw new Error('用户不存在');
  }

  await sessions.deleteMany({ user_id: targetId });
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) {
    throw new Error('密码至少 6 位');
  }

  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);

  const targetId = new ObjectId(userId);
  const passwordHash = await hashPassword(newPassword);
  const result = await users.updateOne(
    { _id: targetId },
    {
      $set: {
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      },
      $unset: {
        last_login_at: '',
      },
    }
  );

  if (result.matchedCount === 0) {
    throw new Error('用户不存在');
  }

  // 密码重置后清除所有会话，强制重新登录
  await sessions.deleteMany({ user_id: targetId });
}

export async function updateUserProfileUsername(
  userId: string,
  username: string
): Promise<UserPublic> {
  const trimmed = username.trim();
  const validationError = validateProfileUsername(trimmed);
  if (validationError) {
    throw new Error(validationError);
  }

  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);
  const targetId = new ObjectId(userId);
  const usernameLower = normalizeUsername(trimmed);

  const duplicated = await users.findOne({
    _id: { $ne: targetId },
    username_lower: usernameLower,
  });
  if (duplicated) {
    throw new Error("该用户名已被占用");
  }

  const result = await users.findOneAndUpdate(
    { _id: targetId },
    {
      $set: {
        username: trimmed,
        username_lower: usernameLower,
        updated_at: new Date().toISOString(),
      },
    },
    { returnDocument: "after" }
  );

  if (!result) {
    throw new Error("用户不存在");
  }

  return toPublicUser(result);
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!currentPassword || !newPassword) {
    throw new Error("请完整填写当前密码和新密码");
  }
  if (newPassword.length < 6) {
    throw new Error("新密码至少 6 位");
  }

  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);
  const targetId = new ObjectId(userId);

  const user = await users.findOne({ _id: targetId });
  if (!user) {
    throw new Error("用户不存在");
  }

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    throw new Error("当前密码错误");
  }

  const sameAsOld = await verifyPassword(newPassword, user.password_hash);
  if (sameAsOld) {
    throw new Error("新密码不能与当前密码相同");
  }

  const nextHash = await hashPassword(newPassword);
  await users.updateOne(
    { _id: targetId },
    {
      $set: {
        password_hash: nextHash,
        updated_at: new Date().toISOString(),
      },
    }
  );

  // 改密后下线其他会话，当前会话由 cookie 维持
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(USER_SESSION_COOKIE)?.value;
  const currentTokenHash = currentToken ? hashToken(currentToken) : "";
  await sessions.deleteMany({
    user_id: targetId,
    ...(currentTokenHash ? { token_hash: { $ne: currentTokenHash } } : {}),
  });
}

export async function createUserSession(userId: string): Promise<void> {
  const db = await getDatabase();
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);
  const cookieStore = await cookies();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE * 1000);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);

  await sessions.insertOne({
    token_hash: tokenHash,
    user_id: new ObjectId(userId),
    created_at: now.toISOString(),
    expires_at: expiresAt,
  });

  cookieStore.set(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function clearUserSession(): Promise<void> {
  const db = await getDatabase();
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;

  if (token) {
    await sessions.deleteOne({ token_hash: hashToken(token) });
  }
  cookieStore.delete(USER_SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<UserPublic | null> {
  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;

  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await sessions.findOne({ token_hash: tokenHash });
  if (!session) {
    cookieStore.delete(USER_SESSION_COOKIE);
    return null;
  }

  if (session.expires_at.getTime() <= Date.now()) {
    await sessions.deleteOne({ _id: session._id });
    cookieStore.delete(USER_SESSION_COOKIE);
    return null;
  }

  const user = await users.findOne({ _id: session.user_id });
  if (!user) {
    await sessions.deleteOne({ _id: session._id });
    cookieStore.delete(USER_SESSION_COOKIE);
    return null;
  }

  return toPublicUser(user);
}
