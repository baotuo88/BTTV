"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSiteConfig } from "@/hooks/useSiteConfig";

export default function UserRegisterPage() {
  const router = useRouter();
  const siteConfig = useSiteConfig();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/user/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const result = await response.json();

      if (response.ok && result.code === 200) {
        router.push("/");
        router.refresh();
        return;
      }

      setError(result.message || "注册失败");
    } catch {
      setError("注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#141414]">
      <div className="w-full max-w-md px-6">
        <div className="bg-[#1a1a1a] rounded-lg shadow-2xl p-10 border border-[#333]">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#E50914] mb-2">用户注册</h1>
            <p className="text-[#808080]">创建你的{siteConfig.siteName}账号</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-[#b3b3b3] mb-2">用户名</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-[#333] border border-[#454545] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                placeholder="2-20位，支持中英文/数字/_"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[#b3b3b3] mb-2">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#333] border border-[#454545] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#E50914]"
                placeholder="请输入邮箱"
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
                placeholder="至少6位"
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
              {loading ? "注册中..." : "注册并登录"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-[#8c8c8c]">
            已有账号？
            <Link href="/user/login" className="text-[#E50914] ml-2 hover:underline">
              去登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
