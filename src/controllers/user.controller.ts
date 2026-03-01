import { NextFunction, Request, Response } from "express";
import User from "../models/user.model";
import { col, fn, Op } from "sequelize";
import axios from "axios";
import jwt from "jsonwebtoken";
import { issueTokens, signAccess } from "../utils/tokenHelper";
import bcrypt from "bcrypt";
import { deleteImage, getFileUrl, singleUpload } from "../utils/awsS3";
import Address from "../models/address.model";
import Order from "../models/order.model";
import OrderProduct from "../models/orderProduct.model";
import CorporateCredit from "../models/corporateCredit.model";
import CorporateCreditHistory from "../models/corporateCreditHistory.model";
import Product from "../models/product.model";
import RoleBasePermission from "../models/roleBasePermission.model";
import OrderShippingAddress from "../models/orderShippingAddress.model";
import {
  generateMobileOtp,
  isMobileVerified,
  verifyMobileOtp,
} from "../utils/otpHelper";
import Otp from "../models/otp.model";
import {
  sendCorporateNewUserNotification,
  sendCorporateUserAwaitingApprovalEmail,
  sendCorporateUserApprovedEmail,
  sendPasswordResetOtp,
  sendWelcomeEmail,
} from "../utils/emailHelper";
import CartProduct from "../models/cartProduct.model";
import Cart from "../models/cart.model";
import db from "../models";
import { slugify } from "../utils/slugify";
import Category from "../models/category.model";
import Payment from "../models/payment.model";
import Wishlist from "../models/wishlist.model";
import ProductReview from "../models/productReview.model";
import BlogComment from "../models/blogComment.model";
import OrderStatusHistory from "../models/orderStatusHistory.model";
import OrderBillingAddress from "../models/orderBillingAddress.model";
import ExcelJS from "exceljs";
import sequelize from "../config/database";

export async function linkPastGuestOrders(user: any) {
  if (!user?.mobile) return;

  try {
    // 1️⃣ Find guest orders placed with same mobile number
    const guestOrders = await Order.findAll({
      where: {
        isGuest: true,
        userId: null,
        [Op.or]: [{ guestMobile: user.mobile }, { guestEmail: user.email }],
      },
    });

    if (!guestOrders.length) return;

    // 2️⃣ Update all guest orders to belong to this user
    await Order.update(
      {
        userId: user.id,
        isGuest: false,
      },
      {
        where: {
          isGuest: true,
          guestMobile: user.mobile,
          userId: null,
        },
      }
    );

    console.log(
      `🔗 Linked ${guestOrders.length} past guest order(s) to user ${user.mobile}`
    );
  } catch (err) {
    console.error("⚠️ Failed to link past guest orders:", err);
  }
}

// 🧩 Helper: Merge guest cart into user cart
async function mergeGuestCartToUser(userId: number, guestToken: string) {
  if (!guestToken) return;

  const t = await db.sequelize.transaction();
  try {
    const guestCart = await Cart.findOne({
      where: { guestToken },
      include: [{ model: CartProduct, as: "cartProducts" }],
      transaction: t,
    });

    if (!guestCart) {
      await t.commit();
      return;
    }

    // find or create user cart
    const [userCart] = await Cart.findOrCreate({
      where: { userId },
      defaults: { userId },
      transaction: t,
    });

    for (const gp of guestCart.cartProducts || []) {
      const existing = await CartProduct.findOne({
        where: { cartId: userCart.id, productId: gp.productId },
        transaction: t,
      });

      if (existing) {
        const mergedSizes = { ...existing.sizes };
        for (const [sizeId, qty] of Object.entries(gp.sizes || {})) {
          mergedSizes[sizeId] = (mergedSizes[sizeId] || 0) + Number(qty);
        }

        existing.sizes = mergedSizes;
        existing.quantity = Object.values(mergedSizes).reduce(
          (a, b) => Number(a) + Number(b),
          0
        );
        await existing.save({ transaction: t });
      } else {
        await CartProduct.create(
          {
            cartId: userCart.id,
            productId: gp.productId,
            price: gp.price,
            quantity: gp.quantity,
            embroidery: gp.embroidery,
            embroideryLogo: gp.embroideryLogo,
            embroideryPosition: gp.embroideryPosition,
            embroideryPrice: gp.embroideryPrice,
            productName: gp.productName,
            sku: gp.sku,
            hsn: gp.hsn,
            productImage: gp.productImage,
            sizes: gp.sizes,
          },
          { transaction: t }
        );
      }
    }

    // delete guest cart
    await CartProduct.destroy({
      where: { cartId: guestCart.id },
      transaction: t,
    });
    await guestCart.destroy({ transaction: t });

    await t.commit();
  } catch (err) {
    await t.rollback();
    console.error("❌ Failed to merge guest cart:", err);
  }
}
// helper to get permissions by role
async function getPermissionsByRole(role: string) {
  if (!role) throw new Error("Role is required");

  // If superadmin → merge permissions from all roles
  if (role === "superadmin") {
    const allRoles = await RoleBasePermission.findAll({
      attributes: ["permissions"],
    });

    // Flatten permissions arrays and remove duplicates
    const mergedPermissions = allRoles.flatMap((r) => r.permissions || []);
    return [...new Set(mergedPermissions)];
  }

  // Otherwise → fetch specific role’s permissions
  const roleRecord = await RoleBasePermission.findOne({
    where: { role },
  });

  if (!roleRecord) {
    console.warn(`⚠️ No permissions found for role: ${role}`);
    return [];
  }

  return roleRecord.permissions || [];
}

// ============ AUTH ============

