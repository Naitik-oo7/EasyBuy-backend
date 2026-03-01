import { Router } from "express";

import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import {
  createRoleBasePermission,
  deleteRoleBasePermission,
  getRoleBasePermissionByRole,
  getRoleBasePermissionDrops,
  getRoleBasePermissions,
  updateRoleBasePermission,
} from "../controllers/roleBasePermission.controller";

const router = Router();

// Create RoleBasePermission
router.post(
  "/",
  authAndRoleCheck("create_role_permissions"),
  createRoleBasePermission
);

// Get all RoleBasePermissions
router.get(
  "/",
  authAndRoleCheck("view_all_role_permissions"),
  getRoleBasePermissions
);

// Get RoleBasePermission dropdowns
router.get("/Drops", authAndRoleCheck(), getRoleBasePermissionDrops);

// Get RoleBasePermission by role
router.get(
  "/:role",
  authAndRoleCheck("view_byrole_role_permissions"),
  getRoleBasePermissionByRole
);

// Update RoleBasePermission
router.put(
  "/",
  authAndRoleCheck("edit_role_permissions"),
  updateRoleBasePermission
);

// Delete RoleBasePermission
router.delete(
  "/:role",
  authAndRoleCheck("delete_role_permissions"),
  deleteRoleBasePermission
);

export default router;
