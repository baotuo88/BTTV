"use client";

import { useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import type {
  OperationsConfigData,
  OperationsNavLink,
  OperationsQuickEntry,
} from "@/types/operations-config";
import type { OperationsSettingsTabProps } from "./types";

interface OperationsConfigApiResponse {
  code: number;
  message: string;
  data: OperationsConfigData | null;
}

function normalizeConfig(config: OperationsConfigData): OperationsConfigData {
  return {
    announcement: {
      enabled: !!config.announcement?.enabled,
      text: config.announcement?.text || "",
      href: config.announcement?.href || "",
    },
    quickEntries: Array.isArray(config.quickEntries) ? config.quickEntries : [],
    navLinks: Array.isArray(config.navLinks) ? config.navLinks : [],
    showGithubLink: config.showGithubLink ?? true,
    updatedAt: config.updatedAt,
  };
}

export function OperationsSettingsTab({
  operationsConfig,
  onConfigChange,
  onShowToast,
}: OperationsSettingsTabProps) {
  const { mutate } = useSWRConfig();
  const [formData, setFormData] = useState<OperationsConfigData>(
    normalizeConfig(operationsConfig)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData(normalizeConfig(operationsConfig));
  }, [operationsConfig]);

  const dirty = useMemo(() => {
    return JSON.stringify(normalizeConfig(formData)) !== JSON.stringify(normalizeConfig(operationsConfig));
  }, [formData, operationsConfig]);

  const addQuickEntry = () => {
    setFormData((prev) => ({
      ...prev,
      quickEntries: [
        ...prev.quickEntries,
        {
          id: `entry-${Date.now()}`,
          enabled: true,
          title: "",
          subtitle: "",
          href: "/",
        },
      ],
    }));
  };

  const addNavLink = () => {
    setFormData((prev) => ({
      ...prev,
      navLinks: [
        ...prev.navLinks,
        {
          id: `nav-${Date.now()}`,
          enabled: true,
          label: "",
          href: "/",
          newTab: false,
        },
      ],
    }));
  };

  const updateQuickEntry = (index: number, patch: Partial<OperationsQuickEntry>) => {
    setFormData((prev) => ({
      ...prev,
      quickEntries: prev.quickEntries.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry
      ),
    }));
  };

  const updateNavLink = (index: number, patch: Partial<OperationsNavLink>) => {
    setFormData((prev) => ({
      ...prev,
      navLinks: prev.navLinks.map((link, i) =>
        i === index ? { ...link, ...patch } : link
      ),
    }));
  };

  const removeQuickEntry = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      quickEntries: prev.quickEntries.filter((_, i) => i !== index),
    }));
  };

  const removeNavLink = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      navLinks: prev.navLinks.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/operations-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await response.json();

      if (result.code === 200 && result.data) {
        const nextConfig = result.data as OperationsConfigData;
        onConfigChange(nextConfig);
        void mutate<OperationsConfigApiResponse>(
          "/api/operations-config",
          {
            code: 200,
            message: "Success",
            data: nextConfig,
          },
          { revalidate: false }
        );
        onShowToast({ message: "运营配置已保存", type: "success" });
      } else {
        onShowToast({
          message: result.message || "保存失败",
          type: "error",
        });
      }
    } catch (error) {
      console.error("保存运营配置失败:", error);
      onShowToast({ message: "保存失败", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333] space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">运营配置中心</h2>
          <p className="text-sm text-[#9b9b9b]">
            管理首页公告、运营入口和自定义导航菜单。
          </p>
        </div>

        <section className="space-y-4 border border-[#333] rounded-lg p-4 bg-[#141414]">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">首页公告栏</h3>
            <label className="inline-flex items-center gap-2 text-sm text-[#b3b3b3]">
              <input
                type="checkbox"
                checked={formData.announcement.enabled}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    announcement: {
                      ...prev.announcement,
                      enabled: event.target.checked,
                    },
                  }))
                }
              />
              启用
            </label>
          </div>
          <input
            value={formData.announcement.text}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                announcement: {
                  ...prev.announcement,
                  text: event.target.value,
                },
              }))
            }
            maxLength={120}
            className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-sm"
            placeholder="公告内容，例如：本周热播专题上线"
          />
          <input
            value={formData.announcement.href}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                announcement: {
                  ...prev.announcement,
                  href: event.target.value,
                },
              }))
            }
            maxLength={240}
            className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-sm"
            placeholder="公告链接（可选），例如：/browse/latest"
          />
        </section>

        <section className="space-y-4 border border-[#333] rounded-lg p-4 bg-[#141414]">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">首页运营入口</h3>
            <button
              onClick={addQuickEntry}
              className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-white rounded text-xs"
            >
              添加入口
            </button>
          </div>
          <div className="space-y-3">
            {formData.quickEntries.map((entry, index) => (
              <div
                key={entry.id}
                className="border border-[#2f2f2f] rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#9b9b9b]">入口 {index + 1}</span>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1 text-xs text-[#b3b3b3]">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onChange={(event) =>
                          updateQuickEntry(index, { enabled: event.target.checked })
                        }
                      />
                      启用
                    </label>
                    <button
                      onClick={() => removeQuickEntry(index)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <input
                  value={entry.title}
                  onChange={(event) =>
                    updateQuickEntry(index, { title: event.target.value })
                  }
                  maxLength={40}
                  className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-sm"
                  placeholder="入口标题"
                />
                <input
                  value={entry.subtitle}
                  onChange={(event) =>
                    updateQuickEntry(index, { subtitle: event.target.value })
                  }
                  maxLength={80}
                  className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-sm"
                  placeholder="入口副标题"
                />
                <input
                  value={entry.href}
                  onChange={(event) =>
                    updateQuickEntry(index, { href: event.target.value })
                  }
                  maxLength={240}
                  className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-sm"
                  placeholder="入口链接"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 border border-[#333] rounded-lg p-4 bg-[#141414]">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">导航扩展菜单</h3>
            <button
              onClick={addNavLink}
              className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-white rounded text-xs"
            >
              添加菜单
            </button>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-[#b3b3b3]">
            <input
              type="checkbox"
              checked={formData.showGithubLink}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  showGithubLink: event.target.checked,
                }))
              }
            />
            显示 Github 菜单
          </label>
          <div className="space-y-3">
            {formData.navLinks.map((link, index) => (
              <div
                key={link.id}
                className="border border-[#2f2f2f] rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#9b9b9b]">菜单 {index + 1}</span>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1 text-xs text-[#b3b3b3]">
                      <input
                        type="checkbox"
                        checked={link.enabled}
                        onChange={(event) =>
                          updateNavLink(index, { enabled: event.target.checked })
                        }
                      />
                      启用
                    </label>
                    <label className="inline-flex items-center gap-1 text-xs text-[#b3b3b3]">
                      <input
                        type="checkbox"
                        checked={link.newTab}
                        onChange={(event) =>
                          updateNavLink(index, { newTab: event.target.checked })
                        }
                      />
                      新窗口
                    </label>
                    <button
                      onClick={() => removeNavLink(index)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <input
                  value={link.label}
                  onChange={(event) =>
                    updateNavLink(index, { label: event.target.value })
                  }
                  maxLength={20}
                  className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-sm"
                  placeholder="菜单名称"
                />
                <input
                  value={link.href}
                  onChange={(event) =>
                    updateNavLink(index, { href: event.target.value })
                  }
                  maxLength={240}
                  className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-sm"
                  placeholder="菜单链接"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-2 bg-[#E50914] hover:bg-[#b20710] disabled:bg-[#7a1a1f] disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
          >
            {saving ? "保存中..." : "保存运营配置"}
          </button>
          <span className="text-xs text-[#8c8c8c]">
            {dirty ? "有未保存更改" : "已同步最新配置"}
          </span>
        </div>
      </div>
    </div>
  );
}
