"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import type { AdminUserItem } from "@/types/user";
import type { UserManagementTabProps } from "./types";

function formatDate(dateString?: string): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function UserManagementTab({
  onShowToast,
  onShowConfirm,
}: UserManagementTabProps) {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [submittingUserId, setSubmittingUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const query = search.trim();
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        const url = `/api/admin/users${params.toString() ? `?${params.toString()}` : ""}`;
        const response = await fetch(url, { cache: "no-store" });
        const result = await response.json();

        if (result.code !== 200) {
          throw new Error(result.message || "加载用户列表失败");
        }

        setUsers(Array.isArray(result.data?.users) ? result.data.users : []);
      } catch (error) {
        onShowToast({
          message: error instanceof Error ? error.message : "加载用户列表失败",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [onShowToast]
  );

  useEffect(() => {
    fetchUsers(keyword);
  }, [fetchUsers, keyword]);

  const activeUserCount = useMemo(
    () => users.filter((user) => !user.disabled).length,
    [users]
  );

  const handleSearch = () => {
    setKeyword(searchInput.trim());
  };

  const handleRefresh = async () => {
    await fetchUsers(keyword);
  };

  const updateUserStatus = (user: AdminUserItem, disabled: boolean) => {
    onShowConfirm({
      title: disabled ? "禁用用户" : "启用用户",
      message: disabled
        ? `确定要禁用用户「${user.username}」吗？禁用后将立即失效所有登录会话。`
        : `确定要启用用户「${user.username}」吗？`,
      danger: disabled,
      onConfirm: async () => {
        try {
          setSubmittingUserId(user.id);
          const response = await fetch("/api/admin/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, disabled }),
          });
          const result = await response.json();

          if (result.code !== 200) {
            throw new Error(result.message || "操作失败");
          }

          onShowToast({
            message: disabled ? "用户已禁用" : "用户已启用",
            type: "success",
          });
          await fetchUsers(keyword);
        } catch (error) {
          onShowToast({
            message: error instanceof Error ? error.message : "操作失败",
            type: "error",
          });
        } finally {
          setSubmittingUserId(null);
        }
      },
    });
  };

  const deleteUser = (user: AdminUserItem) => {
    onShowConfirm({
      title: "删除用户",
      message: `确定要删除用户「${user.username}」吗？该用户的登录会话将被清空，此操作不可恢复。`,
      danger: true,
      onConfirm: async () => {
        try {
          setSubmittingUserId(user.id);
          const response = await fetch("/api/admin/users", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          });
          const result = await response.json();

          if (result.code !== 200) {
            throw new Error(result.message || "删除失败");
          }

          onShowToast({ message: "用户已删除", type: "success" });
          await fetchUsers(keyword);
        } catch (error) {
          onShowToast({
            message: error instanceof Error ? error.message : "删除失败",
            type: "error",
          });
        } finally {
          setSubmittingUserId(null);
        }
      },
    });
  };

  const resetUserPassword = (user: AdminUserItem) => {
    const firstInput = window.prompt(
      `请输入用户「${user.username}」的新密码（至少 6 位）`
    );
    if (firstInput === null) return;

    const newPassword = firstInput.trim();
    if (newPassword.length < 6) {
      onShowToast({ message: "密码至少 6 位", type: "warning" });
      return;
    }

    const secondInput = window.prompt("请再次输入新密码确认");
    if (secondInput === null) return;
    if (newPassword !== secondInput.trim()) {
      onShowToast({ message: "两次输入密码不一致", type: "error" });
      return;
    }

    onShowConfirm({
      title: "重置密码",
      message: `确定重置用户「${user.username}」的密码吗？重置后该用户将被强制下线。`,
      danger: true,
      onConfirm: async () => {
        try {
          setSubmittingUserId(user.id);
          const response = await fetch("/api/admin/users/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, newPassword }),
          });
          const result = await response.json();

          if (result.code !== 200) {
            throw new Error(result.message || "重置密码失败");
          }

          onShowToast({ message: "密码已重置", type: "success" });
          await fetchUsers(keyword);
        } catch (error) {
          onShowToast({
            message: error instanceof Error ? error.message : "重置密码失败",
            type: "error",
          });
        } finally {
          setSubmittingUserId(null);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users size={20} />
              用户管理
            </h2>
            <p className="text-sm text-[#aaa]">
              用户总数 {users.length}，启用 {activeUserCount}，禁用{" "}
              {users.length - activeUserCount}
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch();
                }}
                placeholder="搜索用户名或邮箱"
                className="w-56 bg-[#111] border border-[#333] text-white rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#E50914]"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 rounded-lg bg-[#E50914] hover:bg-[#B20710] text-white text-sm transition"
            >
              搜索
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-white text-sm transition disabled:opacity-60"
              title="刷新"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a1a] rounded-xl border border-[#333] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#202020] border-b border-[#333]">
              <tr className="text-left text-[#999]">
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">会话数</th>
                <th className="px-4 py-3 font-medium">注册时间</th>
                <th className="px-4 py-3 font-medium">最近登录</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#888]">
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw size={16} className="animate-spin" />
                      加载中...
                    </span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#888]">
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-[#2a2a2a] last:border-0">
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="text-white flex items-center gap-2">
                          <UserCheck size={15} className="text-[#aaa]" />
                          <span>{user.username}</span>
                        </div>
                        <div className="text-[#999] text-xs flex items-center gap-1">
                          <Mail size={13} />
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {user.disabled ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-900/40 text-red-300 border border-red-700/40">
                          已禁用
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-900/30 text-green-300 border border-green-700/40">
                          正常
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[#ddd]">{user.activeSessionCount}</td>
                    <td className="px-4 py-4 text-[#bbb]">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-4 text-[#bbb]">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          disabled={submittingUserId === user.id}
                          onClick={() => updateUserStatus(user, !user.disabled)}
                          className={`px-3 py-1.5 rounded text-xs transition disabled:opacity-60 ${
                            user.disabled
                              ? "bg-green-700 hover:bg-green-600 text-white"
                              : "bg-yellow-700 hover:bg-yellow-600 text-white"
                          }`}
                        >
                          {user.disabled ? (
                            <span className="inline-flex items-center gap-1">
                              <UserCheck size={14} />
                              启用
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Ban size={14} />
                              禁用
                            </span>
                          )}
                        </button>
                        <button
                          disabled={submittingUserId === user.id}
                          onClick={() => resetUserPassword(user)}
                          className="px-3 py-1.5 rounded text-xs bg-blue-700 hover:bg-blue-600 text-white transition disabled:opacity-60"
                        >
                          <span className="inline-flex items-center gap-1">
                            <KeyRound size={14} />
                            重置密码
                          </span>
                        </button>
                        <button
                          disabled={submittingUserId === user.id}
                          onClick={() => deleteUser(user)}
                          className="px-3 py-1.5 rounded text-xs bg-red-700 hover:bg-red-600 text-white transition disabled:opacity-60"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Trash2 size={14} />
                            删除
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
