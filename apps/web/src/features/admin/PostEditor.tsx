import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isApiError } from "@/shared/api";
import { errorStateMessage } from "@/shared/error";
import { markdownComponents } from "@/shared/markdown";
import { strings } from "@/shared/strings";
import { useAuth, isAdmin } from "@/features/auth/useAuth";
import { createAdminPost, fetchAdminPost, updateAdminPost } from "./api";
import type { AdminPostInput } from "./types";

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

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
      <div className="max-w-md px-6 text-center">
        <h1 className="mb-4 font-[family-name:var(--font-inter)] text-3xl font-black">
          {strings.admin.notFoundTitle}
        </h1>
        <p className="mb-8 text-text-on-light-muted">{strings.admin.notFoundMessage}</p>
        <Link
          to="/admin"
          className="inline-flex min-h-11 items-center rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent"
        >
          {strings.admin.backToAdmin}
        </Link>
      </div>
    </main>
  );
}

export default function PostEditor() {
  const { id } = useParams<{ id: string }>();
  const isEdit = id !== undefined && id !== "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [hasLoadedPost, setHasLoadedPost] = useState(!isEdit);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const postQuery = useQuery({
    queryKey: ["admin", "posts", "detail", id],
    queryFn: () => fetchAdminPost(id as string),
    enabled: isAdmin(user) && isEdit,
    retry: (failureCount, error) => {
      if (isApiError(error) && error.code === "POST_NOT_FOUND") return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (isEdit && postQuery.data && !hasLoadedPost) {
      setTitle(postQuery.data.title);
      setSlug(postQuery.data.slug);
      setExcerpt(postQuery.data.excerpt ?? "");
      setContent(postQuery.data.content);
      setHasLoadedPost(true);
    }
  }, [isEdit, postQuery.data, hasLoadedPost]);

  const saveMutation = useMutation({
    mutationFn: (input: AdminPostInput) =>
      isEdit ? updateAdminPost(id as string, input) : createAdminPost(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate("/admin", { replace: true });
    },
    onError: (error) => {
      setErrorMessage(errorStateMessage(error));
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

  if (isEdit && postQuery.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
        <p role="status" className="text-text-on-light-muted">
          {strings.loading}
        </p>
      </main>
    );
  }

  if (isEdit && postQuery.isError) {
    const notFound = isApiError(postQuery.error) && postQuery.error.code === "POST_NOT_FOUND";
    if (notFound) {
      return <NotFound />;
    }
    return (
      <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
        <div className="max-w-md px-6 text-center" role="alert">
          <h1 className="mb-4 font-[family-name:var(--font-inter)] text-2xl font-bold">
            {strings.errors.genericTitle}
          </h1>
          <p className="mb-8 text-text-on-light-muted">{errorStateMessage(postQuery.error)}</p>
          <Link
            to="/admin"
            className="inline-flex min-h-11 items-center rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent"
          >
            {strings.admin.backToAdmin}
          </Link>
        </div>
      </main>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setErrorMessage(null);
    saveMutation.mutate({
      title: title.trim(),
      slug: slug.trim(),
      ...(excerpt.trim() ? { excerpt: excerpt.trim() } : {}),
      content,
    });
  }

  return (
    <main className="min-h-screen bg-light-bg text-text-on-light">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-12">
        <header className="mb-10">
          <Link
            to="/admin"
            className="mb-6 inline-flex min-h-11 items-center text-sm text-text-on-light-muted transition-colors hover:text-accent"
          >
            {strings.admin.backToAdmin}
          </Link>
          <h1 className="font-[family-name:var(--font-inter)] text-3xl font-black tracking-tight lg:text-4xl">
            {isEdit ? strings.admin.editPost : strings.admin.createTitle}
          </h1>
        </header>

        {errorMessage ? (
          <p role="alert" className="mb-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
            {errorMessage}
          </p>
        ) : null}

        <div className="grid gap-10 lg:grid-cols-2">
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div>
              <label htmlFor="post-title" className="mb-2 block text-sm font-medium">
                {strings.admin.fieldTitle}
              </label>
              <input
                id="post-title"
                name="title"
                type="text"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-xl border border-border-light bg-light-bg px-4 text-base outline-none transition-colors focus:border-accent min-h-11"
              />
            </div>
            <div>
              <label htmlFor="post-slug" className="mb-2 block text-sm font-medium">
                {strings.admin.fieldSlug}
              </label>
              <input
                id="post-slug"
                name="slug"
                type="text"
                required
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="w-full rounded-xl border border-border-light bg-light-bg px-4 text-base outline-none transition-colors focus:border-accent min-h-11"
              />
            </div>
            <div>
              <label htmlFor="post-excerpt" className="mb-2 block text-sm font-medium">
                {strings.admin.fieldExcerpt}
              </label>
              <textarea
                id="post-excerpt"
                name="excerpt"
                rows={3}
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                className="w-full rounded-xl border border-border-light bg-light-bg px-4 py-3 text-base outline-none transition-colors focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="post-content" className="mb-2 block text-sm font-medium">
                {strings.admin.fieldContent}
              </label>
              <textarea
                id="post-content"
                name="content"
                required
                rows={16}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="w-full rounded-xl border border-border-light bg-light-bg px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-8 font-medium text-text-on-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveMutation.isPending ? strings.admin.saving : strings.admin.save}
            </button>
          </form>

          <section aria-label={strings.admin.preview} className="min-w-0">
            <h2 className="mb-4 font-[family-name:var(--font-inter)] text-sm font-bold uppercase tracking-[0.2em] text-text-on-light-muted">
              {strings.admin.preview}
            </h2>
            <div className="rounded-2xl border border-border-light bg-light-bg p-6 lg:p-8">
              {content.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {content}
                </ReactMarkdown>
              ) : (
                <p className="text-text-on-light-muted">{strings.admin.previewEmpty}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
