import { Router } from "express";
import {
  createAnnouncement,
  listAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  listActiveAnnouncements,
} from "../controllers/announcement.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// 🔹 Public route (frontend)
router.get("/public", listActiveAnnouncements);

// Only admin can create/update/delete
router.post("/", authAndRoleCheck("create_announcement"), createAnnouncement);
router.put("/:id", authAndRoleCheck("edit_announcement"), updateAnnouncement);
router.delete(
  "/:id",
  authAndRoleCheck("delete_announcement"),
  deleteAnnouncement
);

// Anyone can view
router.get("/", authAndRoleCheck("view_announcements"), listAnnouncements);
router.get("/:id", authAndRoleCheck("view_announcements"), getAnnouncementById);

export default router;
