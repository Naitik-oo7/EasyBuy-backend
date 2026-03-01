import express from "express";
import {
  createCategory,
  deleteCategory,
  getCategoriesForDropdown,
  getCategoryById,
  getCategoryBySlug,
  getCategoryDetailBySlug, // Added import
  getProductsByCategorySlug,
  getProfessionCategories,
  listCategories,
  listCategoryStats,
  updateCategory,
} from "../controllers/category.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { categoryUploadMiddleware } from "../utils/awsS3";
import optionalAuth from "../middlewares/optionalAuth";

const router = express.Router();

router.get("/public", optionalAuth, listCategories);
router.get("/profession/list", getProfessionCategories);

router.get("/dropdown/list", optionalAuth, getCategoriesForDropdown);
router.get("/slug/:slug/products", getProductsByCategorySlug);
router.get("/slug/:slug/detail", getCategoryDetailBySlug); // Added new route

router.get("/:id", getCategoryById);
router.get("/slug/:slug", getCategoryBySlug);
router.get(
  "/stats/list",
  authAndRoleCheck("view_category_stats"),
  listCategoryStats
);

router.post(
  "/",
  categoryUploadMiddleware,
  authAndRoleCheck("create_category"),
  createCategory
);
router.put(
  "/:id",
  categoryUploadMiddleware,
  authAndRoleCheck("edit_category"),
  updateCategory
);
router.delete("/:id", authAndRoleCheck("delete_category"), deleteCategory);

export default router;
