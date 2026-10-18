import { Router } from "express";
import {
  csrfProtection,
  requireAdmin,
  requireAuth,
} from "../../shared/auth-middleware.js";
import {
  createPostSchema,
  listAdminPostsQuerySchema,
  updatePostSchema,
} from "./admin.schemas.js";
import {
  createPost,
  deletePost,
  getPostById,
  listPosts,
  publishPost,
  unpublishPost,
  updatePost,
} from "./admin.service.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin, csrfProtection);

adminRouter.get("/posts", async (req, res, next) => {
  try {
    const query = listAdminPostsQuerySchema.parse(req.query);
    const result = await listPosts(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/posts/:id", async (req, res, next) => {
  try {
    const post = await getPostById(String(req.params.id));
    res.json(post);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/posts", async (req, res, next) => {
  try {
    const body = createPostSchema.parse(req.body);
    const post = await createPost(body, req.user!.id);
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/posts/:id", async (req, res, next) => {
  try {
    const body = updatePostSchema.parse(req.body);
    const post = await updatePost(String(req.params.id), body);
    res.json(post);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/posts/:id", async (req, res, next) => {
  try {
    await deletePost(String(req.params.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/posts/:id/publish", async (req, res, next) => {
  try {
    const post = await publishPost(String(req.params.id));
    res.json(post);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/posts/:id/unpublish", async (req, res, next) => {
  try {
    const post = await unpublishPost(String(req.params.id));
    res.json(post);
  } catch (err) {
    next(err);
  }
});

/** Read-only queue visibility (Phase 4). */
adminRouter.get("/queues/email", async (_req, res, next) => {
  try {
    const { getQueueCounts, getRecentDlqEntries } = await import(
      "../../queues/index.js"
    );
    const [counts, recentDlq] = await Promise.all([
      getQueueCounts(),
      getRecentDlqEntries(20),
    ]);
    res.json({
      email: {
        counts: counts.email,
      },
      dlq: {
        counts: counts.dlq,
        recent: recentDlq,
      },
    });
  } catch (err) {
    next(err);
  }
});
