/**
 * MongoDB 集合名称常量
 * 
 * 集中管理所有集合名称，避免硬编码
 */

export const COLLECTIONS = {
  /** VOD 视频源配置 */
  VOD_SOURCES: 'vod_sources',
  /** VOD 视频源选择记录 */
  VOD_SOURCE_SELECTION: 'vod_source_selection',
  /** 短剧视频源配置 */
  SHORTS_SOURCES: 'shorts_sources',
  /** 短剧视频源选择记录 */
  SHORTS_SOURCE_SELECTION: 'shorts_source_selection',
  /** Dailymotion 频道列表 */
  DAILYMOTION_CHANNELS: 'dailymotion_channels',
  /** Dailymotion 全局配置 */
  DAILYMOTION_CONFIG: 'dailymotion_config',
  /** 站点全局配置 */
  SITE_CONFIG: 'site_config',
  /** 播放器配置 */
  PLAYER_CONFIG: 'player_config',
  /** 前台用户 */
  USERS: 'users',
  /** 前台用户会话 */
  USER_SESSIONS: 'user_sessions',
  /** 密码找回验证码 */
  USER_PASSWORD_RESET_CODES: 'user_password_reset_codes',
  /** 用户收藏/清单 */
  USER_LIBRARY: 'user_library',
  /** 用户云端播放进度 */
  USER_PROGRESS: 'user_progress',
} as const;

/** 集合名称类型 */
export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