// user signup (role fixed to user)
export const userSignup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, email, password, mobile } = req.body;

    if (!mobile)
      return res.status(400).json({ message: "Mobile number is required" });
    const verified = await isMobileVerified(mobile);
    if (!verified) {
      return res
        .status(400)
        .json({ message: "Invalid or unverified mobile OTP" });
    }
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { mobile }] },
    });
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: "Email already registered" });
      }
      if (existingUser.mobile === mobile) {
        return res
          .status(400)
          .json({ message: "Mobile number already registered" });
      }
    }

    const user = await User.create({
      name,
      email,
      password,
      mobile,
      role: "user",
      type: "default",
    });

    await Otp.destroy({ where: { mobile } });
    await sendWelcomeEmail(user.email, user.name);

    res.status(201).json({
      success: true,
      message: "User signup successful",
      id: user.id,
      username: user.username,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
};

// user login (only for role=user or corporateUser)
export const userLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type, email, password, mobile, guestToken } = req.body;

    let user;

    // --- EMAIL LOGIN FLOW ---
    if (type === "email") {
      if (!email) return res.status(400).json({ message: "Email is required" });

      user = await User.findOne({ where: { email } });

      if (
        !user ||
        !["user", "corporateUser", "corporate"].includes(user.role!)
      ) {
        return res
          .status(404)
          .json({ message: "User not found or invalid role" });
      }
      // ✅ Block inactive and unapproved users
      if (user.status !== "active") {
        if (user.status === "unapproved" || user.status === "pending") {
          return res
            .status(403)
            .json({ message: "User account is not approved" });
        }
        return res.status(403).json({ message: "User account is not active" });
      }
      if (user.type === "default") {
        if (!password)
          return res.status(400).json({ message: "Password is required" });

        const isPasswordValid = await User.validatePassword(
          user.password!,
          password
        );
        if (!isPasswordValid)
          return res.status(401).json({ message: "Invalid credentials" });
      }

      // --- MOBILE LOGIN FLOW ---
    } else if (type === "mobile") {
      if (!mobile)
        return res.status(400).json({ message: "Mobile number is required" });

      const isValid = await isMobileVerified(mobile);
      if (!isValid)
        return res.status(400).json({ message: "Invalid or expired OTP" });

      user = await User.findOne({ where: { mobile } });

      if (
        !user ||
        !["user", "corporateUser", "corporate"].includes(user.role!)
      ) {
        return res
          .status(404)
          .json({ message: "User not found or invalid role" });
      }
      // ✅ Block inactive and unapproved users
      if (user.status !== "active") {
        if (user.status === "unapproved") {
          return res
            .status(403)
            .json({ message: "User account is not approved" });
        }
        return res.status(403).json({ message: "User account is not active" });
      }
      await Otp.destroy({ where: { mobile } });
    } else {
      return res.status(400).json({ message: "Invalid login type" });
    }

    // --- Merge guest cart if provided ---
    if (guestToken) {
      await mergeGuestCartToUser(user.id, guestToken);
    }

    await linkPastGuestOrders(user);

    // --- TOKEN & PERMISSIONS ---
    const token = issueTokens(res, {
      id: user.id,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      corporateId: user.corporateId ?? null,
    });

    const permissions = await getPermissionsByRole(user.role!);
    // --- CORPORATE SLUG (if applicable) ---
    let slug = null;

    if (user.role === "corporateUser" && user.corporateId) {
      const corporate = await User.findOne({
        where: {
          id: user.corporateId,
          role: "corporate",
        },
        attributes: ["slug"],
      });

      if (corporate) {
        slug = corporate.slug;
      }
    }

    // --- FINAL RESPONSE ---
    return res.status(200).json({
      success: true,
      message: "User login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        corporateId: user.corporateId ?? null,
        role: user.role,
        permissions,
        slug,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const socialLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      token,
      type,
      email: bodyEmail,
      socialId: bodySocialId,
      name,
      image,
      guestToken,
    } = req.body;

    if (!token || !type)
      return res.status(400).json({ message: "Missing token or type" });

    let email = bodyEmail;
    let socialId = bodySocialId;

    if (!email || !socialId) {
      return res.status(401).json({ message: "Invalid social login" });
    }

    // 1️⃣ Find or create user
    let user = await User.findOne({ where: { email } });
    if (user && user.socialId !== socialId) {
      return res.status(401).json({ message: "Invalid social login" });
    }

    if (!user) {
      user = await User.create({
        email,
        type,
        socialId,
        role: "user",
        name,
        image,
      });

      // Send welcome email to new social login user
      try {
        await sendWelcomeEmail(user.email, user.name);
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        // Don't fail the social login if email sending fails
      }
    }

    // 2️⃣ Merge guest cart (if exists)
    if (guestToken) {
      await mergeGuestCartToUser(user.id, guestToken);
    }
    await linkPastGuestOrders(user);

    // 3️⃣ Issue JWT
    const jwtToken = issueTokens(res, {
      id: user.id,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
    });

    // 4️⃣ Return response
    return res.status(200).json({
      success: true,
      token: jwtToken,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
};

// staff login (admin, subadmins)
export const staffLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (
      !user ||
      user.role === "user" ||
      user.role === "corporateUser" ||
      user.role === "corporate"
    ) {
      return res
        .status(404)
        .json({ message: "Staff not found or invalid role" });
    }

    if (!password)
      return res.status(400).json({ message: "Password is required" });

    if (!user.password)
      return res.status(400).json({ message: "Staff account has no password" });

    // ✅ Block inactive and unapproved staff users
    if (user.status !== "active") {
      if (user.status === "unapproved") {
        return res
          .status(403)
          .json({ message: "User account is not approved" });
      }
      return res.status(403).json({ message: "User account is not active" });
    }

    const isPasswordValid = await User.validatePassword(
      user.password,
      password
    );
    if (!isPasswordValid)
      return res.status(401).json({ message: "Invalid credentials" });

    const token = issueTokens(res, {
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const permissions = await getPermissionsByRole(user.role!);

    // Convert image key to URL
    const userJson = user.toJSON();
    userJson.image = getFileUrl(userJson.image ?? null);

    return res.status(200).json({
      success: true,
      message: "Staff login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions,
        image: userJson.image,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const corporateUserSignup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      corporateSlug,
      name,
      email,
      password,
      mobile,
      dealerCode,
      gstNumber,
      designation,
      companyName,
      businessAddress,
      businessLocality,
      businessCity,
      businessState,
      businessPinCode,
      shippingAddress,
      shippingLocality,
      shippingCity,
      shippingState,
      shippingPinCode,
      hasDifferentShipping,
    } = req.body;

    if (!corporateSlug) {
      return res.status(400).json({ message: "Please provide corporate slug" });
    }
    // 1️⃣ Find corporate by slug
    const corporate = await User.findOne({
      where: { slug: corporateSlug, role: "corporate", status: "active" },
    });
    if (!corporate) {
      return res.status(400).json({ message: "Invalid or inactive corporate" });
    }

    // 2️⃣ Required fields
    if (!name || !email || !mobile) {
      return res
        .status(400)
        .json({ message: "Name, email, and mobile are required" });
    }

    // 3️⃣ Check duplicate
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { mobile }] },
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Email or mobile already registered" });
    }

    // 4️⃣ Create user
    const user = await User.create({
      name,
      email,
      password,
      mobile,
      dealerCode,
      designation,
      gstNumber,
      companyName: corporate.companyName,
      corporateId: corporate.id,
      role: "corporateUser",
      type: "default",
      status: "pending",
    });

    // 5️⃣ Business address
    await Address.create({
      userId: user.id,
      name,
      email,
      companyName: companyName || corporate.companyName,
      mobileNumber: mobile,
      address: businessAddress,
      locality: businessLocality,
      city: businessCity,
      state: businessState,
      pinCode: businessPinCode,
      gstNumber,
      addressType: "business",
      isDefault: true,
    });

    // 6️⃣ Optional shipping address
    if (hasDifferentShipping) {
      await Address.create({
        userId: user.id,
        name,
        email,
        companyName: companyName || corporate.companyName,
        mobileNumber: mobile,
        address: shippingAddress,
        locality: shippingLocality,
        city: shippingCity,
        state: shippingState,
        pinCode: shippingPinCode,
        gstNumber,
        addressType: "shipping",
        isDefault: false,
      });
    }

    // 7️⃣ Send notification emails
    try {
      // Notify the corporate user that their account is awaiting approval
      await sendCorporateUserAwaitingApprovalEmail(
        user.email,
        user.name,
        corporate.companyName || "your organization"
      );

      // Notify the corporate admin about the new user
      await sendCorporateNewUserNotification(
        corporate.email,
        corporate.companyName || "Corporate",
        {
          name: user.name,
          email: user.email,
          mobile: user.mobile || "N/A",
          ...(user.designation && { designation: user.designation }),
          ...(user.dealerCode && { dealerCode: user.dealerCode }),
        }
      );
    } catch (emailError) {
      console.error("Failed to send notification emails:", emailError);
      // Don't fail the signup if email sending fails
    }

    // 8️⃣ Done
    return res.status(201).json({
      success: true,
      message: "Corporate user signup successful",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        corporate: {
          id: corporate.id,
          name: corporate.companyName,
          slug: corporate.slug,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============ ADMIN ACTIONS ============

// CREATE CORPORATE
export const createCorporate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      email,
      password,
      mobile,
      name,
      companyName,
      status,
      description,
      creditSystem,
    } = req.body;

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const existingMobile = await User.findOne({ where: { mobile } });
    if (existingMobile) {
      return res.status(400).json({ message: "Mobile number already exists" });
    }

    const slug = slugify(companyName);
    const existingSlug = await User.findOne({ where: { slug } });
    if (existingSlug) {
      return res.status(400).json({
        message:
          "A corporate with similar name already exists (duplicate slug)",
      });
    }
    let imageKey: string | null = null;
    if (req.file) {
      imageKey = await singleUpload(req.file, "users/profile");
    }

    const corporate = await User.create({
      email,
      password,
      mobile: mobile ?? null,
      name: name ?? null,
      companyName: companyName ?? null,
      slug,
      description,
      status: status,
      image: imageKey,
      role: "corporate",
      type: "default",
      creditSystem: creditSystem ?? false,
    });

    const json = corporate.toJSON();
    delete json.password;
    json.image = getFileUrl(json.image ?? null);

    return res.status(201).json({ success: true, data: json });
  } catch (err: any) {
    next(err);
  }
};

export const createSubadmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, email, password, mobile, role } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(400).json({ message: "Email exists" });

    // ✅ handle image if uploaded
    let image: string | null = null;
    if (req.file) {
      image = await singleUpload(req.file, "users"); // store only S3 key
    }

    const subadmin = await User.create({
      name,
      email,
      password,
      mobile,
      role,
      type: "default",
      image,
    });

    // normalize response (return file URL, not S3 key)
    const jsonSubadmin = subadmin.toJSON();
    jsonSubadmin.image = getFileUrl(jsonSubadmin.image ?? null);

    return res.status(201).json({ success: true, data: jsonSubadmin });
  } catch (err) {
    next(err);
  }
};

