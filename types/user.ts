export interface UserPublic {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminUserItem extends UserPublic {
  disabled: boolean;
  activeSessionCount: number;
}

export interface UserSessionPayload {
  user: UserPublic;
}

export type UserLibraryType = "favorite" | "follow" | "watch_later";

export interface UserLibraryItem {
  id: string;
  userId: string;
  listType: UserLibraryType;
  itemId: string;
  title: string;
  cover?: string;
  mediaType?: string;
  sourceKey?: string;
  sourceName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProgressItem {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}
