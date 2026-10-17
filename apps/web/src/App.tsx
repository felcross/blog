import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { BlogArticle } from "@/features/blog/BlogArticle";
import { BlogList } from "@/features/blog/BlogList";
import { AuthHeader } from "@/features/auth/AuthHeader";
import { AuthProvider } from "@/features/auth/useAuth";
import { Login } from "@/features/auth/Login";
import { Verify } from "@/features/auth/Verify";
import { ChunkErrorBoundary } from "@/shared/ChunkErrorBoundary";
import { ErrorBoundary } from "@/shared/ErrorBoundary";
import { strings } from "@/shared/strings";

const AdminPosts = lazy(() => import("@/features/admin/AdminPosts"));
const PostEditor = lazy(() => import("@/features/admin/PostEditor"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error) => {
        if (error instanceof Error && error.name === "ApiError") {
          const status = (error as { status?: number }).status;
          if (status === 404 || status === 400 || status === 401 || status === 403) return false;
        }
        return failureCount < 2;
      },
    },
  },
});

function RouteFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
      <p role="status" className="text-text-on-light-muted">
        {strings.loading}
      </p>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
      <div className="max-w-md px-6 text-center">
        <h1 className="mb-4 font-[family-name:var(--font-inter)] text-3xl font-black">
          {strings.pageNotFound.title}
        </h1>
        <p className="mb-8 text-text-on-light-muted">{strings.pageNotFound.message}</p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 font-medium text-text-on-dark transition-opacity hover:opacity-90"
        >
          {strings.pageNotFound.action}
        </Link>
      </div>
    </main>
  );
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-light-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-5 focus:text-sm focus:font-medium focus:text-text-on-dark min-h-11 focus:inline-flex focus:items-center"
      >
        {strings.auth.skipToContent}
      </a>
      <AuthHeader />
      <div id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </div>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ChunkErrorBoundary>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<BlogList />} />
                  <Route path="/blog/:slug" element={<BlogArticle />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/verify" element={<Verify />} />
                  <Route
                    path="/admin"
                    element={
                      <Suspense fallback={<RouteFallback />}>
                        <AdminPosts />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/admin/posts/new"
                    element={
                      <Suspense fallback={<RouteFallback />}>
                        <PostEditor />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/admin/posts/:id/edit"
                    element={
                      <Suspense fallback={<RouteFallback />}>
                        <PostEditor />
                      </Suspense>
                    }
                  />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </AppLayout>
            </ChunkErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
