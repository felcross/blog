import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";
import { BlogList } from "./BlogList";

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

describe("BlogList", () => {
  it("renders the blog heading", () => {
    renderWithProviders(<BlogList />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("lists posts from the API", async () => {
    renderWithProviders(<BlogList />);
    await waitFor(() => {
      expect(screen.getByText("Hello World")).toBeTruthy();
    });
    expect(screen.getByText("Second Post")).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<BlogList />);
    await waitFor(() => {
      expect(screen.getByText("Hello World")).toBeTruthy();
    });
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
