import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { COLLECTIONS } from "@/lib/constants/db";
import type { UserProgressItem } from "@/types/user";

interface UserProgressDoc {
  _id?: ObjectId;
  user_id: ObjectId;
  drama_id: string;
  drama_name: string;
  cover?: string;
  source_key?: string;
  source_name?: string;
  episode_index: number;
  episode_name?: string;
  position_seconds: number;
  duration_seconds?: number;
  created_at: string;
  updated_at: string;
}

interface UpsertProgressParams {
  userId: string;
  dramaId: string;
  dramaName: string;
  cover?: string;
  sourceKey?: string;
  sourceName?: string;
  episodeIndex: number;
  episodeName?: string;
  positionSeconds: number;
  durationSeconds?: number;
}

function normalizeSourceKey(sourceKey?: string): string {
  return sourceKey?.trim() || "__default__";
}

function toPublicItem(doc: UserProgressDoc): UserProgressItem {
  return {
    id: String(doc._id),
    userId: String(doc.user_id),
    dramaId: doc.drama_id,
    dramaName: doc.drama_name,
    cover: doc.cover,
    sourceKey: doc.source_key,
    sourceName: doc.source_name,
    episodeIndex: doc.episode_index,
    episodeName: doc.episode_name,
    positionSeconds: doc.position_seconds,
    durationSeconds: doc.duration_seconds,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

export async function upsertUserProgress(params: UpsertProgressParams): Promise<void> {
  const db = await getDatabase();
  const collection = db.collection<UserProgressDoc>(COLLECTIONS.USER_PROGRESS);
  const now = new Date().toISOString();

  await collection.updateOne(
    {
      user_id: new ObjectId(params.userId),
      drama_id: params.dramaId,
      source_key: normalizeSourceKey(params.sourceKey),
    },
    {
      $set: {
        drama_name: params.dramaName,
        cover: params.cover || "",
        source_key: normalizeSourceKey(params.sourceKey),
        source_name: params.sourceName || "",
        episode_index: Math.max(0, Math.floor(params.episodeIndex)),
        episode_name: params.episodeName || "",
        position_seconds: Math.max(0, params.positionSeconds),
        duration_seconds: params.durationSeconds && params.durationSeconds > 0 ? params.durationSeconds : undefined,
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
    },
    { upsert: true }
  );
}

export async function getUserProgressByDrama(
  userId: string,
  dramaId: string,
  sourceKey?: string
): Promise<UserProgressItem | null> {
  const db = await getDatabase();
  const collection = db.collection<UserProgressDoc>(COLLECTIONS.USER_PROGRESS);
  const doc = await collection.findOne({
    user_id: new ObjectId(userId),
    drama_id: dramaId,
    source_key: normalizeSourceKey(sourceKey),
  });
  return doc ? toPublicItem(doc) : null;
}

export async function listUserProgress(
  userId: string,
  limit: number = 50
): Promise<UserProgressItem[]> {
  const db = await getDatabase();
  const collection = db.collection<UserProgressDoc>(COLLECTIONS.USER_PROGRESS);
  const docs = await collection
    .find({ user_id: new ObjectId(userId) })
    .sort({ updated_at: -1 })
    .limit(Math.max(1, Math.min(limit, 200)))
    .toArray();
  return docs.map(toPublicItem);
}

export async function removeUserProgress(
  userId: string,
  dramaId: string,
  sourceKey?: string
): Promise<void> {
  const db = await getDatabase();
  const collection = db.collection<UserProgressDoc>(COLLECTIONS.USER_PROGRESS);
  await collection.deleteOne({
    user_id: new ObjectId(userId),
    drama_id: dramaId,
    source_key: normalizeSourceKey(sourceKey),
  });
}
