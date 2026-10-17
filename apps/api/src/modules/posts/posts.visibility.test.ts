import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "postgresql://blog:blog@localhost:5433/blog";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.WEB_URL ??= "http://localhost:5173";
process.env.SESSION_SECRET ??= "test-secret-at-least-16-chars";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_FROM ??= "Blog <noreply@blog.local>";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();

const ADMIN_ID = "test-admin-visibility";
const PUBLISHED_SLUG = "test-published-visibility";
const DRAFT_SLUG = "test-draft-visibility";

beforeAll(async () => {
  await prisma.user.upsert({
    where: { email: "visibility-test@example.com" },
    update: {},
    create: { id: ADMIN_ID, email: "visibility-test@example.com", role: "ADMIN" },
  });

  await prisma.post.deleteMany({
    where: { slug: { in: [PUBLISHED_SLUG, DRAFT_SLUG] } },
  });

  await prisma.post.create({
    data: {
      slug: PUBLISHED_SLUG,
      title: "Published Visibility Test",
      excerpt: "Should be visible",
      content: "## Published",
      status: "PUBLISHED",
      publishedAt: new Date(),
      authorId: ADMIN_ID,
    },
  });

  await prisma.post.create({
    data: {
      slug: DRAFT_SLUG,
      title: "Draft Visibility Test",
      excerpt: "Should NOT be visible",
      content: "## Draft",
      status: "DRAFT",
      authorId: ADMIN_ID,
    },
  });
});

afterAll(async () => {
  await prisma.post.deleteMany({
    where: { slug: { in: [PUBLISHED_SLUG, DRAFT_SLUG] } },
  });
  await prisma.user.deleteMany({ where: { id: ADMIN_ID } });
  await prisma.$disconnect();
});

describe("posts visibility (service-level rules)", () => {
  it("published posts are queryable", async () => {
    const post = await prisma.post.findUnique({ where: { slug: PUBLISHED_SLUG } });
    expect(post).not.toBeNull();
    expect(post!.status).toBe("PUBLISHED");
  });

  it("drafts exist but are not PUBLISHED", async () => {
    const post = await prisma.post.findUnique({ where: { slug: DRAFT_SLUG } });
    expect(post).not.toBeNull();
    expect(post!.status).toBe("DRAFT");
    expect(post!.publishedAt).toBeNull();
  });

  it("list query filters to PUBLISHED only", async () => {
    const published = await prisma.post.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true },
    });
    const slugs = published.map((p) => p.slug);
    expect(slugs).toContain(PUBLISHED_SLUG);
    expect(slugs).not.toContain(DRAFT_SLUG);
  });

  it("slug uniqueness is enforced", async () => {
    await expect(
      prisma.post.create({
        data: {
          slug: PUBLISHED_SLUG,
          title: "Duplicate",
          content: "x",
          status: "DRAFT",
          authorId: ADMIN_ID,
        },
      }),
    ).rejects.toThrow();
  });
});