// USER SELF UPDATE
export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const loggedUserId = req.user!.id;
    const updates = { ...req.body };

    const user = await User.findByPk(loggedUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (updates.username) {
      const existing = await User.findOne({
        where: { username: updates.username, id: { [Op.ne]: loggedUserId } },
      });
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    // Prevent duplicate mobile
    if (updates.mobile) {
      const exists = await User.findOne({
        where: { mobile: updates.mobile, id: { [Op.ne]: loggedUserId } },
      });
      if (exists)
        return res.status(400).json({ message: "Mobile already in use" });
    }

    // Prevent duplicate email
    if (updates.email) {
      const exists = await User.findOne({
        where: { email: updates.email, id: { [Op.ne]: loggedUserId } },
      });
      if (exists)
        return res.status(400).json({ message: "Email already in use" });
    }

    // Never allow password/role changes here
    delete updates.password;
    delete updates.oldPassword;
    delete updates.newPassword;
    delete updates.role;

    if (req.file) {
      if (user.image) {
        try {
          await deleteImage(user.image);
        } catch (err) {
          console.warn("⚠️ Failed to delete old image:", err);
        }
      }
      updates.image = await singleUpload(req.file, "users/profile");
    }

    // Regenerate slug if companyName is being updated and user is a corporate
    if (updates.companyName && user.role === "corporate") {
      const newSlug = slugify(updates.companyName);

      // Check if the new slug already exists (excluding current user)
      const existingSlug = await User.findOne({
        where: {
          slug: newSlug,
          id: { [Op.ne]: loggedUserId },
          role: "corporate",
        },
      });

      if (existingSlug) {
        return res.status(400).json({
          message: "A corporate with similar company name already exists",
        });
      }

      updates.slug = newSlug;
    }

    await user.update(updates);

    const json = user.toJSON();
    delete json.password;
    json.image = getFileUrl(json.image ?? null);

    return res.status(200).json({ success: true, user: json });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const loggedUser = req.user!;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        message: "Both oldPassword and newPassword are required",
      });
    }

    const user = await User.findByPk(loggedUser.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.password)
      return res
        .status(400)
        .json({ message: "This account uses OTP login and has no password." });

    const isValid = await User.validatePassword(user.password!, oldPassword);
    if (!isValid) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }
    if (oldPassword === newPassword) {
      return res
        .status(401)
        .json({ message: "New password cannot be same as old password" });
    }

    user.password = newPassword; // Sequelize hook will hash
    await user.save();

    return res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};

