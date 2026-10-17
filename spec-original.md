# Portfolio Blog: Technical Spec (original — preservada sem alterações)

> Este arquivo é a spec externa recebida, preservada literalmente conforme o Passo 5 do workflow SDD. A versão estruturada no padrão SDD está em `spec-sdd.md`.

Spec for the implementing agent. Phases 1 and 2 are fully specified. Phases 3 to 6 are roadmap only and must not be implemented until they are detailed in a later revision.

## 1. Overview

A public blog used as a portfolio piece. Anyone can read posts without logging in. Visitors can sign up (passwordless, via magic link) in order to comment. Only the owner (role `ADMIN`) writes posts. Comments are moderated by the owner before they become public.

The goal of the project is to demonstrate backend architecture patterns: layered architecture by feature, state machines, passwordless auth, background queues with retry, structured logging, and moderation workflows.

## 2. Locked decisions

- **Permissions:** reading is public. Signing up lets a user comment (Phase 5). Only `ADMIN` creates and edits posts. Multi-author posting is out of scope.
- **Identity:** email is the only required field. No passwords, ever. Login and signup are the same flow (magic link).
- **Roles:** `ADMIN` and `USER`. The admin is bootstrapped from the `ADMIN_EMAIL` environment variable.
- **Post status:** state machine `DRAFT -> PUBLISHED`.
- **Comment status (Phase 5):** state machine `PENDING -> APPROVED | REJECTED`. Every comment is created as `PENDING` and is invisible publicly until approved.
- **Realtime:** polling only. **SSE and WebSocket are out of scope** for this project version. They may be revisited as a future improvement after everything else ships.
- **Architecture:** layered architecture organized by feature module: `route -> controller -> service -> Prisma`.

## 3. Stack

- **Language:** TypeScript everywhere (strict mode).
- **API:** Node.js, Express 5.
- **ORM / DB:** Prisma with PostgreSQL. Prisma is the data access layer; do not add a separate repository layer on top.
- **Validation:** Zod (request bodies, query params, and environment variables).
- **Logging:** Pino.
- **Queue (Phase 4):** BullMQ with Redis.
- **Frontend:** React + Vite, React Router, TanStack Query.
- **Tests:** Vitest + Supertest.
- **Local environment:** `docker-compose` with Postgres, Redis, and Mailpit (local SMTP inbox, web UI on port 8025).

## 4. Repository structure

