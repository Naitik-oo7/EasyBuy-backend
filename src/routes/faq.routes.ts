import { Router } from "express";
import {
  createFaq,
  listFaqs,
  getFaqById,
  updateFaq,
  deleteFaq,
  listPublicFaqs,
} from "../controllers/faq.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// Public route for frontend
router.get("/public", listPublicFaqs);

// Admin routes
router.post("/", authAndRoleCheck("create_faqs"), createFaq);
router.get("/", authAndRoleCheck("view_faqs"), listFaqs);
router.get("/:id", authAndRoleCheck("view_faqs"), getFaqById);
router.put("/:id", authAndRoleCheck("edit_faqs"), updateFaq);
router.delete("/:id", authAndRoleCheck("delete_faqs"), deleteFaq);

export default router;