// ADMIN UPDATE USER
export const adminUpdateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentUser = req.user!; // already attached by auth middleware

    if (
      currentUser.role !== "superadmin" &&
      currentUser.role !== "admin" &&
      currentUser.role !== "corporate"
    ) {
      return res.status(404).json({
        message:
          "Access denied. Only Superadmin, Admin and Corporate users can perform this action.",
      });
    }

    // Superadmin and Admin can edit anyone
    if (currentUser.role === "superadmin" || currentUser.role === "admin") {
      // full access
    }
    // Corporate can edit only their own users
    else if (currentUser.role === "corporate") {
      if (user.corporateId !== currentUser.id) {
        return res.status(403).json({
          message: "You can only edit users under your corporate account",
        });
      }
    }
    // Everyone else = forbidden
    else {
      return res
        .status(403)
        .json({ message: "You are not allowed to update users" });
    }

    if (updates.username) {
      const existing = await User.findOne({
        where: { username: updates.username, id: { [Op.ne]: id } },
      });
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    if (req.file) {
      if (user.image) {
        try {
          await deleteImage(user.image);
        } catch (err) {
          console.warn("⚠️ Failed to delete old image:", err);
        }
      }
      updates.image = await singleUpload(req.file, "users/profile");
    }

    // Regenerate slug if companyName is being updated and user is a corporate
    if (updates.companyName && user.role === "corporate") {
      const newSlug = slugify(updates.companyName);

      // Check if the new slug already exists (excluding current user)
      const existingSlug = await User.findOne({
        where: {
          slug: newSlug,
          id: { [Op.ne]: id },
          role: "corporate",
        },
      });

      if (existingSlug) {
        return res.status(400).json({
          message: "A corporate with similar company name already exists",
        });
      }

      updates.slug = newSlug;
    }

    const previousStatus = user.status;
    await user.update(updates);

    // 🔥 STATUS-SAFE CASCADE FOR CORPORATE USERS
    if (
      user.role === "corporate" &&
      updates.status &&
      updates.status !== previousStatus
    ) {
      // Corporate → inactive : active users → inactive
      if (updates.status === "inactive") {
        await User.update(
          { status: "inactive" },
          {
            where: {
              role: "corporateUser",
              corporateId: user.id,
              status: "active",
            },
            validate: false,
          }
        );
      }

      // Corporate → active : inactive users → active
      if (updates.status === "active") {
        await User.update(
          { status: "active" },
          {
            where: {
              role: "corporateUser",
              corporateId: user.id,
              status: "inactive",
            },
            validate: false,
          }
        );
      }
    }

    // Send corporate user approved email if user was just approved by admin
    if (
      previousStatus === "pending" &&
      user.status === "active" &&
      user.role === "corporateUser"
    ) {
      try {
        let loginUrl = `${process.env.FRONTEND_BASE_URL}/account`;

        // If user has a corporateId, fetch the corporate slug and create dynamic login URL
        if (user.corporateId) {
          const corporate = await User.findOne({
            where: { id: user.corporateId, role: "corporate" },
            attributes: ["slug"],
          });

          if (corporate && corporate.slug) {
            loginUrl = `${process.env.FRONTEND_BASE_URL}/corporate/${corporate.slug}/login`;
          }
        }

        await sendCorporateUserApprovedEmail(user.email, user.name, loginUrl);
      } catch (emailError) {
        console.error("Failed to send approval email:", emailError);
        // Don't fail the status update if email sending fails
      }
    }

    const json = user.toJSON();
    delete json.password;
    json.image = getFileUrl(json.image ?? null);

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: json,
    });
  } catch (err) {
    next(err);
  }
};

// ============ FETCHING ============

export const getAllUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const filterStatus = req.query.status as string | undefined;

    let where: any = { role: "user" };
    if (filterStatus) where.status = filterStatus;

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { mobile: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count: total, rows: users } = await User.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "name",
        "email",
        "mobile",
        "status",
        "role",
        "image",
        "createdAt",
        "updatedAt",
      ],
    });

    //  Convert image key to URL
    const data = users.map((u) => {
      const json = u.toJSON();
      json.image = getFileUrl(json.image ?? null);
      return json;
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const exportUsersToExcel = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const search = (req.query.search as string) || "";
    const filterStatus = req.query.status as string | undefined;

    let where: any = { role: "user" };
    if (filterStatus) where.status = filterStatus;

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { mobile: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "name",
        "email",
        "mobile",
        "status",
        "image",
        "createdAt",
        "updatedAt",
      ],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Users");

    // -----------------------------
    // 🔹 HEADER
    // -----------------------------
    const headerRow = sheet.addRow([
      "ID",
      "Name",
      "Email",
      "Mobile",
      "Status",
      "Image URL",
      "Created At",
      "Updated At",
    ]);

    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFEFEF" }, // Light gray header background
      };
    });

    // -----------------------------
    // 🔹 DATA ROWS
    // -----------------------------
    users.forEach((u: any) => {
      const json = u.toJSON();
      const imageUrl = getFileUrl(json.image ?? null);

      const row = sheet.addRow([
        json.id,
        json.name,
        json.email,
        json.mobile,
        json.status,
        imageUrl || "",
        json.createdAt ? new Date(json.createdAt).toLocaleDateString() : "",
        json.updatedAt ? new Date(json.updatedAt).toLocaleDateString() : "",
      ]);

      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });
    });

    // AUTO-FIT all columns except image URL (index 5)
    sheet.columns.forEach((col: any, index) => {
      if (index === 5) {
        // Image URL column → set fixed width
        col.width = 30;
        return;
      }

      let maxLength = 10;

      col.eachCell({ includeEmpty: true }, (cell: any) => {
        const value = cell.value ? cell.value.toString() : "";
        maxLength = Math.max(maxLength, value.length + 2);
      });

      col.width = maxLength;
    });

    // -----------------------------
    // 🔹 FREEZE HEADER ROW
    // -----------------------------
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // -----------------------------
    // 🔹 EXPORT FILE
    // -----------------------------
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

