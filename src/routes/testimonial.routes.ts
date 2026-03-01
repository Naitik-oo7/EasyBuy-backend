import { Router } from "express";
import {
  createTestimonial,
  listTestimonials,
  updateTestimonial,
  deleteTestimonial,
  listActiveTestimonials,
} from "../controllers/testimonial.controller";
import { sliderUploadMiddleware } from "../utils/awsS3"; // handles both image + video
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// 🔹 Public route for frontend (no auth)
router.get("/public", listActiveTestimonials);

// Public routes
router.get("/", authAndRoleCheck("view_testimonials"), listTestimonials);

// Admin routes
router.post(
  "/",
  authAndRoleCheck("create_testimonial"),
  sliderUploadMiddleware,
  createTestimonial
);
router.put(
  "/:id",
  authAndRoleCheck("edit_testimonial"),
  sliderUploadMiddleware,
  updateTestimonial
);
router.delete(
  "/:id",
  authAndRoleCheck("delete_testimonial"),
  deleteTestimonial
);

export default router;
