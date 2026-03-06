"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function UserLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password }),
      });
      const result = await response.json();

      if (response.ok && result.code === 200) {
        router.push(redirect);
        router.refresh();
        return;
      }

      setError(result.message || "登录失败");
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#141414]">
      <div className="w-full max-w-md px-6">
        <div className="bg-[#1a1a1a] rounded-lg shadow-2xl p-10 border border-[#333]">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#E50914] mb-2">用户登录</h1>
            <p className="text-[#808080]">宝拓影视账号系统</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-[#b3b3b3] mb-2">邮箱或用户名</label>
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="w-full px-4 py-3 bg-[#333] border border-[#454545] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                placeholder="请输入邮箱或用户名"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[#b3b3b3] mb-2">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#333] border border-[#454545] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                placeholder="请输入密码"
                required
              />
            </div>

            {error && (
              <div className="bg-[#E50914]/10 border border-[#E50914]/50 rounded p-3 text-[#E50914] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E50914] hover:bg-[#B20710] disabled:bg-[#831010] text-white font-bold py-3 rounded transition"
            >
              {loading ? "登录中..." : "登录"}
            </button>

            <div className="text-right text-sm">
              <Link href="/user/forgot-password" className="text-[#b3b3b3] hover:text-[#E50914]">
                忘记密码？
              </Link>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-[#8c8c8c]">
            还没有账号？
            <Link href="/user/register" className="text-[#E50914] ml-2 hover:underline">
              立即注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserLoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#141414]">
      <div className="text-[#b3b3b3]">加载中...</div>
    </div>
  );
}

export default function UserLoginPage() {
  return (
    <Suspense fallback={<UserLoginFallback />}>
      <UserLoginContent />
    </Suspense>
  );
}