// Export corporate users to Excel
export const exportCorporateUsersToExcel = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params; // corporateId
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    // Validate that the requesting user has permission to access this corporate's data
    const requestingUser = req.user;
    if (!requestingUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // If the requesting user is not a superadmin/admin, verify they can only access their own corporate data
    if (
      requestingUser.role !== "superadmin" &&
      requestingUser.role !== "admin"
    ) {
      // Corporate users can only access their own corporate users
      if (
        requestingUser.role !== "corporate" ||
        requestingUser.id !== Number(id)
      ) {
        return res.status(403).json({
          message:
            "Access denied. You can only export users from your own corporate account.",
        });
      }
    }

    const where: any = { corporateId: id, role: "corporateUser" };

    //  search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { mobile: { [Op.iLike]: `%${search}%` } },
      ];
    }

    //  status filter
    if (status) {
      where.status = status;
    }

    const users = await User.findAll({
      where,
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "name",
        "email",
        "mobile",
        "status",
        "createdAt",
        "updatedAt",
      ],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Corporate Users");

    // -----------------------------
    // 🔹 HEADER
    // -----------------------------
    const headerRow = sheet.addRow([
      "ID",
      "Name",
      "Email",
      "Mobile",
      "Status",
      "Created At",
      "Updated At",
    ]);

    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFEFEF" }, // Light gray header background
      };
    });

    // -----------------------------
    // 🔹 DATA ROWS
    // -----------------------------
    users.forEach((u: any) => {
      const json = u.toJSON();
      const imageUrl = getFileUrl(json.image ?? null);

      const row = sheet.addRow([
        json.id,
        json.name,
        json.email,
        json.mobile,
        json.status,
        json.createdAt ? new Date(json.createdAt).toLocaleDateString() : "",
        json.updatedAt ? new Date(json.updatedAt).toLocaleDateString() : "",
      ]);

      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });
    });

    // AUTO-FIT all columns except image URL (index 5)
    sheet.columns.forEach((col: any, index) => {
      let maxLength = 10;

      col.eachCell({ includeEmpty: true }, (cell: any) => {
        const value = cell.value ? cell.value.toString() : "";
        maxLength = Math.max(maxLength, value.length + 2);
      });

      col.width = maxLength;
    });

    // -----------------------------
    // 🔹 FREEZE HEADER ROW
    // -----------------------------
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // -----------------------------
    // 🔹 EXPORT FILE
    // -----------------------------
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=corporate_${id}_users.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

