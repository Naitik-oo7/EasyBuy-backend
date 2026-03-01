import { Router } from "express";
import {
  addToWishlist,
  removeFromWishlist,
  listWishlist,
} from "../controllers/wishlist.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

router.post("/", authAndRoleCheck(), addToWishlist);
router.delete("/:productId", authAndRoleCheck(), removeFromWishlist);
router.get("/", authAndRoleCheck(), listWishlist);

export default router;
