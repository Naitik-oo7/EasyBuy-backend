import express from "express";
import {
  createFestival,
  getAllFestivals,
  getFestivalById,
  updateFestival,
  deleteFestival,
  getActiveFestival,
} from "../controllers/festival.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = express.Router();

// Public endpoint to get active festival
router.get("/public", getActiveFestival);

// Admin endpoints
router.get("/", authAndRoleCheck("view_festivals"), getAllFestivals);
router.get("/:id", authAndRoleCheck("view_festivals"), getFestivalById);
router.post("/", authAndRoleCheck("create_festival"), createFestival);
router.put("/:id", authAndRoleCheck("edit_festival"), updateFestival);
router.delete("/:id", authAndRoleCheck("delete_festival"), deleteFestival);

export default router;