export const getAdminUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const filterStatus = req.query.status as string | undefined;

    let where: any = {
      role: {
        [Op.notIn]: ["user", "corporateUser", "corporate", "superadmin"],
      }, // Exclude admin and superadmin roles
    };
    if (filterStatus) where.status = filterStatus;

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { mobile: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count: total, rows: users } = await User.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "name",
        "email",
        "mobile",
        "status",
        "role",
        "image",
        "createdAt",
        "updatedAt",
      ],
    });

    //  Convert image key to URL
    const data = users.map((u) => {
      const json = u.toJSON();
      json.image = getFileUrl(json.image ?? null);
      return json;
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // 1. User info
    const user = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const userJson = user.toJSON();
    userJson.image = getFileUrl(userJson.image ?? null);
    // 2. User addresses
    const addresses = await Address.findAll({
      where: { userId: id },
    });

    const shippingAddress = addresses.filter(
      (a) => a.addressType === "shipping"
    );
    const businessAddress =
      addresses.find((a) => a.addressType === "business") || null;

    // 3. Orders with products + shipping address
    const orders = await Order.findAll({
      where: { userId: id },
      include: [
        {
          model: OrderProduct,
          as: "orderProducts",
          include: [
            {
              model: Product,
              as: "product",
              attributes: ["id", "title", "price"],
            },
          ],
        },
        {
          model: OrderShippingAddress,
          as: "shippingAddress",
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // 4. Overview
    // only orders with paid/success payment status for revenue and count
    const paidOrdersList = orders.filter((o) =>
      ["paid", "success"].includes(o.paymentStatus)
    );
    const totalOrders = paidOrdersList.length;

    // revenue only from paid orders
    const totalRevenue = paidOrdersList.reduce(
      (sum, order) => sum + Number(order.grandTotal || 0),
      0
    );

    // count of paid orders with delivered status
    const deliveredPaidOrders = paidOrdersList.filter(
      (o) => o.status === "delivered"
    ).length;

    // Only orders with paid/success payment status for last order
    const validOrders = orders.filter((o) =>
      ["paid", "success"].includes(o.paymentStatus)
    );
    const lastOrder = validOrders[0] || null;
    const lastOrderDate = lastOrder ? lastOrder.createdAt : null;
    const lastOrderTotal = lastOrder ? Number(lastOrder.grandTotal) : null;

    // 5. Format order history
    const orderHistory = orders.map((order: any) => ({
      orderId: order.id,
      orderTotal: order.grandTotal.toFixed(2),
      date: order.createdAt,
      shippingAddress: order.shippingAddress,
      status: order.status,
      paymentMode: order.paymentMode,
      paymentMethod: order.paymentMethod,
    }));

    return res.status(200).json({
      success: true,
      user: userJson,

      shippingAddress,
      businessAddress,
      overview: {
        totalOrders,
        totalRevenue: totalRevenue.toFixed(2),
        completedOrders: deliveredPaidOrders,
        lastOrderDate,
        lastOrderTotal:
          lastOrderTotal !== null ? lastOrderTotal.toFixed(2) : null,
      },
      orderHistory,
    });
  } catch (err) {
    next(err);
  }
};

export const getCorporateDropdown = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const corporates = await User.findAll({
      where: { role: "corporate", status: "active" },
      attributes: [
        "id",
        "name",
        "companyName",
        "image",
        [fn("COUNT", col("corporateOrders.id")), "newOrdersCount"],
      ],
      include: [
        {
          model: Order,
          as: "corporateOrders",
          attributes: [],
          where: { status: "process" },
          required: false,
        },
      ],
      group: ["User.id"],
    });

    // 🔹 Normalize image response
    const normalized = corporates.map((c) => {
      const json = c.toJSON();
      json.image = getFileUrl(json.image ?? null, "corporates");
      return json;
    });

    return res.status(200).json({ success: true, data: normalized });
  } catch (err) {
    next(err);
  }
};

export const getAllCorporates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { status, search } = req.query;
    console.log("natik");

    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.max(
      1,
      parseInt((req.query.limit as string) || "10", 10)
    );
    const offset = (page - 1) * limit;

    const where: Record<string | symbol, any> = { role: "corporate" };

    if (status) {
      where.status = status as string;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { companyName: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count: total, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    // 🔹 Normalize image URLs
    const data = rows.map((c) => {
      const json = c.toJSON();
      json.image = getFileUrl(json.image ?? null);
      return json;
    });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data,
    });
  } catch (err) {
    next(err);
  }
};
export const getCorporateDetails = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // 1. Corporate info (basic)
    const corporate = await User.findOne({
      where: { id, role: "corporate" },
      attributes: { exclude: ["password"] },
    });
    if (!corporate)
      return res.status(404).json({ message: "Corporate not found" });

    const corporateJson = corporate.toJSON();
    corporateJson.image = getFileUrl(corporateJson.image ?? null);
    // 3. Products (count + active count)
    const products = await Product.findAll({
      where: { corporateId: id },
      attributes: ["status"],
    });
    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.status === "active").length;

    // 4. Corporate users (count only)
    const totalUsers = await User.count({
      where: { corporateId: id, role: "corporateUser" },
    });
    const unapprovedUsers = await User.count({
      where: {
        corporateId: id,
        role: "corporateUser",
        status: "pending",
      },
    });

    // 5. Orders (count + revenue + new orders)
    const orders = await Order.findAll({
      where: { corporateId: id },
      attributes: ["grandTotal", "status", "paymentStatus"],
    });

    // Calculate revenue and count only from orders with paid/success payment status
    const paidOrders = orders.filter((o) =>
      ["paid", "success"].includes(o.paymentStatus)
    );
    const totalOrders = paidOrders.length;
    const totalOrdersCost = Number(
      paidOrders
        .reduce((sum, o) => sum + Number(o.grandTotal || 0), 0)
        .toFixed(2)
    );
    const newOrders = orders.filter((o) => o.status === "process").length;

    const addresses = await Address.findAll({
      where: { userId: id },
      attributes: { exclude: ["createdAt", "updatedAt"] },
    });

    return res.status(200).json({
      success: true,
      corporate: corporateJson,
      addresses: {
        shipping: addresses.filter((a) => a.addressType === "shipping"),
        business: addresses.filter((a) => a.addressType === "business"),
      },
      creditSystem: corporateJson.creditSystem,

      stats: {
        totalProducts,
        activeProducts,
        totalUsers,
        unapprovedUsers,
        totalOrders,
        totalOrdersCost,
        newOrders,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listCorporateOrders = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params; // corporateId
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const { status, startDate, endDate, search } = req.query;

    const where: Record<string | symbol, any> = {
      corporateId: Number(id), // ✅ filter at order level now
    };

    //  Filter by order status
    if (status) where.status = status;

    //  Filter by date range
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      where.createdAt = { [Op.between]: [start, end] };
    } else if (startDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      where.createdAt = { [Op.gte]: start };
    } else if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { [Op.lte]: end };
    }

    //  Build User include (only for search, no need for corporate filter anymore)
    const userInclude: any = {
      model: User,
      as: "user",
      attributes: ["id", "name", "image", "email", "mobile", "corporateId"],
      required: false,
    };

    if (search) {
      userInclude.where = {
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { mobile: { [Op.iLike]: `%${search}%` } },
        ],
      };
      userInclude.required = true;
    }

    const include: any[] = [
      userInclude,
      {
        model: OrderShippingAddress,
        as: "shippingAddress",
        attributes: ["id", "address", "city", "state", "pinCode"],
      },
      {
        model: Payment,
        as: "payment",
        attributes: ["trackingId"],
      },
    ];

    //  Paginated orders
    const { count: total, rows: orders } = await Order.findAndCountAll({
      where,
      limit,
      offset,
      distinct: true,
      order: [["createdAt", "DESC"]],
      include,
      attributes: ["id", "grandTotal", "status", "paymentMethod", "createdAt"],
    });

    //  Status counts (scoped to this corporate)
    const statusCounts = await Order.findAll({
      where,
      attributes: ["status", [fn("COUNT", col("Order.id")), "count"]],
      group: ["Order.status"],
      raw: true,
    });

    const statusSummary = statusCounts.reduce((acc: any, row: any) => {
      acc[row.status] = Number(row.count);
      return acc;
    }, {});

    //  Format response
    const formattedOrders = orders.map((order: any) => ({
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      transactionId: order.payment?.trackingId || order.id,
      orderAmount: order.grandTotal,
      status: order.status,
      paymentMethod: order.paymentMethod,
      date: order.createdAt,
      user: order.user
        ? {
            id: order.user.id,
            name: order.user.name,
            email: order.user.email,
            mobile: order.user.mobile,
            corporateId: order.user.corporateId,
            image: order.user.image,
          }
        : null,
      shippingAddress: order.shippingAddress || null,
    }));

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      statusSummary,
      data: formattedOrders,
    });
  } catch (err) {
    next(err);
  }
};

export const listCorporateUsers = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params; // corporateId
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    const where: any = { corporateId: id, role: "corporateUser" };

    //  search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { mobile: { [Op.iLike]: `%${search}%` } },
      ];
    }

    //  status filter
    if (status) {
      where.status = status;
    }

    const { count: total, rows } = await User.findAndCountAll({
      where,
      attributes: ["id", "name", "email", "mobile", "status", "image"],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    //  Normalize image URL
    const normalized = rows.map((u) => {
      const json = u.toJSON();
      json.image = getFileUrl(json.image ?? null);
      return json;
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: normalized,
    });
  } catch (err) {
    next(err);
  }
};

