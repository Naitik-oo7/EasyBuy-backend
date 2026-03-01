import { Router } from "express";
import {
  createBlog,
  listBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  listActiveBlogs,
  getBlogBySlug,
} from "../controllers/blog.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { blogUploadMiddleware } from "../utils/awsS3";

const router = Router();

// Public routes
router.get("/public", listActiveBlogs);
router.get("/slug/:slug", getBlogBySlug);
router.get("/admin", authAndRoleCheck("view_all_blogs"), listBlogs);

router.get("/:id", getBlogById);

// Admin routes
router.post(
  "/",
  authAndRoleCheck("create_blog"),
  blogUploadMiddleware,
  createBlog
);
router.put(
  "/:id",
  authAndRoleCheck("edit_blog"),
  blogUploadMiddleware,
  updateBlog
);
router.delete("/:id", authAndRoleCheck("delete_blog"), deleteBlog);

export default router;
