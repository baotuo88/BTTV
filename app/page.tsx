"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DoubanMovie } from "@/types/douban";
import type { NewApiMovie } from "@/types/home";
import { Toast } from "@/components/Toast";

// Hooks
import { useScrollState } from "@/hooks/useScrollState";
import { useHomeData } from "@/hooks/useHomeData";
import { useMovieMatch } from "@/hooks/useMovieMatch";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useOperationsConfig } from "@/hooks/useOperationsConfig";

// Components
import { Navbar } from "@/components/home/Navbar";
import { SearchModal } from "@/components/home/SearchModal";
import { LoadingSkeleton } from "@/components/home/LoadingSkeleton";
import { ErrorState } from "@/components/home/ErrorState";
import { EmptyState } from "@/components/home/EmptyState";
import { HeroBanner } from "@/components/home/HeroBanner";
import { CategoryRow } from "@/components/home/CategoryRow";
import { LoadingOverlay } from "@/components/home/LoadingOverlay";
import { Footer } from "@/components/home/Footer";

// Utils
import { getCategoryIcon, getCategoryPath } from "@/lib/utils/category-icons";

export default function HomePage() {
  const router = useRouter();
  const [showSearch, setShowSearch] = useState(false);

  // 使用自定义 hooks
  const scrolled = useScrollState(50);
  const operationsConfig = useOperationsConfig();
  const { categories, heroMovies, heroDataList, loading, error, refetch } =
    useHomeData();
  const { matchingMovie, handleMovieClick, toast, setToast } = useMovieMatch();

  // 滚动位置恢复（导航返回时保持位置）
  useScrollRestoration("home", { delay: 100 });

  return (
    <div className="min-h-screen bg-black">
      {/* 导航栏 */}
      <Navbar scrolled={scrolled} onSearchOpen={() => setShowSearch(true)} />

      {/* 搜索弹窗 */}
      <SearchModal isOpen={showSearch} onClose={() => setShowSearch(false)} />

      {/* 加载状态 */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        /* 错误状态 */
        <ErrorState error={error} onRetry={refetch} />
      ) : heroMovies.length === 0 && categories.length === 0 ? (
        /* 空状态 - 只有当所有数据都为空时才显示 */
        <EmptyState onRetry={refetch} />
      ) : (
        <>
          {/* 首页公告 */}
          {operationsConfig.announcement.enabled &&
            operationsConfig.announcement.text && (
              <div className="relative z-40 mt-16 md:mt-20 px-4 md:px-12">
                {operationsConfig.announcement.href ? (
                  <a
                    href={operationsConfig.announcement.href}
                    className="block rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-200 hover:bg-yellow-500/20 transition-colors"
                  >
                    📢 {operationsConfig.announcement.text}
                  </a>
                ) : (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-200">
                    📢 {operationsConfig.announcement.text}
                  </div>
                )}
              </div>
            )}

          {/* Hero Banner */}
          <HeroBanner
            heroMovies={heroMovies}
            heroDataList={heroDataList}
            onMovieClick={handleMovieClick}
          />

          {/* 运营入口 */}
          {operationsConfig.quickEntries.filter(
            (entry) => entry.enabled && entry.title.trim() && entry.href.trim()
          ).length > 0 && (
            <section className="relative z-30 px-4 md:px-12 -mt-2 md:mt-0 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {operationsConfig.quickEntries
                  .filter(
                    (entry) =>
                      entry.enabled && entry.title.trim() && entry.href.trim()
                  )
                  .map((entry) => {
                    const external =
                      entry.href.startsWith("http://") ||
                      entry.href.startsWith("https://");
                    return (
                      <Link
                        key={entry.id}
                        href={entry.href}
                        target={external ? "_blank" : undefined}
                        className="group rounded-xl border border-white/10 bg-black/35 backdrop-blur-sm p-4 hover:border-red-500/40 hover:bg-black/50 transition-all"
                      >
                        <div className="text-white font-semibold group-hover:text-red-400 transition-colors">
                          {entry.title}
                        </div>
                        {entry.subtitle && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {entry.subtitle}
                          </p>
                        )}
                      </Link>
                    );
                  })}
              </div>
            </section>
          )}

          {/* 分类列表区域 */}
          <div className="relative z-20 space-y-10 md:space-y-12 lg:space-y-16 pb-16">

            {/* 渲染所有新 API 返回的分类 */}
            {categories.length > 0
              ? categories.map((category, index) => {
                  // 转换数据格式为 DoubanMovie
                  const movies: DoubanMovie[] = category.data.map(
                    (item: NewApiMovie) => ({
                      id: item.id,
                      title: item.title,
                      cover: item.cover || "",
                      url: item.url || "",
                      rate: item.rate || "",
                      episode_info: (item.episode_info as string) || "",
                      cover_x: (item.cover_x as number) || 0,
                      cover_y: (item.cover_y as number) || 0,
                      playable: (item.playable as boolean) || false,
                      is_new: (item.is_new as boolean) || false,
                    })
                  );

                  return (
                    <CategoryRow
                      key={index}
                      title={category.name}
                      icon={getCategoryIcon(category.name)}
                      movies={movies}
                      onMovieClick={handleMovieClick}
                      onViewMore={() =>
                        router.push(
                          `/category/${getCategoryPath(category.name)}`
                        )
                      }
                    />
                  );
                })
              : null}
          </div>
        </>
      )}

      {/* 匹配中遮罩 */}
      {matchingMovie && <LoadingOverlay />}

      {/* Toast 通知 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Footer */}
      <Footer />
    </div>
  );
}
