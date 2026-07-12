"use client";

import { useState, useEffect, useCallback } from "react";

const SEARCH_HISTORY_KEY = "search_history";
const MAX_HISTORY_ITEMS = 10;

function readSearchHistory(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_ITEMS) : [];
  } catch {
    return [];
  }
}

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([]);

  // 初始加载
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistory(readSearchHistory());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  // 添加搜索记录
  const addToHistory = useCallback((keyword: string) => {
    if (typeof window === "undefined" || !keyword.trim()) return;

    try {
      let items = readSearchHistory();

      // 移除已存在的相同关键词（避免重复）
      items = items.filter((item) => item !== keyword.trim());

      // 添加到开头
      items.unshift(keyword.trim());

      // 限制数量
      items = items.slice(0, MAX_HISTORY_ITEMS);

      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items));
      setHistory(items);
    } catch {
      // 静默失败
    }
  }, []);

  // 移除单条记录
  const removeFromHistory = useCallback((keyword: string) => {
    if (typeof window === "undefined") return;

    try {
      let items = readSearchHistory();

      items = items.filter((item) => item !== keyword);

      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items));
      setHistory(items);
    } catch {
      // 静默失败
    }
  }, []);

  // 清除全部历史
  const clearHistory = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
      setHistory([]);
    } catch {
      // 静默失败
    }
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
