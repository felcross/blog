import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { BlogCard } from "./BlogCard";
import type { PostSummary } from "./types";

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const samplePost: PostSummary = {
  id: "1",
  slug: "hello-world",
  title: "Hello World",
  excerpt: "A short excerpt for testing.",
  publishedAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

describe("BlogCard accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<BlogCard post={samplePost} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
