import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiGet, isApiError } from "@/shared/api";
import { markdownComponents } from "@/shared/markdown";
import { strings } from "@/shared/strings";
import { formatDate } from "@/shared/format";
import type { PostDetail } from "./types";

export function BlogArticle() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [copied, setCopied] = useState(false);

  const { data: post, isPending, isError, error } = useQuery({
    queryKey: ["posts", slug],
    queryFn: () => apiGet<PostDetail>(`/posts/${encodeURIComponent(slug)}`),
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === "NOT_FOUND") return false;
      return failureCount < 2;
    },
    enabled: slug.length > 0,
  });

  async function handleShare(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
        <p role="status" className="text-text-on-light-muted">
          {strings.loading}
        </p>
      </main>
    );
  }

  const notFound = isError && isApiError(error) && error.code === "NOT_FOUND";

  if (isError && notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
        <div className="max-w-md px-6 text-center">
          <h1 className="mb-4 font-[family-name:var(--font-inter)] text-3xl font-black">
            {strings.articleNotFound.title}
          </h1>
          <p className="mb-8 text-text-on-light-muted">{strings.articleNotFound.message}</p>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent"
          >
            {strings.articleNotFound.action}
          </Link>
        </div>
      </main>
    );
  }

  if (isError || !post) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
        <div className="max-w-md px-6 text-center" role="alert">
          <h1 className="mb-4 font-[family-name:var(--font-inter)] text-2xl font-bold">
            {strings.errors.genericTitle}
          </h1>
          <p className="mb-8 text-text-on-light-muted">{strings.errors.genericMessage}</p>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 font-medium text-text-on-dark transition-opacity hover:opacity-90"
          >
            {strings.articleNotFound.action}
          </Link>
        </div>
      </main>
    );
  }

  const displayDate = formatDate(post.publishedAt ?? post.updatedAt);
  const authorName = post.author.name ?? post.author.email;

  return (
    <main className="min-h-screen bg-light-bg text-text-on-light">
      <article>
        <div className="mx-auto max-w-4xl px-6 pb-8 pt-24 lg:px-12">
          <Link
            to="/"
            className="mb-8 inline-flex min-h-11 items-center text-sm text-text-on-light-muted transition-colors hover:text-accent"
          >
            {strings.article.backToBlog}
          </Link>
          <h1 className="font-[family-name:var(--font-inter)] text-3xl font-black leading-tight tracking-tight md:text-4xl lg:text-5xl">
            {post.title}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-text-on-light-faint">
            <span>
              {strings.article.authorLabel} {authorName}
            </span>
            <span aria-hidden="true">{strings.article.separator}</span>
            <time dateTime={post.publishedAt ?? post.updatedAt}>
              {strings.article.dateLabel} {displayDate}
            </time>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="ml-auto inline-flex min-h-11 items-center rounded-full border border-border-light px-6 text-sm transition-colors hover:border-text-on-light hover:text-accent"
            >
              {copied ? strings.article.copied : strings.article.share}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[720px] px-6 py-12 lg:px-12 lg:py-16">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {post.content}
          </ReactMarkdown>
        </div>

        <div className="mx-auto max-w-[720px] px-6 pb-20 lg:px-12">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center text-sm text-text-on-light-muted transition-colors hover:text-accent"
          >
            {strings.article.backToBlog}
          </Link>
        </div>
      </article>
    </main>
  );
}
