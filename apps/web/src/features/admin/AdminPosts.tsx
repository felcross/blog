import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { isApiError } from "@/shared/api";
import { errorStateMessage } from "@/shared/error";
import { strings } from "@/shared/strings";
import { formatDate } from "@/shared/format";
import { useAuth, isAdmin } from "@/features/auth/useAuth";
import {
  deleteAdminPost,
  fetchAdminPosts,
  publishAdminPost,
  unpublishAdminPost,
  ADMIN_POSTS_PAGE_SIZE,
} from "./api";
import type { AdminPost, PostStatus } from "./types";

type StatusFilter = PostStatus | null;

function resolveStatusFilter(searchParams: URLSearchParams): StatusFilter {
  const raw = searchParams.get("status");
  return raw === "DRAFT" || raw === "PUBLISHED" ? raw : null;
}

function resolvePage(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("page") ?? "1");
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

interface ConfirmDeleteDialogProps {
  post: AdminPost;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDeleteDialog({ post, isDeleting, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = "confirm-delete-title";
  const messageId = "confirm-delete-message";

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-dark p-6"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-sm rounded-2xl border border-border-light bg-light-bg p-6 text-text-on-light"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="mb-2 font-[family-name:var(--font-inter)] text-xl font-bold">
          {strings.admin.confirmDeleteTitle}
        </h2>
        <p id={messageId} className="mb-2 text-sm text-text-on-light-muted">
          {strings.admin.confirmDeleteMessage}
        </p>
        <p className="mb-6 text-sm font-medium">{post.title}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent min-h-11"
          >
            {strings.admin.cancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-full bg-accent px-6 text-sm font-medium text-text-on-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 min-h-11"
          >
            {strings.admin.confirmDeleteConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function Unauthorized() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
      <div className="max-w-md px-6 text-center">
        <h1 className="mb-4 font-[family-name:var(--font-inter)] text-3xl font-black">
          {strings.admin.unauthorizedTitle}
        </h1>
        <p className="mb-8 text-text-on-light-muted">{strings.admin.unauthorizedMessage}</p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent"
        >
          {strings.admin.backToBlog}
        </Link>
      </div>
    </main>
  );
}

export default function AdminPosts() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = resolveStatusFilter(searchParams);
  const page = resolvePage(searchParams);
  const queryClient = useQueryClient();

  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const postsQuery = useQuery({
    queryKey: ["admin", "posts", { status: statusFilter, page, limit: ADMIN_POSTS_PAGE_SIZE }],
    queryFn: () => fetchAdminPosts({ status: statusFilter, page }),
    enabled: isAdmin(user),
  });

  function invalidatePosts(): void {
    void queryClient.invalidateQueries({ queryKey: ["admin", "posts"] });
  }

  const publishMutation = useMutation({
    mutationFn: publishAdminPost,
    onSuccess: () => {
      setActionMessage(null);
      invalidatePosts();
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        setActionMessage(strings.admin.alreadyPublished);
      } else {
        setActionMessage(errorStateMessage(error));
      }
      invalidatePosts();
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: unpublishAdminPost,
    onSuccess: () => {
      setActionMessage(null);
      invalidatePosts();
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        setActionMessage(strings.admin.alreadyDraft);
      } else {
        setActionMessage(errorStateMessage(error));
      }
      invalidatePosts();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminPost,
    onSuccess: () => {
      setPendingDelete(null);
      setActionMessage(null);
      invalidatePosts();
    },
    onError: (error) => {
      setActionMessage(errorStateMessage(error));
      invalidatePosts();
    },
  });

  if (isAuthLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
        <p role="status" className="text-text-on-light-muted">
          {strings.loading}
        </p>
      </main>
    );
  }

  if (!isAdmin(user)) {
    return <Unauthorized />;
  }

  function setFilter(next: StatusFilter): void {
    const params = new URLSearchParams(searchParams);
    if (next === null) {
      params.delete("status");
    } else {
      params.set("status", next);
    }
    params.delete("page");
    setSearchParams(params);
  }

  function goToPage(next: number): void {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(next));
    }
    setSearchParams(params);
  }

  const filters: Array<{ key: string; label: string; value: StatusFilter }> = [
    { key: "all", label: strings.admin.filterAll, value: null },
    { key: "draft", label: strings.admin.filterDraft, value: "DRAFT" },
    { key: "published", label: strings.admin.filterPublished, value: "PUBLISHED" },
  ];

  return (
    <main className="min-h-screen bg-light-bg text-text-on-light">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-12">
        <header className="mb-10 flex flex-wrap items-center gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.3em] text-accent">
              {strings.auth.adminLink}
            </p>
            <h1 className="font-[family-name:var(--font-inter)] text-3xl font-black tracking-tight lg:text-4xl">
              {strings.admin.title}
            </h1>
          </div>
          <Link
            to="/admin/posts/new"
            className="ml-auto inline-flex min-h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-text-on-dark transition-opacity hover:opacity-90"
          >
            {strings.admin.newPost}
          </Link>
        </header>

        <nav aria-label={strings.admin.title} className="mb-8 flex flex-wrap gap-3">
          {filters.map((filter) => {
            const isActive = statusFilter === filter.value;
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilter(filter.value)}
                className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-accent bg-accent text-text-on-dark"
                    : "border-border-light text-text-on-light hover:border-text-on-light hover:text-accent"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </nav>

        {actionMessage ? (
          <p role="alert" className="mb-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
            {actionMessage}
          </p>
        ) : null}

        {postsQuery.isPending ? (
          <p role="status" className="py-12 text-text-on-light-muted">
            {strings.loading}
          </p>
        ) : null}

        {postsQuery.isError ? (
          <div role="alert" className="py-12 text-center">
            <p className="mb-6 text-text-on-light-muted">{errorStateMessage(postsQuery.error)}</p>
            <button
              type="button"
              onClick={() => void postsQuery.refetch()}
              className="min-h-11 rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent"
            >
              {strings.errors.retry}
            </button>
          </div>
        ) : null}

        {postsQuery.data && postsQuery.data.items.length === 0 ? (
          <div className="py-12 text-center">
            <h2 className="mb-3 font-[family-name:var(--font-inter)] text-2xl font-bold">
              {strings.admin.emptyTitle}
            </h2>
            <p className="text-text-on-light-muted">{strings.admin.emptyMessage}</p>
          </div>
        ) : null}

        {postsQuery.data && postsQuery.data.items.length > 0 ? (
          <>
            <ul className="space-y-4">
              {postsQuery.data.items.map((post) => (
                <li
                  key={post.id}
                  className="rounded-2xl border border-border-light bg-light-bg p-5 lg:p-6"
                >
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-3">
                        <h2 className="font-[family-name:var(--font-inter)] text-lg font-bold leading-snug">
                          {post.title}
                        </h2>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                            post.status === "PUBLISHED"
                              ? "bg-accent/15 text-accent"
                              : "bg-surface-dark/10 text-text-on-light-muted"
                          }`}
                        >
                          {post.status === "PUBLISHED"
                            ? strings.admin.statusPublished
                            : strings.admin.statusDraft}
                        </span>
                      </div>
                      {post.excerpt ? (
                        <p className="mb-2 text-sm leading-relaxed text-text-on-light-muted">
                          {post.excerpt}
                        </p>
                      ) : null}
                      <p className="text-xs text-text-on-light-faint">
                        <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                      <Link
                        to={`/admin/posts/${post.id}/edit`}
                        className="inline-flex min-h-11 items-center rounded-full border border-border-light px-5 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent"
                      >
                        {strings.admin.edit}
                      </Link>
                      {post.status === "PUBLISHED" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActionMessage(null);
                            unpublishMutation.mutate(post.id);
                          }}
                          disabled={unpublishMutation.isPending}
                          className="inline-flex min-h-11 items-center rounded-full border border-border-light px-5 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {strings.admin.unpublish}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActionMessage(null);
                            publishMutation.mutate(post.id);
                          }}
                          disabled={publishMutation.isPending}
                          className="inline-flex min-h-11 items-center rounded-full border border-accent px-5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-text-on-dark disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {strings.admin.publish}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setActionMessage(null);
                          setPendingDelete(post);
                        }}
                        className="inline-flex min-h-11 items-center rounded-full border border-border-light px-5 text-sm font-medium text-accent transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {strings.admin.delete}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {postsQuery.data.totalPages > 1 ? (
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
                  {postsQuery.data.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= postsQuery.data.totalPages}
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

      {pendingDelete ? (
        <ConfirmDeleteDialog
          post={pendingDelete}
          isDeleting={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </main>
  );
}
