import { Router } from "express";
import { AppError } from "../../shared/errors/index.js";
import { listPostsQuerySchema } from "./posts.schemas.js";
import { getPublishedPostBySlug, listPublishedPosts } from "./posts.service.js";

export const postsRouter = Router();

postsRouter.get("/", async (req, res, next) => {
  try {
    const query = listPostsQuerySchema.parse(req.query);
    const result = await listPublishedPosts(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

postsRouter.get("/:slug", async (req, res, next) => {
  try {
    const slug = String(req.params.slug);
    const post = await getPublishedPostBySlug(slug);
    if (!post) {
      throw new AppError("POST_NOT_FOUND");
    }
    res.json(post);
  } catch (err) {
    next(err);
  }
});
