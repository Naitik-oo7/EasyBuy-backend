import { Router } from "express";
import {
  listAllPaymentLogs,
  logFrontendReturn,
} from "../controllers/paymentLog.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// 🔹 Frontend (NO AUTH – safe logging)
router.post("/frontend-return", logFrontendReturn);

router.get("/", authAndRoleCheck("view_payments"), listAllPaymentLogs);

export default router;
