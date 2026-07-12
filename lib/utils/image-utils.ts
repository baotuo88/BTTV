// 图片处理工具函数

// 默认占位图
const DEFAULT_PLACEHOLDER = '/movie-default-bg.jpg';

/**
 * 智能获取图片URL - 通过代理服务器获取图片
 */
export function getImageUrl(imageUrl: string): string {
  // 空URL返回占位图
  if (!imageUrl || imageUrl.trim() === '') {
    return DEFAULT_PLACEHOLDER;
  }

  const normalized = imageUrl.trim();

  // 本地资源或相对路径，直接使用
  if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) {
    return normalized;
  }

  // data/blob URL 直接使用
  if (normalized.startsWith("data:") || normalized.startsWith("blob:")) {
    return normalized;
  }

  // 协议相对路径补全为 https
  const remoteUrl = normalized.startsWith("//")
    ? `https:${normalized}`
    : normalized;

  // 仅对远程 URL 走代理
  if (/^https?:\/\//i.test(remoteUrl)) {
    return `/api/image-proxy?url=${encodeURIComponent(remoteUrl)}`;
  }

  // 非法或未知格式回退占位图，避免请求报错
  return DEFAULT_PLACEHOLDER;
}
