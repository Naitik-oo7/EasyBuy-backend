import { Router } from "express";
import {
  getPublicWebSettings,
  getWebSettings,
  upsertWebSettings,
} from "../controllers/webSettings.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { webSettingsUploadMiddleware } from "../utils/awsS3";

const router = Router();

// 🔹 Public route → no auth required
router.get("/public", getPublicWebSettings);

// Public → get settings
router.get("/", authAndRoleCheck("view_web_settings"), getWebSettings);

// Admin → update settings (logo, favicon, etc.)
router.put(
  "/",
  authAndRoleCheck("edit_web_settings"),
  webSettingsUploadMiddleware,
  upsertWebSettings
);

export default router;
