import { Router } from "express";
import {
  createSlider,
  listSliders,
  updateSlider,
  deleteSlider,
  listActiveSliders,
} from "../controllers/slider.controller";
import { sliderUploadMiddleware } from "../utils/awsS3"; // new combined middleware
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// 🔹 Public route (frontend)
router.get("/public", listActiveSliders);

// Create Slider (accepts both image or video)
router.post(
  "/",
  authAndRoleCheck("create_slider"),
  sliderUploadMiddleware,
  createSlider
);

// List all Sliders
router.get("/", authAndRoleCheck("view_sliders"), listSliders);

// Update Slider
router.put(
  "/:id",
  authAndRoleCheck("edit_slider"),
  sliderUploadMiddleware,
  updateSlider
);

// Delete Slider
router.delete("/:id", authAndRoleCheck("delete_slider"), deleteSlider);

export default router;
