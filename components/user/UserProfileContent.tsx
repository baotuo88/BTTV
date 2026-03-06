"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserLibraryItem, UserProgressItem, UserPublic } from "@/types/user";
import { Heart, ListChecks, Clock3, PlayCircle, Trash2 } from "lucide-react";

type LibraryType = "favorite" | "follow" | "watch_later";
export type UserProfileMode =
  | "all"
  | "account"
  | "security"
  | "favorite"
  | "follow"
  | "watch_later"
  | "progress";

const LIBRARY_LABELS: Record<LibraryType, string> = {
  favorite: "收藏",
  follow: "追剧清单",
  watch_later: "稍后再看",
};

const MODE_META: Record<UserProfileMode, { title: string; subtitle: string }> = {
  all: { title: "个人中心", subtitle: "管理账号、清单与云端观看进度" },
  account: { title: "个人资料", subtitle: "管理你的账号基础信息" },
  security: { title: "密码安全", subtitle: "修改并保护你的账号密码" },
  favorite: { title: "我的收藏", subtitle: "查看并管理你收藏的影视" },
  follow: { title: "追剧清单", subtitle: "查看并管理你关注的剧集" },
  watch_later: { title: "稍后再看", subtitle: "查看并管理稍后观看内容" },
  progress: { title: "云端续播", subtitle: "跨设备同步的观看进度" },
};

function isLibraryMode(mode: UserProfileMode): mode is LibraryType {
  return mode === "favorite" || mode === "follow" || mode === "watch_later";
}

interface UserProfileContentProps {
  mode?: UserProfileMode;
}

