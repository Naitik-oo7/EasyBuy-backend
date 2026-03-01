import { Router } from "express";
import {
  createPayment,
  listPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  getPaymentByCode,
} from "../controllers/payment.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// Admin routes
router.get("/", authAndRoleCheck("view_payments"), listPayments);
router.get("/:id", authAndRoleCheck("view_payment_by_id"), getPaymentById);
router.post("/", authAndRoleCheck("create_payment"), createPayment);
router.put("/:id", authAndRoleCheck("edit_payment"), updatePayment);
router.delete("/:id", authAndRoleCheck("delete_payment"), deletePayment);
router.get("/code/:code", getPaymentByCode);

export default router;
