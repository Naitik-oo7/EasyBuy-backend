import { Router } from "express";
import {
  createAddress,
  listAddresses,
  updateAddress,
  deleteAddress,
  getAddressById,
} from "../controllers/address.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

/**
 * NOTE:
 * - Normal users → act on their own addresses
 * - Corporate → act on their own + their corporate users (by passing userId)
 * - Admin → can act on any user (must pass userId when acting for others)
 */

// Create address (shipping or business)
router.post("/", authAndRoleCheck(), createAddress);

// List addresses
// - Normal user → /addresses
// - Admin → /addresses?userId=123 (to see a specific user's addresses)
router.get("/", authAndRoleCheck(), listAddresses);

// Get a single address by id
router.get("/:id", authAndRoleCheck(), getAddressById);

// Update an address
router.put("/:id", authAndRoleCheck(), updateAddress);

// Delete an address
router.delete("/:id", authAndRoleCheck(), deleteAddress);

export default router;
