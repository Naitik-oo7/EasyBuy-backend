import { Router } from "express";
import {
  createPage,
  listPages,
  getPageById,
  updatePage,
  deletePage,
  getPageBySlug,
  listPublicPages,
} from "../controllers/page.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { sliderUploadMiddleware } from "../utils/awsS3";

const router = Router();

// Public routes
router.get("/public", listPublicPages);
router.get("/slug/:slug", getPageBySlug);

// Admin routes
router.get("/", authAndRoleCheck("view_pages"), listPages);
router.get("/:id", getPageById);

router.post(
  "/",
  authAndRoleCheck("create_page"),
  sliderUploadMiddleware,
  createPage
);
router.put(
  "/:id",
  authAndRoleCheck("edit_page"),
  sliderUploadMiddleware,
  updatePage
);
router.delete("/:id", authAndRoleCheck("delete_page"), deletePage);

export default router;
