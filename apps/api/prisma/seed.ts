import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const posts = [
  {
    slug: "welcome-to-the-blog",
    title: "Welcome to the Blog",
    excerpt: "A short introduction to this portfolio blog — what to expect and how it is built.",
    content: `## Why this blog exists

This blog is part of my portfolio. It showcases a full-stack TypeScript application with a clean architecture, thoughtful UX, and production-ready patterns.

## What you will find

- Technical write-ups
- Project retrospectives
- Notes on software design

## How it is built

React + Vite on the frontend, Express + Prisma + PostgreSQL on the backend, magic-link authentication, and a small admin for publishing.

Stay tuned for more posts.
`,
    status: "PUBLISHED" as const,
  },
  {
    slug: "draft-thoughts-on-architecture",
    title: "Draft: Thoughts on Architecture",
    excerpt: "Unpublished draft — should never appear in public listings.",
    content: `## Work in progress

This draft is intentionally unpublished. Public endpoints must never return it.
`,
    status: "DRAFT" as const,
  },
  {
    slug: "typescript-strict-in-practice",
    title: "TypeScript Strict in Practice",
    excerpt: "What changes when you turn on every strict flag and keep it that way.",
    content: `## The cost of looseness

Most codebases start with good intentions and slowly accumulate \`any\`. Strict mode is the cheapest way to stop that slide.

## What we enabled

- \`strict: true\`
- \`noUnusedLocals\` / \`noUnusedParameters\`
- \`noFallthroughCasesInSwitch\`

## The payoff

Refactoring becomes safe. The compiler becomes a second pair of eyes. And API boundaries stay honest.
`,
    status: "PUBLISHED" as const,
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: { email: adminEmail, name: "Admin", role: "ADMIN" },
  });

  console.log(`Seeded admin user: ${admin.email}`);

  for (const post of posts) {
    const existing = await prisma.post.findUnique({ where: { slug: post.slug } });
    if (existing) {
      await prisma.post.update({
        where: { slug: post.slug },
        data: {
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
          status: post.status,
          publishedAt: post.status === "PUBLISHED" ? existing.publishedAt ?? new Date() : null,
        },
      });
    } else {
      await prisma.post.create({
        data: {
          ...post,
          authorId: admin.id,
          publishedAt: post.status === "PUBLISHED" ? new Date() : null,
        },
      });
    }
    console.log(`Seeded post: ${post.slug} (${post.status})`);
  }

  // Smoke-check that hashing helpers work (used by auth in Phase 2)
  const demoToken = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(demoToken).digest("hex");
  if (hash.length !== 64) {
    throw new Error("token hash helper broken");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
