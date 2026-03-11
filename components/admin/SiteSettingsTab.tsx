"use client";

import { useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import type { SiteConfigData } from "@/types/site-config";
import type { SiteSettingsTabProps } from "./types";

type SiteConfigForm = Pick<
  SiteConfigData,
  "siteName" | "siteTitle" | "siteDescription"
>;

interface SiteConfigApiResponse {
  code: number;
  message: string;
  data: SiteConfigData | null;
}

function trimFormData(formData: SiteConfigForm): SiteConfigForm {
  return {
    siteName: formData.siteName.trim(),
    siteTitle: formData.siteTitle.trim(),
    siteDescription: formData.siteDescription.trim(),
  };
}

export function SiteSettingsTab({
  siteConfig,
  onConfigChange,
  onShowToast,
}: SiteSettingsTabProps) {
  const { mutate } = useSWRConfig();
  const [formData, setFormData] = useState<SiteConfigForm>({
    siteName: siteConfig.siteName,
    siteTitle: siteConfig.siteTitle,
    siteDescription: siteConfig.siteDescription,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData({
      siteName: siteConfig.siteName,
      siteTitle: siteConfig.siteTitle,
      siteDescription: siteConfig.siteDescription,
    });
  }, [siteConfig]);

  const dirty = useMemo(() => {
    const current = trimFormData(formData);
    const original = trimFormData({
      siteName: siteConfig.siteName,
      siteTitle: siteConfig.siteTitle,
      siteDescription: siteConfig.siteDescription,
    });
    return (
      current.siteName !== original.siteName ||
      current.siteTitle !== original.siteTitle ||
      current.siteDescription !== original.siteDescription
    );
  }, [formData, siteConfig]);

  const handleSave = async () => {
    const payload = trimFormData(formData);

    if (!payload.siteName || !payload.siteTitle || !payload.siteDescription) {
      onShowToast({ message: "请填写完整站点信息", type: "warning" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (result.code === 200 && result.data) {
        const nextConfig = result.data as SiteConfigData;
        onConfigChange(nextConfig);
        void mutate<SiteConfigApiResponse>(
          "/api/site-config",
          (current) => ({
            ...(current ?? { code: 200, message: "Success", data: null }),
            code: 200,
            message: "Success",
            data: nextConfig,
          }),
          { revalidate: false }
        );
        onShowToast({ message: "站点设置已保存", type: "success" });
      } else {
        onShowToast({
          message: result.message || "保存失败",
          type: "error",
        });
      }
    } catch (error) {
      console.error("保存站点配置失败:", error);
      onShowToast({ message: "保存失败", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333]">
        <h2 className="text-xl font-bold text-white mb-1">站点设置</h2>
        <p className="text-sm text-[#9b9b9b] mb-6">
          用于顶部品牌名称和浏览器标题。未配置时将回退到环境变量。
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#b3b3b3] mb-2">
              站点名称
            </label>
            <input
              value={formData.siteName}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  siteName: event.target.value,
                }))
              }
              maxLength={60}
              className="w-full px-4 py-3 bg-[#141414] border border-[#333] rounded text-white placeholder-[#777] focus:outline-none focus:ring-2 focus:ring-[#E50914] focus:border-transparent"
              placeholder="例如：宝拓影视"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#b3b3b3] mb-2">
              浏览器标题
            </label>
            <input
              value={formData.siteTitle}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  siteTitle: event.target.value,
                }))
              }
              maxLength={120}
              className="w-full px-4 py-3 bg-[#141414] border border-[#333] rounded text-white placeholder-[#777] focus:outline-none focus:ring-2 focus:ring-[#E50914] focus:border-transparent"
              placeholder="例如：宝拓影视 - 免费影视在线观看"
            />
            <button
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  siteTitle: `${prev.siteName || "宝拓影视"} - 免费影视在线观看`,
                }))
              }
              className="mt-2 text-xs text-[#E50914] hover:text-[#ff3b43] transition-colors"
            >
              使用“站点名称 + 默认后缀”
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#b3b3b3] mb-2">
              站点描述
            </label>
            <textarea
              value={formData.siteDescription}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  siteDescription: event.target.value,
                }))
              }
              maxLength={240}
              rows={4}
              className="w-full px-4 py-3 bg-[#141414] border border-[#333] rounded text-white placeholder-[#777] focus:outline-none focus:ring-2 focus:ring-[#E50914] focus:border-transparent resize-none"
              placeholder="用于 SEO 的站点描述"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-2 bg-[#E50914] hover:bg-[#b20710] disabled:bg-[#7a1a1f] disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
          >
            {saving ? "保存中..." : "保存站点设置"}
          </button>
          <span className="text-xs text-[#8c8c8c]">
            {dirty ? "有未保存更改" : "已同步最新配置"}
          </span>
        </div>
      </div>
    </div>
  );
}
