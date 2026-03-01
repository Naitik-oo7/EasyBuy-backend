// routes/coupon.routes.ts
import { Router } from "express";
import {
  createCoupon,
  listCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  applyCoupon,
} from "../controllers/coupon.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// Admin routes
router.post("/", authAndRoleCheck("create_coupon"), createCoupon);
router.get("/", authAndRoleCheck("view_coupons"), listCoupons);
router.get("/:id", authAndRoleCheck("view_coupons"), getCouponById);
router.put("/:id", authAndRoleCheck("edit_coupon"), updateCoupon);
router.delete("/:id", authAndRoleCheck("delete_coupon"), deleteCoupon);

// User route: apply coupon to their cart
router.post("/apply", authAndRoleCheck(), applyCoupon);

export default router;
