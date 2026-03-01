import express from "express";
import {
  createCategoryFaq,
  getCategoryFaqs,
  updateCategoryFaq,
  deleteCategoryFaq,
} from "../controllers/categoryFaq.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = express.Router();

// Create a new FAQ for a category
router.post("/", authAndRoleCheck("edit_category"), createCategoryFaq);

// Get all FAQs for a specific category
router.get("/:categoryId", getCategoryFaqs);

// Update a specific FAQ
router.put("/:id", authAndRoleCheck("edit_category"), updateCategoryFaq);

// Delete a specific FAQ
router.delete("/:id", authAndRoleCheck("edit_category"), deleteCategoryFaq);

export default router;
