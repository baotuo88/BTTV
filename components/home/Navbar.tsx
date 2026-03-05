"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X, Home, Film, Tv, Clock, Video, Github, Calendar, History } from "lucide-react";
import { HistoryPopup } from "./HistoryPopup";
import type { UserPublic } from "@/types/user";

interface NavbarProps {
  scrolled: boolean;
  onSearchOpen: () => void;
}

export function Navbar({ scrolled, onSearchOpen }: NavbarProps) {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // 防止移动端菜单打开时页面滚动
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      try {
        const response = await fetch("/api/user/me", { cache: "no-store" });
        if (!mounted) return;
        if (!response.ok) {
          setCurrentUser(null);
          return;
        }
        const result = await response.json();
        setCurrentUser(result?.data?.user || null);
      } catch {
        if (mounted) setCurrentUser(null);
      }
    };

    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const handleUserLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/user/logout", { method: "POST" });
      setCurrentUser(null);
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  const navItems = [
    { href: "/", label: "首页", icon: Home },
    { href: "/browse/movies", label: "电影", icon: Film },
    { href: "/browse/tv", label: "电视剧", icon: Tv },
    { href: "/calendar", label: "追剧日历", icon: Calendar },
    { href: "/browse/latest", label: "最新", icon: Clock },
    { href: "/history", label: "历史记录", icon: History, mobileOnly: true },
    {
      label: "短剧",
      icon: Video,
      children: [
        { href: "/shorts", label: "短剧" },
        { href: "/dailymotion", label: "短剧Motion" },
      ],
    },
    {
      href: "https://github.com/baotuo88/BTTV",
      label: "Github",
      icon: Github,
      external: true,
    },
  ];

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-black"
            : "bg-gradient-to-b from-black/80 to-transparent"
        }`}
      >
        <div className="px-4 md:px-12 py-3 md:py-4 flex items-center justify-between">
          {/* 左侧：汉堡菜单（移动端）+ Logo */}
          <div className="flex items-center space-x-2 md:space-x-8">
            {/* 汉堡菜单按钮 - 仅移动端 */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="菜单"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-white" />
              ) : (
                <Menu className="w-6 h-6 text-white" />
              )}
            </button>

            {/* Logo */}
            <Link 
              href="/" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-1"
            >
              <img
                className="w-8 h-8 md:w-10 md:h-10"
                src="/logo.png"
                alt="logo"
              />
              <span className="text-red-600 text-xl md:text-2xl lg:text-3xl font-bold tracking-tight hover:text-red-500 transition-colors">
                宝拓影视
              </span>
            </Link>

            {/* 导航链接 - 桌面端 */}
            <div className="hidden md:flex items-center space-x-6">
              {navItems.filter(item => !('mobileOnly' in item && item.mobileOnly)).map((item) =>
                item.children ? (
                  <div
                    key={item.label}
                    className="relative group"
                    onMouseEnter={() => setOpenDropdown(item.label)}
                    onMouseLeave={() => setOpenDropdown(null)}
                  >
                    <button className="text-gray-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-1 py-2">
                      {item.label}
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${
                          openDropdown === item.label ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {/* 下拉菜单 - 使用 pt-2 创建无缝hover区域 */}
                    {openDropdown === item.label && (
                      <div className="absolute top-full left-0 pt-1">
                        <div className="py-2 bg-zinc-900 rounded-lg shadow-2xl border border-zinc-800 min-w-[140px] overflow-hidden">
                          {/* 顶部红色装饰线 - Netflix风格 */}
                          <div className="absolute top-1 left-0 right-0 h-0.5 bg-red-600" />
                          {item.children.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              className="block px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-red-600/20 transition-colors"
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href!}
                    target={item.external ? "_blank" : undefined}
                    className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
                  >
                    {item.label}
                  </Link>
                )
              )}
            </div>
          </div>

          {/* 右侧功能区 */}
          <div className="flex items-center space-x-1 md:space-x-2">
            {/* 用户入口（桌面） */}
            <div className="hidden md:flex items-center gap-2 mr-1">
              {currentUser ? (
                <>
                  <span className="text-sm text-gray-300 max-w-[120px] truncate">
                    {currentUser.username}
                  </span>
                  <button
                    onClick={handleUserLogout}
                    disabled={loggingOut}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-60 transition-colors"
                  >
                    {loggingOut ? "退出中..." : "退出"}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/user/login"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    登录
                  </Link>
                  <Link
                    href="/user/register"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                  >
                    注册
                  </Link>
                </>
              )}
            </div>

            {/* 搜索按钮 */}
            <button
              onClick={onSearchOpen}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              aria-label="搜索"
            >
              <svg
                className="w-5 h-5 md:w-6 md:h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>

            {/* 历史记录弹出 */}
            <HistoryPopup />
          </div>
        </div>
      </nav>

      {/* 移动端侧边栏菜单 */}
      <div
        className={`md:hidden fixed inset-0 z-[60] transition-opacity duration-300 ${
          isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* 背景遮罩 */}
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* 侧边栏内容 */}
        <div
          className={`absolute top-0 left-0 h-full w-[280px] bg-gradient-to-b from-gray-900 to-black shadow-2xl transform transition-transform duration-300 ease-out ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* 侧边栏头部 */}
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <img className="w-10 h-10" src="/logo.png" alt="logo" />
              <h2 className="text-red-600 text-2xl font-bold tracking-tight">
                宝拓影视
              </h2>
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className="p-4 space-y-2">
            {/* 用户入口（移动端） */}
            <div className="px-4 py-3 border-b border-gray-800 mb-2">
              {currentUser ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300 truncate max-w-[160px]">
                    {currentUser.username}
                  </span>
                  <button
                    onClick={handleUserLogout}
                    disabled={loggingOut}
                    className="px-3 py-1 rounded text-xs text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors"
                  >
                    {loggingOut ? "退出中..." : "退出"}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link
                    href="/user/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex-1 text-center px-3 py-2 rounded text-sm text-gray-200 border border-gray-700 hover:bg-white/10 transition-colors"
                  >
                    登录
                  </Link>
                  <Link
                    href="/user/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex-1 text-center px-3 py-2 rounded text-sm text-white bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    注册
                  </Link>
                </div>
              )}
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              if (item.children) {
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center space-x-3 px-4 py-3 text-gray-400">
                      <Icon className="w-5 h-5" />
                      <span className="text-base font-medium">
                        {item.label}
                      </span>
                    </div>
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center space-x-3 px-4 py-2 pl-12 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-200"
                      >
                        <span className="text-sm font-medium">
                          {child.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  target={item.external ? "_blank" : undefined}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-200 group"
                >
                  <Icon className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" />
                  <span className="text-base font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* 侧边栏底部 */}
          <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 text-center">
              © 2026 宝拓影视 · 海量影视随心看
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
