import { Router } from "express";
import {
  createShippingRate,
  listShippingRates,
  getShippingRateById,
  updateShippingRate,
  deleteShippingRate,
  listShippingStates,
} from "../controllers/shippingRate.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// Admin routes
router.post("/", authAndRoleCheck("create_shipping_rate"), createShippingRate);
router.put("/:id", authAndRoleCheck("edit_shipping_rate"), updateShippingRate);
router.delete(
  "/:id",
  authAndRoleCheck("delete_shipping_rate"),
  deleteShippingRate
);

// Public/Admin route to view rates
router.get("/", listShippingRates);
router.get("/states", listShippingStates);
router.get("/:id", getShippingRateById);

export default router;
