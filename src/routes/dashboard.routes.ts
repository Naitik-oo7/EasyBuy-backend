import { Router } from "express";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import {
  getDashboardSummary,
  getRecentTransactions,
  getRevenueChart,
} from "../controllers/dashboard.controller";

const router = Router();

// Admin-only access for now
router.get("/summary", authAndRoleCheck(), getDashboardSummary);

router.get("/recentTransactions", authAndRoleCheck(), getRecentTransactions);

router.get("/revenueChart", authAndRoleCheck(), getRevenueChart);

export default router;
