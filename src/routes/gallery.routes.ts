import { Router } from "express";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { upload } from "../utils/awsS3";

import {
  createGalleryItem,
  listGalleryAdmin,
  listGalleryPublic,
  updateGalleryItem,
  deleteGalleryItem,
} from "../controllers/gallery.controller";

const router = Router();

// Public – frontend
router.get("/public", listGalleryPublic);

// Admin routes
router.get("/", authAndRoleCheck("view_gallery"), listGalleryAdmin);

router.post(
  "/",
  authAndRoleCheck("edit_gallery"),
  upload.single("image"),
  createGalleryItem
);

router.put(
  "/:id",
  authAndRoleCheck("edit_gallery"),
  upload.single("image"),
  updateGalleryItem
);

router.delete("/:id", authAndRoleCheck("delete_gallery"), deleteGalleryItem);

export default router;
