"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/user/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 200) {
        throw new Error(result.message || "发送验证码失败");
      }
      setMessage(result.message || "验证码已发送");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送验证码失败");
    } finally {
      setSending(false);
    }
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setResetting(true);
    try {
      const response = await fetch("/api/user/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 200) {
        throw new Error(result.message || "重置密码失败");
      }
      setMessage(result.message || "密码已重置");
      setTimeout(() => router.push("/user/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置密码失败");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#141414]">
      <div className="w-full max-w-md px-6">
        <div className="bg-[#1a1a1a] rounded-lg shadow-2xl p-8 border border-[#333] space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#E50914] mb-2">找回密码</h1>
            <p className="text-[#808080] text-sm">通过邮箱验证码重置账号密码</p>
          </div>

          <form onSubmit={sendCode} className="space-y-3">
            <label className="block text-sm text-[#b3b3b3]">邮箱</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入注册邮箱"
                className="flex-1 px-4 py-2.5 bg-[#333] border border-[#454545] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                required
              />
              <button
                type="submit"
                disabled={sending}
                className="px-3 py-2.5 bg-[#E50914] hover:bg-[#B20710] disabled:bg-[#831010] text-white rounded text-sm"
              >
                {sending ? "发送中" : "发验证码"}
              </button>
            </div>
          </form>

          <form onSubmit={resetPassword} className="space-y-3">
            <div>
              <label className="block text-sm text-[#b3b3b3] mb-2">验证码</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6位验证码"
                className="w-full px-4 py-2.5 bg-[#333] border border-[#454545] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[#b3b3b3] mb-2">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少6位"
                className="w-full px-4 py-2.5 bg-[#333] border border-[#454545] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                required
              />
            </div>
            <button
              type="submit"
              disabled={resetting}
              className="w-full bg-[#E50914] hover:bg-[#B20710] disabled:bg-[#831010] text-white font-bold py-2.5 rounded"
            >
              {resetting ? "重置中..." : "重置密码"}
            </button>
          </form>

          {message && (
            <div className="bg-green-500/10 border border-green-500/30 rounded p-3 text-green-400 text-sm">
              {message}
            </div>
          )}
          {error && (
            <div className="bg-[#E50914]/10 border border-[#E50914]/40 rounded p-3 text-[#E50914] text-sm">
              {error}
            </div>
          )}

          <div className="text-center text-sm text-[#8c8c8c]">
            <Link href="/user/login" className="text-[#E50914] hover:underline">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