export const listCorporateCreditHistory = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params; // corporateId
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const { count: total, rows: history } =
      await CorporateCreditHistory.findAndCountAll({
        where: { corporateId: id },
        include: [
          { model: User, as: "user", attributes: ["id", "name", "email"] },
        ],
        limit,
        offset,
        order: [["createdAt", "DESC"]],
      });

    const creditAccounts = await CorporateCredit.findAll({
      where: { corporateId: id },
    });

    const totalAssigned = creditAccounts.reduce(
      (sum, acc) => sum + Number(acc.totalCredit || 0),
      0
    );
    const totalUsed = creditAccounts.reduce(
      (sum, acc) => sum + Number(acc.usedCredit || 0),
      0
    );
    const totalAvailable = creditAccounts.reduce(
      (sum, acc) => sum + Number(acc.availableCredit || 0),
      0
    );

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: history,
      credit: {
        totalAssigned,
        totalUsed,
        totalAvailable,
      },
    });
  } catch (err) {
    next(err);
  }
};
// ============ TOKENS & SOCIAL ============

export const refresh = (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ message: "Missing refresh token" });
  try {
    const payload = jwt.verify(token, process.env.REFRESH_SECRET!) as any;
    const accessToken = signAccess({
      id: payload.id,
      email: payload.email,
      role: payload.role,
    });
    return res.status(200).json({ success: true, token: accessToken });
  } catch {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};

export const logout = (_req: Request, res: Response) => {
  res.clearCookie("refresh_token");
  return res.status(200).json({ success: true });
};

export const deleteUser = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent deleting superadmins
    if (user.role === "superadmin") {
      await t.rollback();
      return res.status(400).json({ message: "Superadmins cannot be deleted" });
    }
    // Prevent deleting other admins
    if (user.role === "admin") {
      await t.rollback();
      return res.status(400).json({ message: "Admins cannot be deleted" });
    }

    // Delete all related data in a specific order to avoid foreign key constraint issues
    // 1. Delete user's wishlist items
    await Wishlist.destroy({
      where: { userId: user.id },
      transaction: t,
    });

    // 2. Delete user's blog comments
    await BlogComment.destroy({
      where: { userId: user.id },
      transaction: t,
    });

    // 3. Delete user's product reviews
    await ProductReview.destroy({
      where: { userId: user.id },
      transaction: t,
    });

    // 4. Delete user's addresses
    await Address.destroy({
      where: { userId: user.id },
      transaction: t,
    });

    // 5. Delete user's carts and cart products
    const carts = await Cart.findAll({
      where: { userId: user.id },
      transaction: t,
    });

    for (const cart of carts) {
      await CartProduct.destroy({
        where: { cartId: cart.id },
        transaction: t,
      });
    }

    await Cart.destroy({
      where: { userId: user.id },
      transaction: t,
    });

    // 6. Delete user's orders and all related data
    const orders = await Order.findAll({
      where: { userId: user.id },
      transaction: t,
    });

    for (const order of orders) {
      // Delete order related data
      await OrderProduct.destroy({
        where: { order_id: order.id },
        transaction: t,
      });

      await OrderShippingAddress.destroy({
        where: { order_id: order.id },
        transaction: t,
      });

      await OrderBillingAddress.destroy({
        where: { order_id: order.id },
        transaction: t,
      });

      await OrderStatusHistory.destroy({
        where: { orderId: order.id },
        transaction: t,
      });

      await Payment.destroy({
        where: { orderId: order.id },
        transaction: t,
      });
    }

    // Now delete the orders themselves
    await Order.destroy({
      where: { userId: user.id },
      transaction: t,
    });

    // 7. Delete corporate related data if user is a corporate
    if (user.role === "corporate") {
      // Delete corporate credit data
      await CorporateCredit.destroy({
        where: { userId: user.id },
        transaction: t,
      });

      await CorporateCreditHistory.destroy({
        where: { userId: user.id },
        transaction: t,
      });

      // Set corporateId to null for products owned by this corporate
      await Product.update(
        { corporateId: null },
        { where: { corporateId: user.id }, transaction: t }
      );

      // Set corporateId to null for categories owned by this corporate
      await Category.update(
        { corporateId: null },
        { where: { corporateId: user.id }, transaction: t }
      );
    }

    // 8. Delete coupon usage records
    // Note: We're not deleting coupons themselves as they might be used by others
    // await CouponUsage.destroy({
    //   where: { userId: user.id },
    //   transaction: t
    // });

    // 9. Finally, delete the user
    await user.destroy({ transaction: t });

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "User and all related data deleted successfully",
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.password) {
      // If user logs in only via mobile OTP or social login
      return res.status(400).json({
        message: "This account uses OTP login, password reset not applicable",
      });
    }

    // Generate OTP for password reset (you already have helper)
    const otp = await generateMobileOtp(email); // can reuse same table, just store email instead of mobile
    // or create a separate table like `PasswordReset` if you prefer

    // Send OTP to email
    await sendPasswordResetOtp(email, otp);

    return res.status(200).json({
      success: true,
      message: `Password reset OTP sent to ${email}`,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyResetOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP are required" });

    const isValid = await verifyMobileOtp(email, otp); // works same way as mobile OTP
    if (!isValid)
      return res.status(400).json({ message: "Invalid or expired OTP" });

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword)
      return res
        .status(400)
        .json({ message: "Email and new password are required" });

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const verified = await isMobileVerified(email);
    if (!verified)
      return res
        .status(400)
        .json({ message: "Email not verified for password reset" });

    user.password = newPassword;
    await user.save();

    // Cleanup OTPs
    await Otp.destroy({ where: { mobile: email } });

    return res.status(200).json({
      success: true,
      message:
        "Password reset successful. You can now log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

export const getLoggedInUser = async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id, {
      attributes: { exclude: ["password"] },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const json = user.toJSON();
    json.image = getFileUrl(json.image ?? null);

    return res.status(200).json({ success: true, user: json });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getMyCorporateDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const corporateId = req.user?.id;

    const corporate = await User.findOne({
      where: { id: corporateId, role: "corporate" },
      attributes: { exclude: ["password"] },
    });
    if (!corporate)
      return res.status(404).json({ message: "Corporate not found" });

    const corporateJson = corporate.toJSON();
    corporateJson.image = getFileUrl(corporateJson.image ?? null);

    // Products
    const products = await Product.findAll({
      where: { corporateId },
      attributes: ["status"],
    });

    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.status === "active").length;

    // Users
    const totalUsers = await User.count({
      where: { corporateId, role: "corporateUser" },
    });

    // Orders - FIXED: Exclude pending, cancelled, and returned orders like in admin dashboard
    const orders = await Order.findAll({
      where: {
        corporateId,
        status: { [Op.notIn]: ["pending", "cancelled", "returned", "trash"] }, // Added filter
      },
      attributes: ["grandTotal", "status", "paymentStatus"],
    });

    // Calculate revenue and count only from orders with paid/success payment status
    const paidOrders = orders.filter((o) =>
      ["paid", "success"].includes(o.paymentStatus)
    );
    const totalOrders = paidOrders.length;
    const totalOrdersCost = Number(
      paidOrders
        .reduce((sum, o) => sum + Number(o.grandTotal || 0), 0)
        .toFixed(2)
    );
    const newOrders = orders.filter((o) => o.status === "process").length;
    const unapprovedUsers = await User.count({
      where: {
        corporateId: corporateId,
        role: "corporateUser",
        status: "pending",
      },
    });

    return res.status(200).json({
      success: true,
      corporate: corporateJson,
      stats: {
        totalProducts,
        activeProducts,
        totalUsers,
        totalOrders,
        totalOrdersCost,
        newOrders,
        unapprovedUsers,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getCorporateRevenueWithDateFilter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.user?.role !== "corporate") {
      return res.status(403).json({ message: "Corporate access only" });
    }

    const corporateId = req.user?.id;
    const { startDate, endDate } = req.query;

    // Apply same filtering logic as getMyCorporateDashboard
    const where: any = {
      corporateId,
      status: { [Op.notIn]: ["pending", "cancelled", "returned", "trash"] },
    };

    // Add date range filter if provided
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { [Op.between]: [start, end] };
    }

    const orders = await Order.findAll({
      where,
      attributes: ["grandTotal", "status", "paymentStatus"],
    });

    // Apply same revenue calculation logic
    const paidOrders = orders.filter((o) =>
      ["paid", "success"].includes(o.paymentStatus)
    );
    const totalRevenue = Number(
      paidOrders
        .reduce((sum, o) => sum + Number(o.grandTotal || 0), 0)
        .toFixed(2)
    );

    return res.status(200).json({
      success: true,
      totalRevenue,
      orderCount: paidOrders.length,
      dateRange: { startDate, endDate },
    });
  } catch (err) {
    next(err);
  }
};

export const getMyCorporateUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== "corporate") {
      return res.status(403).json({ message: "Access denied" });
    }

    const corporateId = req.user.id;
    req.params.id = String(corporateId);

    const { id } = req.params; // corporateId
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    const where: any = { corporateId: id, role: "corporateUser" };

    //  search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { mobile: { [Op.iLike]: `%${search}%` } },
      ];
    }

    //  status filter
    if (status) {
      where.status = status;
    }

    const { count: total, rows } = await User.findAndCountAll({
      where,
      attributes: ["id", "name", "email", "mobile", "status", "image"],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    //  Normalize image URL
    const normalized = rows.map((u) => {
      const json = u.toJSON();
      json.image = getFileUrl(json.image ?? null);
      return json;
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: normalized,
    });
  } catch (err) {
    next(err);
  }
};