Simple monorepo with two apps. Use npm or pnpm workspaces (agent's choice, but pick one and document it).

```
blog/
├── docker-compose.yml          # postgres, redis, mailpit
├── .env.example
├── README.md
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── server.ts       # starts Express
│   │       ├── worker.ts       # starts BullMQ workers (Phase 4, separate process)
│   │       ├── app.ts          # builds the Express app: middlewares + routes
│   │       ├── config/         # env parsed and validated with Zod
│   │       ├── modules/
│   │       │   ├── auth/       # magic link, sessions
│   │       │   ├── posts/
│   │       │   └── comments/   # Phase 5
│   │       ├── queues/         # queue and job definitions (Phase 4)
│   │       └── shared/         # logger, errors, middlewares, prisma client, email service
│   └── web/                    # React + Vite
```

Each module under `modules/` follows the same shape:

```
modules/posts/
├── posts.routes.ts       # URL -> controller, applies middlewares (auth, validation)
├── posts.controller.ts   # HTTP only: parse request, call service, send response
├── posts.service.ts      # business rules and state machines. No Express types allowed here.
└── posts.schemas.ts      # Zod schemas and inferred types
```

## 5. Architecture conventions

- **Controllers** contain no business logic. They read validated input, call one service function, and return the response with the correct status code.
- **Services** contain all business rules and know nothing about HTTP (no `req`, `res`). They must be callable from a controller, a queue worker, or a test unchanged.
- **Validation** happens in route middleware using Zod. Controllers receive already-validated data.
- **Error handling:** services throw typed errors (`AppError` with `code`, `status`, `message`). A single error middleware converts them to the standard response below. Express 5 forwards rejected promises from async handlers automatically, so no `try/catch` boilerplate in controllers.
- **Standard error response:**

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Human readable message", "details": [] } }
  ```

- **Env:** all configuration is read once in `config/`, validated with Zod at startup, and the process fails fast if invalid. No direct `process.env` access elsewhere.
- **Conventions:** API routes are mounted under `/api`. IDs are `cuid` strings. Timestamps are ISO 8601 UTC.

## 6. Phase 1: API foundation and public posts

### 6.1 Goal

A running API on Postgres that serves public posts, plus a React app that lists and displays them. No authentication yet.

### 6.2 Requirements

1. `docker-compose.yml` starts Postgres, Redis, and Mailpit with one command. Redis and Mailpit are not used in this phase but must be available.
2. Prisma schema and initial migration for `User` and `Post`.
3. Seed script that creates the admin user (email from `ADMIN_EMAIL`) and a few sample posts (both `DRAFT` and `PUBLISHED`).
4. Express app with the layered, per-module structure from section 4, with `posts` as the first module.
5. Pino logger with request logging. Every request gets a correlation id (read `x-request-id` if present, otherwise generate one), attached to all log lines for that request and returned in the `x-request-id` response header.
6. Zod-validated environment config and the standard error handling from section 5.
7. `GET /api/health` returns `{ "status": "ok" }` and checks the database connection.
8. React app with a post list page and a post detail page. Post content is Markdown, rendered safely (no raw HTML execution; use `react-markdown` without enabling raw HTML).
9. In development, Vite proxies `/api` to the API so the browser sees a single origin.

### 6.3 Data model (Phase 1)

```prisma
enum Role {
  ADMIN
  USER
}

enum PostStatus {
  DRAFT
  PUBLISHED
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  posts     Post[]
}

model Post {
  id          String     @id @default(cuid())
  slug        String     @unique
  title       String
  excerpt     String?
  content     String     // Markdown
  status      PostStatus @default(DRAFT)
  publishedAt DateTime?
  authorId    String
  author      User       @relation(fields: [authorId], references: [id])
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([status, publishedAt])
}
```

Emails are stored lowercased and trimmed.

### 6.4 Endpoints (Phase 1)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness and DB check |
| GET | `/api/posts` | List `PUBLISHED` posts, newest first. Query: `page` (default 1), `limit` (default 10, max 50). Returns `{ data: [...], page, limit, total }`. Items include `id, slug, title, excerpt, publishedAt, author { name }` (no `content`). |
| GET | `/api/posts/:slug` | Full post (including `content`). Returns 404 if the post does not exist **or is not `PUBLISHED`** (drafts must never leak). |

Write endpoints for posts are added in Phase 2, behind admin auth. In Phase 1, content comes from the seed script.

### 6.5 Acceptance criteria

- [ ] `docker compose up` starts Postgres, Redis, and Mailpit; Mailpit UI is reachable at `localhost:8025`.
- [ ] Migration and seed run from a clean database with documented commands.
- [ ] `GET /api/posts` returns only `PUBLISHED` posts, ordered by `publishedAt` descending, with working pagination.
- [ ] `GET /api/posts/:slug` returns 404 for drafts and unknown slugs, with the standard error body.
- [ ] Invalid query params (for example `limit=abc`) return 400 with `VALIDATION_ERROR`.
- [ ] Every response includes `x-request-id`, and the same id appears in the log lines of that request.
- [ ] The API refuses to start with a clear message when a required env var is missing or invalid.
- [ ] The React app lists posts, opens a post by slug, and shows a not-found state for unknown slugs.
- [ ] Service-level tests cover the draft/published visibility rule; at least one Supertest test covers each endpoint.
- [ ] `.env.example` and a README with setup steps exist.

### 6.6 Out of scope for Phase 1

Authentication, post writing endpoints, comments, queues, caching, rate limiting.

## 7. Phase 2: Magic link auth, sessions, admin post management

### 7.1 Goal

Passwordless authentication. A visitor types their email, receives a link, clicks it, and is logged in. If the email did not exist, the account is created in the same step (signup and login are one flow). The admin can then manage posts.

### 7.2 Requirements

**Magic link request**

1. The user submits an email. The server generates a token with `crypto.randomBytes(32)` (url-safe encoding), stores **only its SHA-256 hash**, an `expiresAt` of now + 15 minutes, and `usedAt = null`.
2. The server sends an email containing the link `${WEB_URL}/auth/verify?token=<token>`. The link points to the **web app**, not the API.
3. The response is always the same `202` with a generic message, whether or not the email already has an account. Do not reveal account existence.
4. Requesting a new link does not need to invalidate older ones, but all links expire in 15 minutes and are single-use.

**Email sending in this phase**

5. Define an `EmailService` interface in `shared/` with a `sendMagicLink(email, url)` method. Phase 2 implements it synchronously with Nodemailer against Mailpit (SMTP on `localhost:1025`). In Phase 4 the implementation is replaced by enqueueing a BullMQ job, with **no change to the auth service**.

**Verification and session**

6. The web app route `/auth/verify` shows an intermediate screen with a **Confirm login** button. Only when the user clicks it does the app call `POST /api/auth/verify`. This prevents email scanners and antivirus link-prefetching from consuming the token.
7. `POST /api/auth/verify` hashes the received token and checks that it exists, is not expired, and is not used. On success, in a single transaction: mark the token as used, find or create the user by email (role `ADMIN` if the email equals `ADMIN_EMAIL`, otherwise `USER`), and create a session.
8. The session is an opaque random token stored in an **httpOnly cookie** (`SameSite=Lax`, `Secure` in production, 30-day expiry). The database stores only the **hash** of the session token. Sessions are looked up per request by hashing the cookie value.
9. `POST /api/auth/logout` deletes the session and clears the cookie.

**Authorization**

10. Middlewares: `requireAuth` (valid session, attaches `req.user`) and `requireAdmin` (role `ADMIN`, otherwise 403).

**Rate limiting (minimum viable)**

11. `POST /api/auth/magic-link` is limited to 5 requests per 15 minutes per IP and per email (`express-rate-limit`, in-memory store for now). Exceeding returns 429 with the standard error body. Phase 6 revisits this with a Redis-backed store.

**Admin post management**

12. The admin can create, edit, publish, unpublish (back to `DRAFT`), and delete posts, and list all posts including drafts. Slugs are generated from the title and made unique; once a post is published, its slug does not change.
13. Publishing is a state transition owned by the service: `DRAFT -> PUBLISHED` sets `publishedAt` (only on first publish); `PUBLISHED -> DRAFT` is allowed. Invalid transitions return 409.

**Frontend**

14. Login page (email input), a check-your-inbox confirmation, the verify screen, a header showing logged-in state with a logout action, and a sign-up call to action (text like **Sign in to comment**). Admin-only pages for listing, creating, and editing posts, hidden from non-admins and also protected by the API.

### 7.3 Data model additions

```prisma
model LoginToken {
  id        String    @id @default(cuid())
  email     String    // not a relation: the user may not exist yet
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([email])
}

model Session {
  id         String   @id @default(cuid())
  tokenHash  String   @unique
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  @@index([userId])
}
```

Add `sessions Session[]` to `User`.

### 7.4 Endpoints (Phase 2)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/magic-link` | none | Body `{ email }`. Always `202`. Rate limited. |
| POST | `/api/auth/verify` | none | Body `{ token }`. Sets session cookie, returns the user. `400`/`401` for invalid, expired, or used token (same generic error for all three). |
| POST | `/api/auth/logout` | session | Destroys the session. `204`. |
| GET | `/api/auth/me` | session | Returns the current user, or `401`. |
| GET | `/api/admin/posts` | admin | All posts including drafts, with pagination and optional `status` filter. |
| POST | `/api/admin/posts` | admin | Create a post (as `DRAFT`). Body: `title`, `content`, optional `excerpt`. |
| PATCH | `/api/admin/posts/:id` | admin | Edit `title`, `content`, `excerpt`. |
| POST | `/api/admin/posts/:id/publish` | admin | `DRAFT -> PUBLISHED`. `409` if already published. |
| POST | `/api/admin/posts/:id/unpublish` | admin | `PUBLISHED -> DRAFT`. `409` if already a draft. |
| DELETE | `/api/admin/posts/:id` | admin | Delete a post. `204`. |

The public endpoints from Phase 1 are unchanged.

### 7.5 Acceptance criteria

- [ ] Requesting a link for any email returns the same `202` response, and the email arrives in Mailpit.
- [ ] The database never contains a raw login token or raw session token, only hashes.
- [ ] A valid token logs the user in, sets an httpOnly cookie, and marks the token as used. Reusing the same token fails.
- [ ] An expired token fails (test by manipulating `expiresAt` or the clock).
- [ ] An unknown email is created as a `USER` on first verify; the email equal to `ADMIN_EMAIL` becomes `ADMIN`.
- [ ] The email link opens the web app's confirmation screen, and **no API call consumes the token until the button is clicked**.
- [ ] `GET /api/auth/me` returns the user with a valid session and `401` without one; after logout the old cookie no longer works.
- [ ] Admin endpoints return `401` without a session, `403` for a `USER`, and work for `ADMIN`.
- [ ] Publishing sets `publishedAt` once; invalid state transitions return `409`; drafts never appear in public endpoints.
- [ ] More than 5 magic-link requests in 15 minutes from one IP or for one email returns `429`.
- [ ] Swapping `EmailService` for a fake implementation in tests requires no change to `auth.service.ts`.
- [ ] Tests: token lifecycle (valid, expired, reused), role assignment, authorization matrix, post state transitions.
- [ ] The log lines of an auth flow share a correlation id, and **tokens and cookies are never logged**.

### 7.6 Out of scope for Phase 2

Queue-based email sending, comments, notifications, Redis-backed rate limiting, profile editing, account deletion.

## 8. Roadmap (not to be implemented yet)

These phases are listed for context only, so earlier phases do not paint the project into a corner. Each will be specified in detail before implementation.

**Phase 3: Observability and error hardening.** Consolidate Pino logging with correlation id propagation (including into jobs later), standardize error codes across all modules, add request duration logging and a basic error taxonomy.

**Phase 4: Email queue (BullMQ).** Move email sending to a BullMQ queue with Redis. Jobs for magic link and welcome email, with retry and exponential backoff (for example 3 attempts). The worker runs as a separate process (`worker.ts`). Failed jobs are visible, and exhausted jobs are moved to a dead-letter queue built on top of BullMQ. The `EmailService` implementation changes from sending to enqueueing.

**Phase 5: Comments with moderation.** `Comment` model with status state machine `PENDING -> APPROVED | REJECTED`. Only authenticated users can comment. Comments are invisible publicly until approved. The admin has a moderation queue to approve or reject. Creating a comment emits a `comment.created` event, which triggers an email job notifying the post author.

**Phase 6: Notifications via polling, rate limiting, and cache.** An in-app notification card for the author when a new comment arrives, implemented with **polling** (TanStack Query `refetchInterval` against a notifications endpoint). Redis-backed rate limiting for comments and auth. Caching of public post reads.

**Future improvement (explicitly out of scope):** replacing polling with Server-Sent Events, after all phases above are complete.
