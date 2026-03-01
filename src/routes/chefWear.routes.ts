// src/routes/chefWear.routes.ts
import express from "express";
import { getChefWear, updateChefWear, publicChefWear } from "../controllers/chefWear.controller";
import { chefWearUpload, upload } from "../utils/awsS3";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = express.Router();



// Admin
router.get("/", authAndRoleCheck("view_chefWear"), getChefWear);
router.put("/", authAndRoleCheck("edit_chefWear"), chefWearUpload, updateChefWear);

// Public
router.get("/public", publicChefWear);

export default router;
