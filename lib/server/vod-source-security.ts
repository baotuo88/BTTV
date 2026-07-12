import "server-only";

import { assertSafeRemoteUrl } from "./safe-remote-url";
import type { VodSource } from "@/types/drama";

/**
 * 客户端在部分接口中会把 VodSource 对象（含 api / searchProxy / parseProxy）通过
 * body 传入服务端再由服务端 fetch，这样就把 SSRF 攻击面暴露给了任意登录用户。
 *
 * 本函数负责校验所有对外 URL：
 *   - 必须是 http/https
 *   - 不允许指向本机 / 内网 / 保留地址（DNS 层面也会解析并检查）
 */
export async function assertSafeVodSource(
  source: Partial<VodSource> | null | undefined
): Promise<void> {
  if (!source) {
    throw new Error("缺少视频源信息");
  }

  const urls: string[] = [];
  if (source.api) urls.push(source.api);
  if (source.searchProxy) urls.push(source.searchProxy);
  if (source.parseProxy) urls.push(source.parseProxy);

  if (urls.length === 0) {
    throw new Error("视频源缺少可访问的 API 地址");
  }

  await Promise.all(urls.map((url) => assertSafeRemoteUrl(url)));
}

/**
 * 只校验单个 URL；用于短剧源等只有 api 字段的场景。
 */
export async function assertSafeSourceApi(api: string | undefined | null): Promise<void> {
  if (!api) {
    throw new Error("视频源缺少 API 地址");
  }
  await assertSafeRemoteUrl(api);
}
