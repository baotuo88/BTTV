import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { COLLECTIONS } from "@/lib/constants/db";
import type { UserLibraryItem, UserLibraryType } from "@/types/user";

interface UserLibraryDoc {
  _id?: ObjectId;
  user_id: ObjectId;
  list_type: UserLibraryType;
  item_id: string;
  title: string;
  cover?: string;
  media_type?: string;
  source_key?: string;
  source_name?: string;
  created_at: string;
  updated_at: string;
}

interface UpsertUserLibraryParams {
  userId: string;
  listType: UserLibraryType;
  itemId: string;
  title: string;
  cover?: string;
  mediaType?: string;
  sourceKey?: string;
  sourceName?: string;
}

function toPublicItem(doc: UserLibraryDoc): UserLibraryItem {
  return {
    id: String(doc._id),
    userId: String(doc.user_id),
    listType: doc.list_type,
    itemId: doc.item_id,
    title: doc.title,
    cover: doc.cover,
    mediaType: doc.media_type,
    sourceKey: doc.source_key,
    sourceName: doc.source_name,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

function validateListType(listType: string): listType is UserLibraryType {
  return listType === "favorite" || listType === "follow" || listType === "watch_later";
}

export function ensureLibraryType(listType: string): UserLibraryType {
  if (!validateListType(listType)) {
    throw new Error("无效的清单类型");
  }
  return listType;
}

export async function upsertUserLibraryItem(
  params: UpsertUserLibraryParams
): Promise<void> {
  const db = await getDatabase();
  const collection = db.collection<UserLibraryDoc>(COLLECTIONS.USER_LIBRARY);
  const now = new Date().toISOString();

  await collection.updateOne(
    {
      user_id: new ObjectId(params.userId),
      list_type: params.listType,
      item_id: params.itemId,
    },
    {
      $set: {
        title: params.title,
        cover: params.cover || "",
        media_type: params.mediaType || "",
        source_key: params.sourceKey || "",
        source_name: params.sourceName || "",
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
    },
    { upsert: true }
  );
}

export async function removeUserLibraryItem(
  userId: string,
  listType: UserLibraryType,
  itemId: string
): Promise<void> {
  const db = await getDatabase();
  const collection = db.collection<UserLibraryDoc>(COLLECTIONS.USER_LIBRARY);
  await collection.deleteOne({
    user_id: new ObjectId(userId),
    list_type: listType,
    item_id: itemId,
  });
}

export async function listUserLibraryItems(
  userId: string,
  listType?: UserLibraryType,
  limit: number = 100
): Promise<UserLibraryItem[]> {
  const db = await getDatabase();
  const collection = db.collection<UserLibraryDoc>(COLLECTIONS.USER_LIBRARY);

  const filter: Partial<Pick<UserLibraryDoc, "user_id" | "list_type">> = {
    user_id: new ObjectId(userId),
  };
  if (listType) {
    filter.list_type = listType;
  }

  const docs = await collection
    .find(filter)
    .sort({ updated_at: -1 })
    .limit(Math.max(1, Math.min(limit, 200)))
    .toArray();

  return docs.map(toPublicItem);
}

export async function getUserLibraryStatus(
  userId: string,
  itemId: string
): Promise<Record<UserLibraryType, boolean>> {
  const db = await getDatabase();
  const collection = db.collection<UserLibraryDoc>(COLLECTIONS.USER_LIBRARY);
  const docs = await collection
    .find({
      user_id: new ObjectId(userId),
      item_id: itemId,
    })
    .project<{ list_type: UserLibraryType }>({ list_type: 1 })
    .toArray();

  const status: Record<UserLibraryType, boolean> = {
    favorite: false,
    follow: false,
    watch_later: false,
  };

  for (const doc of docs) {
    status[doc.list_type] = true;
  }

  return status;
}
