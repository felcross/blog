import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "@/shared/api";
import { errorStateMessage } from "@/shared/error";
import { strings } from "@/shared/strings";
import { BlogCard } from "./BlogCard";
import type { Paginated, PostSummary } from "./types";

const PAGE_SIZE = 9;

function resolvePage(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("page") ?? "1");
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

export function BlogList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = resolvePage(searchParams);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["posts", { page, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<Paginated<PostSummary>>(`/posts?page=${page}&limit=${PAGE_SIZE}`),
  });

  function goToPage(next: number): void {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(next));
    }
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-light-bg text-text-on-light">
      <section className="py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <header className="mb-12">
            <p className="mb-4 text-xs uppercase tracking-[0.3em] text-accent">
              {strings.blog.kicker}
            </p>
            <h1 className="font-[family-name:var(--font-inter)] text-4xl font-black tracking-tight lg:text-5xl">
              {strings.blog.title}
            </h1>
          </header>

          {isPending ? (
            <p role="status" className="py-12 text-text-on-light-muted">
              {strings.loading}
            </p>
          ) : null}

          {isError ? (
            <div role="alert" className="py-12 text-center">
              <p className="mb-6 text-text-on-light-muted">{errorStateMessage(error)}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="min-h-11 rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent"
              >
                {strings.errors.retry}
              </button>
            </div>
          ) : null}

          {data && data.items.length === 0 ? (
            <div className="py-12 text-center">
              <h2 className="mb-3 font-[family-name:var(--font-inter)] text-2xl font-bold">
                {strings.blog.emptyTitle}
              </h2>
              <p className="text-text-on-light-muted">{strings.blog.emptyMessage}</p>
            </div>
          ) : null}

          {data && data.items.length > 0 ? (
            <>
              <div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 md:mx-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3">
                {data.items.map((post) => (
                  <div key={post.id} className="w-[85%] min-w-[85%] snap-start md:w-auto md:min-w-0">
                    <BlogCard
                      post={post}
                      isHovered={hoveredId === post.id}
                      isDimmed={hoveredId !== null && hoveredId !== post.id}
                      onHoverStart={() => setHoveredId(post.id)}
                      onHoverEnd={() => setHoveredId(null)}
                    />
                  </div>
                ))}
              </div>

              {data.totalPages > 1 ? (
                <nav
                  aria-label={strings.pagination.label}
                  className="mt-12 flex items-center justify-center gap-4"
                >
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                    className="min-h-11 rounded-full border border-border-light px-5 text-sm transition-colors hover:border-text-on-light hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {strings.pagination.previous}
                  </button>
                  <span className="text-sm text-text-on-light-muted">
                    {strings.pagination.pageLabel} {page} {strings.pagination.ofLabel}{" "}
                    {data.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= data.totalPages}
                    onClick={() => goToPage(page + 1)}
                    className="min-h-11 rounded-full border border-border-light px-5 text-sm transition-colors hover:border-text-on-light hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {strings.pagination.next}
                  </button>
                </nav>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