export function UserProfileContent({ mode = "all" }: UserProfileContentProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [library, setLibrary] = useState<Record<LibraryType, UserLibraryItem[]>>({
    favorite: [],
    follow: [],
    watch_later: [],
  });
  const [progressItems, setProgressItems] = useState<UserProgressItem[]>([]);

  const showAccount = mode === "all" || mode === "account";
  const showSecurity = mode === "all" || mode === "security";
  const showLibrary = mode === "all" || isLibraryMode(mode);
  const showProgress = mode === "all" || mode === "progress";

  const visibleLibraryTypes = useMemo<LibraryType[]>(() => {
    if (!showLibrary) return [];
    if (mode === "all") return ["favorite", "follow", "watch_later"];
    return isLibraryMode(mode) ? [mode] : [];
  }, [mode, showLibrary]);

  const hasVisibleLibraryData = useMemo(
    () => visibleLibraryTypes.some((type) => library[type].length > 0),
    [visibleLibraryTypes, library]
  );

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const profileRes = await fetch("/api/user/profile", { cache: "no-store" });
      const profileResult = await profileRes.json();
      if (!profileRes.ok || profileResult.code !== 200) {
        throw new Error(profileResult.message || "获取用户信息失败");
      }

      const currentUser: UserPublic = profileResult.data.user;
      setUser(currentUser);
      setUsername(currentUser.username || "");

      const [favoriteRes, followRes, laterRes, progressRes] = await Promise.all([
        fetch("/api/user/library?type=favorite&limit=30", { cache: "no-store" }),
        fetch("/api/user/library?type=follow&limit=30", { cache: "no-store" }),
        fetch("/api/user/library?type=watch_later&limit=30", { cache: "no-store" }),
        fetch("/api/user/progress?limit=50", { cache: "no-store" }),
      ]);

      const [favoriteData, followData, laterData, progressData] = await Promise.all([
        favoriteRes.json(),
        followRes.json(),
        laterRes.json(),
        progressRes.json(),
      ]);

      setLibrary({
        favorite: Array.isArray(favoriteData?.data?.items) ? favoriteData.data.items : [],
        follow: Array.isArray(followData?.data?.items) ? followData.data.items : [],
        watch_later: Array.isArray(laterData?.data?.items) ? laterData.data.items : [],
      });

      setProgressItems(
        Array.isArray(progressData?.data?.items) ? progressData.data.items : []
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setSavingProfile(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 200) {
        throw new Error(result.message || "保存失败");
      }
      setUser(result.data.user);
      setMessage("资料已更新");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setSavingPassword(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/user/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 200) {
        throw new Error(result.message || "修改密码失败");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("密码已更新");
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改密码失败");
    } finally {
      setSavingPassword(false);
    }
  };

  const removeLibraryItem = async (listType: LibraryType, itemId: string) => {
    try {
      const response = await fetch("/api/user/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listType, itemId }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 200) {
        throw new Error(result.message || "移除失败");
      }
      setLibrary((prev) => ({
        ...prev,
        [listType]: prev[listType].filter((item) => item.itemId !== itemId),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除失败");
    }
  };

  const removeProgressItem = async (item: UserProgressItem) => {
    try {
      const response = await fetch("/api/user/progress", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dramaId: item.dramaId, sourceKey: item.sourceKey || "" }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 200) {
        throw new Error(result.message || "删除失败");
      }
      setProgressItems((prev) =>
        prev.filter(
          (progress) =>
            !(progress.dramaId === item.dramaId && progress.sourceKey === item.sourceKey)
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#141414] flex items-center justify-center">
        <div className="text-[#b3b3b3]">加载中...</div>
      </div>
    );
  }

  const pageMeta = MODE_META[mode];

  return (
    <div className="min-h-screen bg-[#141414]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{pageMeta.title}</h1>
            <p className="text-[#8c8c8c] mt-1">{pageMeta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {mode !== "all" && (
              <Link
                href="/user/profile"
                className="px-4 py-2 rounded bg-[#222] hover:bg-[#333] text-white text-sm"
              >
                返回个人中心
              </Link>
            )}
            <Link
              href="/"
              className="px-4 py-2 rounded bg-[#333] hover:bg-[#444] text-white text-sm"
            >
              返回首页
            </Link>
          </div>
        </div>

        {message && (
          <div className="bg-green-500/10 border border-green-500/30 rounded p-3 text-green-400 text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {(showAccount || showSecurity) && (
          <div
            className={`grid grid-cols-1 gap-6 ${
              showAccount && showSecurity ? "lg:grid-cols-2" : "lg:grid-cols-1"
            }`}
          >
            {showAccount && (
              <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-6">
                <h2 className="text-lg font-semibold text-white mb-4">基础资料</h2>
                <form onSubmit={saveProfile} className="space-y-4">
                  <div>
                    <label className="block text-sm text-[#b3b3b3] mb-2">用户名</label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#b3b3b3] mb-2">邮箱</label>
                    <input
                      value={user?.email || ""}
                      disabled
                      className="w-full px-4 py-2.5 bg-[#111] border border-[#333] rounded text-[#999]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="w-full bg-[#E50914] hover:bg-[#B20710] disabled:bg-[#831010] text-white font-medium py-2.5 rounded"
                  >
                    {savingProfile ? "保存中..." : "保存资料"}
                  </button>
                </form>
              </div>
            )}

            {showSecurity && (
              <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-6">
                <h2 className="text-lg font-semibold text-white mb-4">修改密码</h2>
                <form onSubmit={changePassword} className="space-y-4">
                  <input
                    type="password"
                    placeholder="当前密码"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                  />
                  <input
                    type="password"
                    placeholder="新密码（至少6位）"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                  />
                  <input
                    type="password"
                    placeholder="确认新密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                  />
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="w-full bg-[#333] hover:bg-[#444] disabled:bg-[#222] text-white font-medium py-2.5 rounded"
                  >
                    {savingPassword ? "更新中..." : "更新密码"}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {showLibrary && (
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-6 space-y-5">
            <h2 className="text-lg font-semibold text-white">
              {mode === "all" ? "我的清单" : LIBRARY_LABELS[visibleLibraryTypes[0]]}
            </h2>

            {!hasVisibleLibraryData && (
              <p className="text-sm text-[#8c8c8c]">你还没有添加任何对应内容。</p>
            )}

            <div
              className={`grid grid-cols-1 gap-4 ${
                visibleLibraryTypes.length > 1 ? "md:grid-cols-3" : "md:grid-cols-1"
              }`}
            >
              {visibleLibraryTypes.map((listType) => (
                <div
                  key={listType}
                  className="bg-[#111] border border-[#2a2a2a] rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 text-white font-medium mb-3">
                    {listType === "favorite" && <Heart size={16} className="text-red-400" />}
                    {listType === "follow" && <ListChecks size={16} className="text-blue-400" />}
                    {listType === "watch_later" && <Clock3 size={16} className="text-amber-400" />}
                    {LIBRARY_LABELS[listType]}
                  </div>

                  <div className="space-y-2 max-h-72 overflow-auto">
                    {library[listType].length === 0 ? (
                      <p className="text-xs text-[#777]">暂无内容</p>
                    ) : (
                      library[listType].map((item) => (
                        <div
                          key={`${listType}-${item.itemId}`}
                          className="flex items-center gap-2 rounded bg-[#1a1a1a] border border-[#2f2f2f] p-2"
                        >
                          <Link
                            href={
                              item.sourceKey
                                ? `/play/${item.itemId}?source=${item.sourceKey}`
                                : `/play/${item.itemId}`
                            }
                            className="text-sm text-white truncate hover:text-[#E50914] flex-1"
                          >
                            {item.title}
                          </Link>
                          <button
                            onClick={() => removeLibraryItem(listType, item.itemId)}
                            className="p-1 text-[#999] hover:text-red-400"
                            aria-label="移除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showProgress && (
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">云端续播</h2>
            {progressItems.length === 0 ? (
              <p className="text-sm text-[#8c8c8c]">暂无云端播放进度。</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {progressItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#111] border border-[#2a2a2a] rounded-lg p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-sm font-medium truncate">{item.dramaName}</div>
                      <div className="text-xs text-[#888] mt-1">
                        第 {item.episodeIndex + 1} 集 · {Math.floor(item.positionSeconds)} 秒
                      </div>
                      <div className="mt-2">
                        <Link
                          href={
                            item.sourceKey
                              ? `/play/${item.dramaId}?source=${item.sourceKey}`
                              : `/play/${item.dramaId}`
                          }
                          className="inline-flex items-center gap-1 text-xs text-[#E50914] hover:underline"
                        >
                          <PlayCircle size={14} />
                          继续播放
                        </Link>
                      </div>
                    </div>
                    <button
                      onClick={() => removeProgressItem(item)}
                      className="p-1 text-[#999] hover:text-red-400"
                      aria-label="删除进度"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfileContent;
