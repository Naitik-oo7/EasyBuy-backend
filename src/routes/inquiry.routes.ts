import { Router } from "express";
import {
  createInquiry,
  listInquiries,
  updateInquiryStatus,
  deleteInquiry,
  exportInquiriesToExcel,
} from "../controllers/inquiry.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { singleFileMiddleware } from "../utils/awsS3";

const router = Router();

// Public — frontend form
router.post("/", singleFileMiddleware, createInquiry);

// Admin APIs
router.get("/admin", authAndRoleCheck("view_inquiry"), listInquiries);
router.get(
  "/admin/export/excel",
  authAndRoleCheck("view_inquiry"),
  exportInquiriesToExcel
);
router.put(
  "/:id/status",
  authAndRoleCheck("edit_inquiry"),
  updateInquiryStatus
);

router.delete("/:id", authAndRoleCheck("delete_inquiry"), deleteInquiry);

export default router;
