import { createHash, randomInt } from "crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { COLLECTIONS } from "@/lib/constants/db";
import { hashPassword } from "@/lib/user-auth";
import { sendMail } from "@/lib/mailer";

const RESET_CODE_TTL_MINUTES = 10;
const SEND_INTERVAL_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 6;

interface UserDoc {
  _id?: ObjectId;
  email: string;
  email_lower: string;
}

interface UserSessionDoc {
  _id?: ObjectId;
  token_hash: string;
  user_id: ObjectId;
  created_at: string;
  expires_at: Date;
}

interface PasswordResetCodeDoc {
  _id?: ObjectId;
  email_lower: string;
  code_hash: string;
  attempts: number;
  created_at: string;
  expires_at: Date;
  last_sent_at: Date;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function formatMaskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  if (name.length <= 2) return `${name[0] || "*"}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;

  const db = await getDatabase();
  const users = db.collection<UserDoc>(COLLECTIONS.USERS);
  const resetCodes = db.collection<PasswordResetCodeDoc>(
    COLLECTIONS.USER_PASSWORD_RESET_CODES
  );

  const user = await users.findOne({ email_lower: normalizedEmail });
  // 不泄露邮箱是否存在
  if (!user) return;

  const existing = await resetCodes.findOne({ email_lower: normalizedEmail });
  if (existing?.last_sent_at) {
    const waitSeconds = Math.ceil(
      SEND_INTERVAL_SECONDS - (Date.now() - existing.last_sent_at.getTime()) / 1000
    );
    if (waitSeconds > 0) {
      throw new Error(`请求过于频繁，请 ${waitSeconds} 秒后重试`);
    }
  }

  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_CODE_TTL_MINUTES * 60 * 1000);

  await resetCodes.updateOne(
    { email_lower: normalizedEmail },
    {
      $set: {
        email_lower: normalizedEmail,
        code_hash: hashCode(code),
        attempts: 0,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        last_sent_at: now,
      },
    },
    { upsert: true }
  );

  const maskedEmail = formatMaskEmail(user.email);
  await sendMail({
    to: user.email,
    subject: "宝拓影视 - 密码重置验证码",
    text: `你正在重置宝拓影视账号密码。验证码：${code}，${RESET_CODE_TTL_MINUTES}分钟内有效。若非本人操作请忽略。`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #111;">
        <h2 style="margin: 0 0 16px;">宝拓影视 密码重置</h2>
        <p>账号：${maskedEmail}</p>
        <p>验证码（${RESET_CODE_TTL_MINUTES}分钟内有效）：</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 16px 0; color: #e50914;">${code}</div>
        <p>如果不是你本人操作，请忽略本邮件。</p>
      </div>
    `,
  });
}

export async function resetPasswordByCode(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = code.trim();

  if (!normalizedEmail || !normalizedCode) {
    throw new Error("请提供邮箱和验证码");
  }
  if (newPassword.length < 6) {
    throw new Error("密码至少 6 位");
  }

  const db = await getDatabase();
  const users = db.collection<UserDoc & { password_hash: string; updated_at: string }>(
    COLLECTIONS.USERS
  );
  const resetCodes = db.collection<PasswordResetCodeDoc>(
    COLLECTIONS.USER_PASSWORD_RESET_CODES
  );
  const sessions = db.collection<UserSessionDoc>(COLLECTIONS.USER_SESSIONS);

  const user = await users.findOne({ email_lower: normalizedEmail });
  if (!user?._id) {
    throw new Error("账号不存在");
  }

  const resetDoc = await resetCodes.findOne({ email_lower: normalizedEmail });
  if (!resetDoc) {
    throw new Error("验证码无效或已过期");
  }

  if (resetDoc.expires_at.getTime() <= Date.now()) {
    await resetCodes.deleteOne({ _id: resetDoc._id });
    throw new Error("验证码已过期");
  }

  if (resetDoc.attempts >= MAX_VERIFY_ATTEMPTS) {
    await resetCodes.deleteOne({ _id: resetDoc._id });
    throw new Error("验证码尝试次数过多，请重新获取");
  }

  if (resetDoc.code_hash !== hashCode(normalizedCode)) {
    await resetCodes.updateOne(
      { _id: resetDoc._id },
      { $inc: { attempts: 1 } }
    );
    throw new Error("验证码错误");
  }

  const newHash = await hashPassword(newPassword);
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        password_hash: newHash,
        updated_at: new Date().toISOString(),
      },
      $unset: { last_login_at: "" },
    }
  );

  await sessions.deleteMany({ user_id: user._id });
  await resetCodes.deleteOne({ _id: resetDoc._id });
}
