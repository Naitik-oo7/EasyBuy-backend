import { Router } from "express";
import {
  adminUpdateUser,
  changePassword,
  corporateUserSignup,
  createCorporate,
  createSubadmin,
  deleteUser,
  exportUsersToExcel,
  exportCorporateUsersToExcel,
  forgotPassword,
  getAdminUsers,
  getAllCorporates,
  getAllUsers,
  getCorporateDetails,
  getCorporateDropdown,
  getLoggedInUser,
  getMyCorporateDashboard,
  getMyCorporateUsers,
  getCorporateRevenueWithDateFilter,
  getPublicCorporateBySlug,
  getUserById,
  listCorporateCreditHistory,
  listCorporateOrders,
  listCorporateUsers,
  listPublicCorporates,
  logout,
  refresh,
  resetPassword,
  socialLogin,
  staffLogin,
  updateCorporateUserStatus,
  updateUser,
  userLogin,
  userSignup,
  verifyResetOtp,
} from "../controllers/user.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { singleFileMiddleware } from "../utils/awsS3";
import { sendOtp, verifyOtpController } from "../controllers/otp.controller";
import { listCorporateProducts } from "../controllers/product.controller";

const router = Router();

/* ------------------- AUTH (Public) ------------------- */
router.post("/auth/sendOtp", sendOtp);
router.post("/auth/verifyOtp", verifyOtpController);
router.post("/auth/signup", userSignup); // Normal user signup
router.post("/auth/login", userLogin); // Normal user login
router.post("/auth/staff/login", staffLogin); // Staff login (admin, subadmin, corporate, corporateUser)
router.post("/auth/corporateUser/signup", corporateUserSignup); // Corporate user signup
router.post("/auth/socialLogin", socialLogin);
router.post("/auth/refresh", refresh);
router.post("/auth/logout", logout);
router.post("/auth/changePassword", authAndRoleCheck(), changePassword);
router.post("/auth/forgotPassword", forgotPassword);
router.post("/auth/verifyResetOtp", verifyResetOtp);
router.post("/auth/resetPassword", resetPassword);

/* ------------------- USER ------------------- */
router.get("/users/me", authAndRoleCheck(), getLoggedInUser); // FE
router.get("/users", authAndRoleCheck("view_all_users"), getAllUsers); // Admin → all users, Corporate → own users
router.get(
  "/users/export/excel",
  authAndRoleCheck("view_all_users"),
  exportUsersToExcel
);

router.get(
  "/users/admins",
  authAndRoleCheck("view_admin_users"),
  getAdminUsers
);
router.get("/users/:id", authAndRoleCheck(), getUserById); // Admin only

router.put("/users/me", authAndRoleCheck(), singleFileMiddleware, updateUser); // FE Any user updates self only
router.put(
  "/users/:id",
  authAndRoleCheck(),
  singleFileMiddleware,
  adminUpdateUser
); // Admin only

/* ------------------- CORPORATES ------------------- */

// FRONTEND
router.get(
  "/corporates/me/dashboard",
  authAndRoleCheck(),
  getMyCorporateDashboard
);

router.get(
  "/corporates/me/revenue",
  authAndRoleCheck(),
  getCorporateRevenueWithDateFilter
);

router.get(
  "/corporates/me/products",
  authAndRoleCheck(),
  listCorporateProducts
);
router.get(
  "/corporates/all",
  authAndRoleCheck("view_all_corporates"),
  getAllCorporates
);
router.patch(
  "/corporates/:id/status",
  authAndRoleCheck(), // only requires authentication
  updateCorporateUserStatus
);

router.get("/corporates/me/users", authAndRoleCheck(), getMyCorporateUsers);

router.get("/corporates/public", listPublicCorporates);
router.get("/corporates/:slug", getPublicCorporateBySlug);

// ADMIN
router.get("/corporates", getCorporateDropdown);
router.get(
  "/corporates/:id/details",
  authAndRoleCheck("view_single_corporate"),
  getCorporateDetails
);

// Admin only
router.post(
  "/corporates",
  authAndRoleCheck("create_corporate"),
  singleFileMiddleware,
  createCorporate
);

router.get(
  "/corporates/:id/users",
  authAndRoleCheck("view_corporate_users"),
  listCorporateUsers
);

// Export corporate users to Excel
router.get(
  "/corporates/:id/users/export/excel",
  authAndRoleCheck(),
  exportCorporateUsersToExcel
);
router.get(
  "/corporates/:id/orders",
  authAndRoleCheck("view_corporate_orders"),
  listCorporateOrders
);
router.get(
  "/corporates/:id/credits/history",
  authAndRoleCheck("view_corporate_credits"),
  listCorporateCreditHistory
);
router.post(
  "/subadmins",
  authAndRoleCheck("create_subadmins"),
  singleFileMiddleware,
  createSubadmin
);

router.delete("/users/:id", authAndRoleCheck("delete_user"), deleteUser);

export default router;
