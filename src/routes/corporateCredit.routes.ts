import { Router } from "express";
import {
  assignCredit,
  getCorporateUsersCredit,
  getCreditHistory,
  getMyCredit,
} from "../controllers/corporateCredit.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// Only corporate should assign credits
router.post("/assign", authAndRoleCheck("assign_credit"), assignCredit);

// Corporate can see credit history of their users
router.get(
  "/history/:userId",
  authAndRoleCheck("view_credit_history"),
  getCreditHistory
);

router.get("/me", authAndRoleCheck(), getMyCredit);

router.get("/users", authAndRoleCheck(), getCorporateUsersCredit);

export default router;
