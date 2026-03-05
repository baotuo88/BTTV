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
