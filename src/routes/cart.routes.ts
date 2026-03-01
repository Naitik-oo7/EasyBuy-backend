// routes/cart.routes.ts
import { Router } from "express";
import {
  getOrCreateCart,
  addProductToCart,
  updateCartProduct,
  removeCartProduct,
  clearCart,
  applyCoupon,
  getOrCreateGuestCart,
  addProductToGuestCart,
  updateGuestCartProduct,
  removeGuestCartProduct,
  clearGuestCart,
  applyCouponToGuestCart,
  removeCoupon,
  removeCouponFromGuestCart,
} from "../controllers/cart.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { logoUploadMiddleware } from "../utils/awsS3";

const router = Router();

// Get the user's cart (or create one if not exists)
router.get("/", authAndRoleCheck(), logoUploadMiddleware, getOrCreateCart);

// Add a product to the cart
router.post("/", authAndRoleCheck(), logoUploadMiddleware, addProductToCart);

// Update a product in the cart
router.put(
  "/product/:cartProductId",
  authAndRoleCheck(),
  logoUploadMiddleware,
  updateCartProduct
);

// Remove a product from the cart
router.delete("/product/:cartProductId", authAndRoleCheck(), removeCartProduct);

// Clear the cart
router.delete("/clear", authAndRoleCheck(), clearCart);

router.post("/applyCoupon", authAndRoleCheck(), applyCoupon);
router.delete("/removeCoupon", authAndRoleCheck(), removeCoupon);

// Public guest cart routes (no auth)
router.get("/guest", getOrCreateGuestCart);
router.post("/guest", logoUploadMiddleware, addProductToGuestCart);
router.put(
  "/guest/product/:cartProductId",
  logoUploadMiddleware,
  updateGuestCartProduct
);
router.delete("/guest/product/:cartProductId", removeGuestCartProduct);
router.delete("/guest/clear", clearGuestCart);
router.post("/guest/applyCoupon", applyCouponToGuestCart);
router.delete("/guest/removeCoupon", removeCouponFromGuestCart);

export default router;
