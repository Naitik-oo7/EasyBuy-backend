import { Router } from "express";
import {
  createOrder,
  getOrders,
  getOrderDetails,
  updateOrderStatus,
  cancelOrder,
  listAllOrders,
  generateInvoice,
  generatePackingSlip,
  generateOrderForm,
  exportOrdersToExcel,
  getOrderSearchSuggestions,
  getUserOrderDetails,
  createGuestOrder,
  getGuestOrderById,
  listCorporateOrders,
} from "../controllers/order.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// Create new order
router.post("/", authAndRoleCheck(), createOrder);

// Public guest checkout
router.post("/guest", createGuestOrder);

// Get all orders for logged-in user
router.get("/", authAndRoleCheck(), getOrders);

router.get("/guest/:orderId", getGuestOrderById);

router.get(
  "/all",
  authAndRoleCheck(["view_all_orders", "view_corporate_orders"]),
  listAllOrders
);

router.get("/corporate", authAndRoleCheck(), listCorporateOrders);

// For logged-in users (no special permission)
router.get(
  "/user/:orderId",
  authAndRoleCheck(), // only needs to be authenticated
  getUserOrderDetails
);

router.get("/suggestions", authAndRoleCheck(), getOrderSearchSuggestions);
// Get single order details
router.get(
  "/:orderId",
  authAndRoleCheck("view_order_details"),
  getOrderDetails
);

// Generate documents
router.get("/:orderId/invoice", authAndRoleCheck(), generateInvoice);

router.get("/:orderId/packingSlip", authAndRoleCheck(), generatePackingSlip);
router.get("/:orderId/orderForm", authAndRoleCheck(), generateOrderForm);

router.get("/export/excel", authAndRoleCheck(), exportOrdersToExcel);

// Update order status (Admin only)
router.put(
  "/:orderId/status",
  authAndRoleCheck("update_order_status"),
  updateOrderStatus
);

//update_corporate_order_status

// Cancel order (User only)
router.post("/:orderId/cancel", authAndRoleCheck(), cancelOrder);

export default router;