export const listPublicCorporates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const search = (req.query.search as string) || "";

    const where: any = { role: "corporate", status: "active" };
    if (search) {
      where.companyName = { [Op.iLike]: `%${search}%` };
    }

    const corporates = await User.findAll({
      where,
      attributes: ["id", "companyName", "slug", "email", "image"],
      order: [["companyName", "ASC"]],
    });

    const data = corporates.map((corp) => ({
      id: corp.id,
      companyName: corp.companyName,
      slug: corp.slug,
      email: corp.email,
      image: getFileUrl(corp.image ?? null, "corporate/image"),
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getPublicCorporateBySlug = async (
  req: Request<{ slug: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({ message: "Corporate slug is required" });
    }

    // 1️⃣ Find corporate by slug
    const corporate = await User.findOne({
      where: { slug, role: "corporate", status: "active" },
      attributes: ["id", "companyName", "slug", "description", "image"],
    });

    if (!corporate) {
      return res.status(404).json({ message: "Corporate not found" });
    }

    // 2️⃣ Format response
    const data = corporate.toJSON();
    data.image = getFileUrl(data.image ?? null, "corporates/logos");

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCorporateUserStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const corporate = req.user!;
    const { status } = req.body;
    const userId = Number(req.params.id);

    // ✅ Only corporates can use this route
    if (corporate.role !== "corporate") {
      return res
        .status(403)
        .json({ message: "Only corporate users can perform this action" });
    }

    // ✅ Find the target user
    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Ensure the target belongs to the same corporate
    if (targetUser.corporateId !== corporate.id) {
      return res.status(403).json({
        message: "You can only update status for your own corporate users",
      });
    }

    // ✅ Update status safely
    const previousStatus = targetUser.status;
    targetUser.status = status;
    await targetUser.save();

    // Send corporate user approved email if user was just approved
    if (previousStatus === "pending" && status === "active") {
      try {
        let loginUrl = `${process.env.FRONTEND_BASE_URL}/account`;

        // If user has a corporateId, fetch the corporate slug and create dynamic login URL
        if (targetUser.corporateId) {
          const corporate = await User.findOne({
            where: { id: targetUser.corporateId, role: "corporate" },
            attributes: ["slug"],
          });

          if (corporate && corporate.slug) {
            loginUrl = `${process.env.FRONTEND_BASE_URL}/corporate/${corporate.slug}/login`;
          }
        }

        await sendCorporateUserApprovedEmail(
          targetUser.email,
          targetUser.name,
          loginUrl
        );
      } catch (emailError) {
        console.error("Failed to send approval email:", emailError);
        // Don't fail the status update if email sending fails
      }
    }

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: targetUser,
    });
  } catch (err) {
    next(err);
  }
};
