import ExcelJS from "exceljs";
import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import db from "../models";
import Cart from "../models/cart.model";
import CartProduct from "../models/cartProduct.model";
import Product from "../models/product.model";
import Order from "../models/order.model";
import OrderProduct from "../models/orderProduct.model";
import Address from "../models/address.model";
import Coupon from "../models/coupon.model";
import { calculateTax } from "../utils/taxHelper";
import { calculateShipping } from "../utils/shippingHelper";
import OrderShippingAddress from "../models/orderShippingAddress.model";
import OrderBillingAddress from "../models/orderBillingAddress.model";
import Option from "../models/option.model";
import { deductCredit } from "./corporateCredit.controller";
import OrderStatusHistory from "../models/orderStatusHistory.model";
import { markCouponUsed } from "./coupon.controller";
import CouponUsage from "../models/couponUsage.model";
import { col, fn, Op } from "sequelize";
import User from "../models/user.model";
import { getFileUrl } from "../utils/awsS3";
import {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  sendOrderReceiverNotification,
} from "../utils/emailHelper";
import RoleBasePermission from "../models/roleBasePermission.model";
import ejs from "ejs";
import { getCluster } from "../utils/puppeteerCluster";
import Payment from "../models/payment.model";
import * as crypto from "crypto";

// Helper function to generate checkout hash
const generateCheckoutHash = (
  cartProducts: any[],
  coupon: any,
  shippingAddress: any,
  billingAddress: any
): string => {
  // Create a string representation of the cart contents
  const cartData = cartProducts
    .sort((a, b) => a.productId - b.productId) // Sort by productId for consistency
    .map((cp) => {
      const sortedSizes = Object.keys(cp.sizes || {})
        .sort((a, b) => Number(a) - Number(b))
        .reduce((obj, key) => {
          obj[key] = cp.sizes[key];
          return obj;
        }, {} as Record<string, any>);

      return [
        cp.productId,
        cp.quantity,
        cp.price,
        cp.embroidery,
        cp.embroideryPosition,
        cp.embroideryPrice,
        JSON.stringify(sortedSizes),
        cp.productImage,
        cp.productName,
        cp.sku,
      ].join("|");
    })
    .join(";");

  // Create string representation of coupon
  const couponData = coupon
    ? `${coupon.code}|${coupon.type}|${coupon.discount}`
    : "nocoupon";

  // Create string representation of addresses
  const shippingData = [
    shippingAddress.name,
    shippingAddress.email,
    shippingAddress.mobileNumber,
    shippingAddress.address,
    shippingAddress.city,
    shippingAddress.state,
    shippingAddress.pinCode,
  ].join("|");

  const billingData = [
    billingAddress.name,
    billingAddress.email,
    billingAddress.mobileNumber,
    billingAddress.address,
    billingAddress.city,
    billingAddress.state,
    billingAddress.pinCode,
  ].join("|");

  // Combine all data and create SHA-256 hash
  const combinedData = `${cartData}|${couponData}|${shippingData}|${billingData}`;

  return crypto.createHash("sha256").update(combinedData).digest("hex");
};

// Format order response so it matches cart response shape
const formatOrderResponse = async (order: any, optionsMap: Option[] = []) => {
  const orderData = order.toJSON ? order.toJSON() : order;

  // Calculate total quantity from order products
  let totalQuantity = 0;
  if (orderData.orderProducts && Array.isArray(orderData.orderProducts)) {
    totalQuantity = orderData.orderProducts.reduce(
      (total: any, product: any) => {
        return total + (product.quantity || 0);
      },
      0
    );
  }

  // Seller origin state — can move to env if needed
  const sellerState = "delhi";
  const buyerState = orderData.shippingAddress?.state || "";

  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  let totalTax = 0;

  const transformedProducts = (orderData.orderProducts || []).map((p: any) => {
    // Sizes
    const sizes =
      p.sizes && Object.keys(p.sizes).length
        ? Object.keys(p.sizes).map((sizeId) => {
          const optionObj = optionsMap.find(
            (o: any) => o.id === Number(sizeId)
          );
          return {
            id: Number(sizeId),
            name: optionObj?.name || `Size ${sizeId}`,
            quantity: p.sizes[sizeId],
          };
        })
        : [];

    // Pricing
    const unitPrice = Number(p.price);
    const productTotal = unitPrice * Number(p.quantity);
    const embroideryTotal = (p.embroideryPrice || 0) * Number(p.quantity);
    const totalCost = productTotal + embroideryTotal;

    // ✅ Tax calculation (using your existing helper)
    const taxInfo = calculateTax(
      unitPrice,
      Number(p.quantity),
      p.embroideryPrice || 0,
      buyerState,
      sellerState
    );

    totalCGST += taxInfo.cgst || 0;
    totalSGST += taxInfo.sgst || 0;
    totalIGST += taxInfo.igst || 0;
    totalTax += taxInfo.taxAmount || 0;
    return {
      id: p.id,
      productId: p.productId,
      product_name: p.product_name,
      sku: p.sku,
      productImage: getFileUrl(p.productImage, "products/featured-image"),
      embroideryLogo: getFileUrl(p.embroideryLogo),
      embroideryPosition: p.embroideryPosition,
      quantity: p.quantity,
      unitPrice: unitPrice.toFixed(2),
      productTotal: productTotal.toFixed(2),
      embroideryPrice: Number(p.embroideryPrice || 0).toFixed(2),
      embroideryTotal: embroideryTotal.toFixed(2),
      totalCost: totalCost.toFixed(2),
      taxRate: taxInfo.taxRate,
      cgst: taxInfo.cgst,
      sgst: taxInfo.sgst,
      igst: taxInfo.igst,
      taxAmount: taxInfo.taxAmount,
      totalWithTax: taxInfo.total,
      sizes,
    };
  });
  const taxBreakdown = {
    cgst: Number(totalCGST.toFixed(2)),
    sgst: Number(totalSGST.toFixed(2)),
    igst: Number(totalIGST.toFixed(2)),
    totalTax: Number(totalTax.toFixed(2)),
  };

  // Determine GST type for display (CGST/SGST or IGST)
  const isInterState = totalIGST > 0;
  const gstType = isInterState ? "IGST" : "CGST/SGST";

  // Add simple tax rate indicator for frontend display purposes
  // This indicates whether the order predominantly contains 5% or 18% taxed items
  let orderTaxRate = 5; // default to 5%
  if (transformedProducts.length > 0) {
    // Count products by tax rate
    let count5Percent = 0;
    let count18Percent = 0;

    transformedProducts.forEach((p: any) => {
      if (p.taxRate === 18) {
        count18Percent++;
      } else {
        count5Percent++;
      }
    });

    // Set the predominant tax rate
    orderTaxRate = count18Percent > count5Percent ? 18 : 5;
  }

  // ✅ Calculate total GST including shipping tax
  const totalGst =
    Number(totalTax.toFixed(2)) + Number(orderData.shippingTax.toFixed(2));

  // ✅ Calculate expected delivery date based on quantity
  let expectedDeliverDate = "";
  if (totalQuantity < 5) {
    expectedDeliverDate = "7-8 working days";
  } else if (totalQuantity >= 5 && totalQuantity < 20) {
    expectedDeliverDate = "8-10 working days";
  } else if (totalQuantity >= 20 && totalQuantity < 50) {
    expectedDeliverDate = "20-25 working days";
  } else if (totalQuantity >= 50) {
    expectedDeliverDate = "Please contact our support team for timelines";
  }

  // For guest orders, populate user details from shipping address
  let userData = orderData.user || null;
  if (!userData && orderData.isGuest && orderData.shippingAddress) {
    userData = {
      id: null,
      name: orderData.shippingAddress.name,
      email: orderData.shippingAddress.email,
      mobile: orderData.shippingAddress.mobileNumber,
      companyName: null,
      gstNumber: orderData.shippingAddress.gstNumber,
    };
  }

  return {
    id: orderData.id,
    invoiceNumber: orderData.invoiceNumber,
    status: orderData.status,
    paymentStatus: orderData.paymentStatus,
    trackingId: orderData.trackingId || null,
    trackingUrl: orderData.trackingUrl || null,
    products: transformedProducts,
    subtotal: Number(orderData.subtotal).toFixed(2),
    discount: Number(orderData.discount).toFixed(2),
    // ✅ Fix: Use calculated taxTotal instead of stored value to ensure consistency with cart
    taxTotal: Number(totalTax).toFixed(2),
    // Add tax rate information for frontend display purposes
    taxRate: orderTaxRate,
    shippingBase: Number(orderData.shippingBase).toFixed(2),
    shippingTax: Number(orderData.shippingTax).toFixed(2),
    shippingTotal: Number(orderData.shippingTotal).toFixed(2),
    // ✅ Add totalGst field combining product tax and shipping tax
    totalGst: totalGst.toFixed(2),
    // ✅ Add gstType field for consistency with cart response
    gstType,
    grandTotal: Number(orderData.grandTotal),
    createdAt: orderData.createdAt,
    shippingAddress: orderData.shippingAddress || null,
    billingAddress: orderData.billingAddress || null,
    user: userData,
    orderStatusHistory: orderData.statusHistory || [],
    taxBreakdown,
    expectedDeliverDate,
  };
};

// Create Order From Cart
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // ✅ FIX: Fetch role as well to correctly assign corporate linkage
    const user = await User.findByPk(userId, {
      attributes: ["id", "role", "corporateId"],
    });

    // ✅ FIX: Determine corporateId based on role
    let corporateId = null;
    if (user?.role === "corporate") {
      corporateId = user.id;
    } else if (user?.role === "corporateUser" && user.corporateId) {
      corporateId = user.corporateId;
    } else {
      corporateId = null;
    }

    const {
      shippingAddressId,
      billingAddressId,
      paymentMode,
      paymentMethod,
      couponCode,
    } = req.body;

    // Fetch cart (include product on cartProducts)
    const cart = await Cart.findOne({
      where: { userId: userId },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
      transaction: t,
    });
    if (!cart || !cart.cartProducts?.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Addresses
    const shippingAddress = await Address.findByPk(shippingAddressId, {
      transaction: t,
    });

    let billingAddress;
    if (billingAddressId) {
      billingAddress = await Address.findByPk(billingAddressId, {
        transaction: t,
      });
    } else {
      // Prefer default business address if exists
      billingAddress = await Address.findOne({
        where: { userId, addressType: "business", isDefault: true },
        transaction: t,
      });

      // If no business address, fallback to shipping
      if (!billingAddress) {
        billingAddress = shippingAddress;
      }
    }

    if (!shippingAddress || !billingAddress)
      throw new Error("Shipping or Billing address not found");

    // Compute subtotal & total weight
    let subtotal = 0;
    let totalWeight = 0;
    let totalQuantity = 0;
    for (const cp of cart.cartProducts) {
      subtotal +=
        Number(cp.price) * Number(cp.quantity) +
        (cp.embroideryPrice || 0) * Number(cp.quantity);
      // ✅ Fix: Ensure quantity is converted to number for weight calculation
      totalWeight += (cp.weight || 0) * Number(cp.quantity);
      totalQuantity += cp.quantity;
    }

    // Determine coupon (first from request, else from cart)
    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({
        where: { code: couponCode, status: "active" },
        transaction: t,
      });
    } else if (cart.coupon) {
      // Use the included coupon if available
      coupon = cart.coupon;
    } else if (cart.couponId) {
      // Fetch coupon by ID if couponId exists but coupon wasn't included
      coupon = await Coupon.findByPk(cart.couponId, { transaction: t });
    }

    if (coupon) {
      //  Check coupon usage limit for this user
      const usage = await CouponUsage.findOne({
        where: { couponId: coupon.id, userId },
        transaction: t,
      });

      if (coupon.maxUsage && usage && usage.usedCount >= coupon.maxUsage) {
        await t.rollback();
        return res.status(400).json({ message: "Coupon usage limit reached" });
      }
    }
    const round2 = (v: number) => Math.round(v * 100) / 100;

    let discount = 0;
    let couponType: "fixed" | "percentage" | null = null;
    let couponDiscount = null;
    if (coupon && (coupon.type === "fixed" || coupon.type === "percentage")) {
      couponType = coupon.type;
      couponDiscount = coupon.discount;
      if (coupon.type === "percentage") {
        discount = round2((subtotal * coupon.discount) / 100);
      } else {
        discount = round2(Number(coupon.discount));
      }
    }

    // Tax
    let taxTotal = 0;
    for (const cp of cart.cartProducts) {
      const productTotal =
        (Number(cp.price) + (cp.embroideryPrice || 0)) * Number(cp.quantity);
      // Use state as-is (now lowercase) for calculating tax
      const normalizedState = shippingAddress.state.toLowerCase();

      // 🔹 Calculate GST for this product based on unit price
      const taxInfo = calculateTax(
        Number(cp.price),
        Number(cp.quantity),
        cp.embroideryPrice || 0,
        normalizedState,
        "delhi"
      );
      taxTotal += taxInfo.taxAmount;
    }
    taxTotal = round2(taxTotal);

    // If there's a discount, recalculate tax on discounted amount to ensure compliance
    if (discount > 0) {
      // Calculate average tax rate from original calculation
      const avgTaxRate = subtotal > 0 ? taxTotal / subtotal : 0;
      // Calculate tax on discounted subtotal
      const discountedSubtotal = subtotal - discount;
      taxTotal = round2(discountedSubtotal * avgTaxRate);
    }

    // Shipping
    // Use state as-is (now lowercase) for calculating shipping
    const normalizedState = shippingAddress.state.toLowerCase();

    // ✅ Fix: Use minimum weight for shipping calculation to match cart behavior
    const shippingInfo = await calculateShipping(
      Math.max(0.1, totalWeight),
      normalizedState
    );

    // Grand total
    const grandTotal = round2(
      subtotal - discount + taxTotal + shippingInfo.totalWithTax
    );

    // Deduct credit by quantity if paymentMethod is credit
    let creditsUsed: number | null = null;
    let creditsRemaining: number | null = null;
    if (paymentMethod === "credit") {
      try {
        const updatedCredit = await deductCredit(
          userId,
          totalQuantity,
          `Order for cart #${cart.id}`
        );
        creditsUsed = totalQuantity;
        creditsRemaining = updatedCredit.availableCredit;
      } catch (err) {
        await t.rollback();
        return res.status(400).json({ message: "Insufficient credit" });
      }
    }

    // Helper: get financial year string like "24-25"
    function getFinancialYear(): string {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      if (month < 4) {
        // Jan–Mar → previous FY
        return `${year - 1}-${String(year).slice(-2)}`;
      }
      return `${year}-${String(year + 1).slice(-2)}`;
    }

    // Generate checkout hash based on cart contents, coupon, and addresses
    const checkoutHash = generateCheckoutHash(
      cart.cartProducts,
      coupon,
      shippingAddress,
      billingAddress
    );

    // Check if there's an existing pending unpaid order with the same checkoutHash
    let existingOrder = await Order.findOne({
      where: {
        userId: userId,
        paymentStatus: "pending",
        status: "pending", // Only consider truly pending orders (not cancelled/failed)
        checkoutHash: checkoutHash,
      },
      transaction: t,
    });

    let order;
    if (existingOrder) {
      // Reuse existing order with same checkoutHash
      order = existingOrder;
    } else {
      // Check for any other unpaid orders for this user that don't match the current checkoutHash
      const otherPendingOrders = await Order.findAll({
        where: {
          userId: userId,
          paymentStatus: {
            [Op.not]: "paid",
          },
          status: "pending",
        },
        transaction: t,
      });

      // Mark other pending orders as 'trash' since they're no longer valid
      for (const pendingOrder of otherPendingOrders) {
        if (pendingOrder.checkoutHash !== checkoutHash) {
          pendingOrder.status = "trash";
          pendingOrder.paymentStatus = "expired";
          await pendingOrder.save({ transaction: t });
        }
      }

      // Create new order
      order = await Order.create(
        {
          userId: userId,
          corporateId,
          subtotal,
          discount,
          taxTotal,
          shippingBase: shippingInfo.finalAmount,
          shippingTax: shippingInfo.taxAmount,
          shippingTotal: shippingInfo.totalWithTax,
          grandTotal,
          couponCode: coupon ? coupon.code : null,
          couponType: couponType,
          couponDiscount: couponDiscount,
          paymentMode,
          paymentMethod,
          paymentStatus: paymentMethod === "credit" ? "complete" : "pending",
          status: "pending",
          checkoutHash: checkoutHash,
        },
        { transaction: t }
      );
    }

    // Generate invoice number only for new orders (not reused)
    if (!existingOrder) {
      const paddedId = String(order.id).padStart(5, "0");
      order.invoiceNumber = paddedId;
      await order.save({ transaction: t });
    }

    // Log initial status in history only for new orders (not reused)
    if (!existingOrder) {
      await OrderStatusHistory.create(
        {
          orderId: order.id,
          status: "pending",
          note: "Order placed",
          changedBy: req.user?.id ?? null,
        },
        { transaction: t }
      );
    } else {
      // Update the existing order's status to pending if it was changed
      if (order.status !== "pending") {
        order.status = "pending";
        await order.save({ transaction: t });
      }
    }

    // If reusing an existing order, clear the existing order products and addresses first
    if (existingOrder) {
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
    }

    // Copy cartProducts -> orderProducts and persist basePrice + bulk data
    for (const cp of cart.cartProducts) {
      const product = await Product.findByPk(cp.productId, { transaction: t });

      if (!product) {
        await t.rollback();
        return res
          .status(404)
          .json({ message: `Product ${cp.productId} not found` });
      }
      if (product.outOfStock) {
        await t.rollback();
        return res.status(400).json({
          message: `Product "${product.title}" is currently out of stock and cannot be ordered`,
        });
      }

      await product.save({ transaction: t });
      await OrderProduct.create(
        {
          order_id: order.id,
          productId: cp.productId,
          product_name: cp.productName!,
          sku: cp.sku,
          hsn: cp.hsn,
          quantity: cp.quantity,
          weight: cp.weight,
          price: cp.price,
          majorFabric: product.majorFabric,
          minorFabric: product.minorFabric,
          pattenNumber: product.pattenNumber,
          embroidery: cp.embroidery,
          embroideryLogo: cp.embroideryLogo,
          embroideryPosition: cp.embroideryPosition,
          embroideryPrice: cp.embroideryPrice,
          sizes: cp.sizes,
          productImage: cp.productImage,
          lineTotal: round2(
            Number(cp.price) * Number(cp.quantity) +
            (cp.embroideryPrice || 0) * Number(cp.quantity)
          ),
        },
        { transaction: t }
      );
    }

    // Save shipping address snapshot
    await OrderShippingAddress.create(
      {
        order_id: order.id,
        name: shippingAddress.name,
        email: shippingAddress.email || req.user?.email || null,
        companyName: shippingAddress.companyName,
        mobileNumber: shippingAddress.mobileNumber,
        pinCode: shippingAddress.pinCode,
        address: shippingAddress.address,
        locality: shippingAddress.locality,
        city: shippingAddress.city,
        state: shippingAddress.state,
        gstNumber: shippingAddress.gstNumber ?? null,
      },
      { transaction: t }
    );

    // Save billing address snapshot
    await OrderBillingAddress.create(
      {
        order_id: order.id,
        name: billingAddress.name,
        email: billingAddress.email || req.user?.email || null,
        companyName: billingAddress.companyName,
        mobileNumber: billingAddress.mobileNumber,
        pinCode: billingAddress.pinCode,
        address: billingAddress.address,
        locality: billingAddress.locality,
        city: billingAddress.city,
        state: billingAddress.state,
        gstNumber: billingAddress.gstNumber ?? null,
      },
      { transaction: t }
    );

    await t.commit();

    // Mark coupon used after commit (if needed) — do this outside transaction to avoid cycles:
    if (coupon) {
      await markCouponUsed(coupon.id, userId);
    }

    // Fetch full order and format
    const fullOrder = await Order.findByPk(order.id, {
      include: [
        { model: OrderProduct, as: "orderProducts" },
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
      ],
    });
    const allSizeIds =
      fullOrder?.orderProducts?.flatMap((p: any) =>
        Object.keys(p.sizes || {}).map((id) => Number(id))
      ) || [];
    const validOptions = allSizeIds.length
      ? await Option.findAll({
        where: { id: allSizeIds, optionType: "size", status: "active" },
      })
      : [];
    const formattedOrder = await formatOrderResponse(fullOrder, validOptions);

    return res.status(201).json({
      success: true,
      order: formattedOrder,
      creditsUsed,
      creditsRemaining,
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// Get all orders for user
// export const getOrders = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const user = req.user;
//     if (!user) return res.status(401).json({ message: "Unauthorized" });

//     const { status, startDate, endDate } = req.query;
//     const where: any = {};

//     // ✅ For corporate: include all orders made by their users
//     if (user.role === "corporate") {
//       // Find all user IDs under this corporate
//       const corporateUsers = await User.findAll({
//         where: { corporateId: user.id },
//         attributes: ["id"],
//       });

//       const corporateUserIds = corporateUsers.map((u) => u.id);

//       // Include corporate’s own orders + all users under them
//       where.userId = { [Op.in]: [user.id, ...corporateUserIds] };
//     }
//     // ✅ For normal users (including corporateUser)
//     else {
//       where.userId = user.id;
//     }

//     if (status) where.status = status;

//     // ✅ Optional date filters
//     if (startDate && endDate) {
//       const start = new Date(startDate as string);
//       start.setHours(0, 0, 0, 0);
//       const end = new Date(endDate as string);
//       end.setHours(23, 59, 59, 999);
//       where.createdAt = { [Op.between]: [start, end] };
//     }

//     // ✅ Fetch orders + product + status history
//     const orders = await Order.findAll({
//       where,
//       include: [
//         {
//           model: OrderProduct,
//           as: "orderProducts",
//           attributes: ["product_name", "price", "quantity", "productImage"],
//         },
//         {
//           model: OrderStatusHistory,
//           as: "statusHistory",
//           attributes: ["status", "createdAt"],
//         },
//       ],
//       order: [["createdAt", "DESC"]],
//       attributes: ["id", "invoiceNumber", "status", "createdAt", "grandTotal"],
//     });

//     // ✅ Format simplified response
//     const formatted = orders.map((order: any) => {
//       const firstProduct = order.orderProducts?.[0];
//       const deliveredRecord = order.statusHistory?.find(
//         (s: any) => s.status?.toLowerCase() === "delivered"
//       );

//       return {
//         id: order.id,
//         invoiceNumber: order.invoiceNumber,
//         transactionId: "",
//         status: order.status,
//         orderDate: order.createdAt,
//         deliveredDate: deliveredRecord?.createdAt || null,
//         productName: firstProduct?.product_name || null,
//         productPrice: firstProduct
//           ? Number(firstProduct.price).toFixed(2)
//           : null,
//         totalPrice: Number(order.grandTotal).toFixed(2),
//         productImage: getFileUrl(
//           firstProduct?.productImage,
//           "products/featured-image"
//         ),
//       };
//     });

//     return res.json({
//       success: true,
//       count: formatted.length,
//       data: formatted,
//     });
//   } catch (err) {
//     next(err);
//   }
// };

export const getOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const { status, startDate, endDate } = req.query;
    const where: any = {};

    // ✅ For corporate: include all orders made by their users
    if (user.role === "corporate") {
      // Find all user IDs under this corporate
      const corporateUsers = await User.findAll({
        where: { corporateId: user.id },
        attributes: ["id"],
      });

      const corporateUserIds = corporateUsers.map((u) => u.id);

      // Include corporate’s own orders + all users under them
      where.userId = { [Op.in]: [user.id, ...corporateUserIds] };
    }
    // ✅ For normal users (including corporateUser)
    else {
      where.userId = user.id;
    }

    // ✅ Exclude orders with status "trash"
    where.status = { [Op.notILike]: "trash" };

    if (status) {
      // If a specific status is provided, override to match that status (which won't be trash)
      where.status = { [Op.iLike]: status.toString().toLowerCase() };
    }

    // ✅ Optional date filters
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { [Op.between]: [start, end] };
    }

    // ✅ Fetch orders + product + status history + payment
    const orders = await Order.findAll({
      where,
      include: [
        {
          model: OrderProduct,
          as: "orderProducts",
          attributes: ["product_name", "price", "quantity", "productImage"],
        },
        {
          model: OrderStatusHistory,
          as: "statusHistory",
          attributes: ["status", "createdAt"],
        },
        {
          model: Payment,
          as: "payment",
          attributes: ["trackingId"],
        },
      ],
      order: [["createdAt", "DESC"]],
      attributes: ["id", "invoiceNumber", "status", "createdAt", "grandTotal"],
    });

    // ✅ Format simplified response
    const formatted = orders.map((order: any) => {
      // Get all products in the order
      const products = order.orderProducts || [];

      // Calculate total items and create product summary
      const totalItems = products.reduce(
        (sum: number, product: any) => sum + (product.quantity || 0),
        0
      );

      // For the main product display, use the first product or create a summary
      const firstProduct = products[0];

      const deliveredRecord = order.statusHistory?.find(
        (s: any) => s.status?.toLowerCase() === "delivered"
      );

      return {
        id: order.id,
        invoiceNumber: order.invoiceNumber,
        transactionId: order.payment?.trackingId || order.id,
        status: order.status,
        orderDate: order.createdAt,
        deliveredDate: deliveredRecord?.createdAt || null,
        productName:
          products.length > 1
            ? `${products.length} items in order`
            : firstProduct?.product_name || null,
        productPrice: firstProduct
          ? Number(firstProduct.price).toFixed(2)
          : null,
        productQuantity: totalItems,
        totalPrice: Number(order.grandTotal).toFixed(2),
        productImage: getFileUrl(
          firstProduct?.productImage,
          "products/featured-image"
        ),
        estimatedDeliveryDate:
          totalItems < 5
            ? "7-8 working days"
            : totalItems >= 5 && totalItems < 20
              ? "8-10 working days"
              : totalItems >= 20 && totalItems < 50
                ? "12-15 working days"
                : "Please contact our support team for timelines",
      };
    });

    return res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
};

// Get all orders admin
export const listAllOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const { status, startDate, endDate, search, corporateId } = req.query;

    // ✅ Permission check BEFORE running any DB queries
    const rolePerm = await RoleBasePermission.findOne({
      where: { role: req.user?.role },
    });

    if (req.query.corporateId) {
      // Corporate orders
      if (
        !rolePerm ||
        !Array.isArray(rolePerm.permissions) ||
        !rolePerm.permissions.includes("view_corporate_orders")
      ) {
        return res.status(403).json({
          message: "You don't have permission to view corporate orders",
        });
      }
    } else {
      // Normal (all) orders
      if (
        !rolePerm ||
        !Array.isArray(rolePerm.permissions) ||
        !rolePerm.permissions.includes("view_all_orders")
      ) {
        return res
          .status(403)
          .json({ message: "You don't have permission to view normal orders" });
      }
    }

    // ✅ From here onward, user is allowed to fetch data
    const where: Record<string | symbol, any> = {};

    // Filter by order status
    if (status) where.status = { [Op.iLike]: status.toString().toLowerCase() };

    // Filter by date range
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

    // ✅ By default, only show normal orders (where corporateId is null)
    // unless corporateId is explicitly provided in the query
    if (!corporateId) {
      where.corporateId = null;
    }

    // Build User include
    const userInclude: any = {
      model: User,
      as: "user",
      attributes: [
        "id",
        "name",
        "image",
        "email",
        "mobile",
        "corporateId",
        "companyName",
      ],
      required: false,
    };

    // Unified search
    if (search) {
      const likeSearch = { [Op.iLike]: `%${search}%` };
      where[Op.or] = [
        { id: !isNaN(Number(search)) ? Number(search) : null },
        { invoiceNumber: likeSearch },
        { status: likeSearch },
        { "$user.name$": likeSearch },
        { "$user.email$": likeSearch },
        { "$user.mobile$": likeSearch },
        { "$user.company_name$": likeSearch },
      ];
    }

    if (corporateId) {
      userInclude.where = {
        ...userInclude.where,
        corporateId: Number(corporateId),
      };
      userInclude.required = true;
    }

    const include: any[] = [
      userInclude,
      {
        model: OrderShippingAddress,
        as: "shippingAddress",
        attributes: [
          "id",
          "address",
          "city",
          "state",
          "pinCode",
          "name",
          "email",
          "mobileNumber",
        ],
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
      attributes: [
        "id",
        "invoiceNumber",
        "grandTotal",
        "status",
        "paymentMethod",
        "createdAt",
        "corporateId",
        "isGuest",
      ],
    });

    const statusCounts = await Order.findAll({
      where,
      include: [
        {
          ...userInclude,
          attributes: [],
        },
      ],
      attributes: ["status", [fn("COUNT", col("Order.id")), "count"]],
      group: ["Order.status"],
      raw: true,
    });

    const statusSummary = statusCounts.reduce((acc: any, row: any) => {
      acc[row.status] = Number(row.count);
      return acc;
    }, {});

    // Format response
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
        : order.isGuest && order.shippingAddress
          ? {
            id: null,
            name: order.shippingAddress.name,
            email: order.shippingAddress.email,
            mobile: order.shippingAddress.mobileNumber,
            corporateId: null,
            image: null,
          }
          : null,
      shippingAddress: order.shippingAddress || null,
    }));

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      statusSummary,
      data: formattedOrders,
    });
  } catch (err) {
    next(err);
  }
};

// Get orders for the logged-in corporate user only
export const listCorporateOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // --- Basic role guard: endpoint reserved for corporate users only
    if (req.user?.role !== "corporate") {
      return res
        .status(403)
        .json({ message: "This endpoint is for corporate users only." });
    }

    // Ensure corporateId exists on user (safety)
    const userCorporateId = req.query.corporateId;
    if (!userCorporateId) {
      return res.status(400).json({ message: "Corporate ID missing on user." });
    }

    // Pagination
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    // Filters
    const { status, startDate, endDate, search } = req.query;

    // Build where clause
    const where: Record<string | symbol, any> = {
      status: {
        [Op.in]: ["process", "shipped", "delivered"],
      },
    };

    // Date range filters (same logic as /all)
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

    // Build user include — FORCE corporateId to logged-in user's corporateId
    const userInclude: any = {
      model: User,
      as: "user",
      attributes: [
        "id",
        "name",
        "image",
        "email",
        "mobile",
        "corporateId",
        "companyName",
      ],
      required: true, // required so only orders with a user (and thereby corporateId) are returned
      where: {
        corporateId: userCorporateId,
      },
    };

    // Unified search across order fields + user fields
    if (search) {
      const likeSearch = { [Op.iLike]: `%${search}%` };
      where[Op.or] = [
        { id: !isNaN(Number(search)) ? Number(search) : null },
        { invoiceNumber: likeSearch },
        { status: likeSearch },
        { "$user.name$": likeSearch },
        { "$user.email$": likeSearch },
        { "$user.mobile$": likeSearch },
        { "$user.company_name$": likeSearch },
      ];
    }

    // Include shippingAddress and payment
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
      attributes: [
        "id",
        "invoiceNumber",
        "grandTotal",
        "status",
        "paymentMethod",
        "createdAt",
      ],
    });

    const statusCounts = await Order.findAll({
      where,
      include: [
        {
          ...userInclude,
          attributes: [],
        },
      ],
      attributes: ["status", [fn("COUNT", col("Order.id")), "count"]],
      group: ["Order.status"],
      raw: true,
    });

    const statusSummary = statusCounts.reduce((acc: any, row: any) => {
      acc[row.status] = Number(row.count);
      return acc;
    }, {});

    // Format response
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
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      statusSummary,
      data: formattedOrders,
    });
  } catch (err) {
    next(err);
  }
};

//Get order details Admin
export const getOrderDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const loggedUser = req.user!;
    if (!loggedUser) return res.status(401).json({ message: "Unauthorized" });
    const { orderId } = req.params;
    const where: any = { id: orderId };

    const order = await Order.findOne({
      where,
      include: [
        { model: OrderProduct, as: "orderProducts" },
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
        {
          model: OrderStatusHistory,
          as: "statusHistory",
          include: [
            {
              model: User,
              as: "changedByUser",
              attributes: ["id", "name", "email", "role"],
            },
          ],
        },
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "name",
            "email",
            "mobile",
            "companyName",
            "gstNumber",
          ],
        },
      ],
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    const allSizeIds =
      order.orderProducts?.flatMap((p: any) =>
        Object.keys(p.sizes || {}).map((id) => Number(id))
      ) || [];

    const validOptions = await Option.findAll({
      where: { id: allSizeIds, optionType: "size", status: "active" },
    });

    const formattedOrder = await formatOrderResponse(order, validOptions);

    return res.json({ success: true, order: formattedOrder });
  } catch (err) {
    next(err);
  }
};

export const getUserOrderDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user!;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const { orderId } = req.params;
    const where: any = { id: orderId };

    // If logged-in user is normal → only their own orders
    if (user.role !== "corporate") {
      where.userId = user.id;
    } else {
      // Corporate → orders by themselves or their corporate users
      const corporateUserIds = await User.findAll({
        where: { corporateId: user.id },
        attributes: ["id"],
      });

      const ids = corporateUserIds.map((u) => u.id);
      ids.push(user.id); // include corporate's own orders

      where.userId = { [Op.in]: ids };
    }

    // ✅ Fetch order only if belongs to this user

    const order = await Order.findOne({
      where,
      include: [
        { model: OrderProduct, as: "orderProducts" },
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
        {
          model: OrderStatusHistory,
          as: "statusHistory",
          include: [
            {
              model: User,
              as: "changedByUser",
              attributes: ["id", "name", "email", "role"],
            },
          ],
        },
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "name",
            "email",
            "mobile",
            "companyName",
            "gstNumber",
          ],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // ✅ Extract all size IDs from order products
    const allSizeIds =
      order.orderProducts?.flatMap((p: any) =>
        Object.keys(p.sizes || {}).map((id) => Number(id))
      ) || [];

    // ✅ Get valid size options (for human-readable size names)
    const validOptions = await Option.findAll({
      where: { id: allSizeIds, optionType: "size", status: "active" },
    });

    // ✅ Format the order using same helper as admin
    const formattedOrder = await formatOrderResponse(order, validOptions);

    return res.status(200).json({ success: true, order: formattedOrder });
  } catch (err) {
    next(err);
  }
};

// Update order status
// export const updateOrderStatus = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   const t = await db.sequelize.transaction();
//   try {
//     const { orderId } = req.params;
//     const {
//       status,
//       paymentStatus,
//       trackingId,
//       shiprocketId,
//       note,
//       shippingAddress,
//       billingAddress,
//     } = req.body;

//     const order = await Order.findByPk(orderId, { transaction: t });
//     if (!order) return res.status(404).json({ message: "Order not found" });

//     const oldStatus = order.status;
//     const userId = req.user?.id;

//     // --- Update current order fields ---
//     if (status) order.status = status;
//     if (paymentStatus) order.paymentStatus = paymentStatus;
//     if (trackingId) order.trackingId = trackingId;
//     if (shiprocketId) order.shiprocketId = shiprocketId;

//     await order.save({ transaction: t });

//     // --- Log status change + queue email ---
//     let user: any = null;
//     if (status && status !== oldStatus) {
//       await OrderStatusHistory.create(
//         {
//           orderId: order.id,
//           status,
//           note: note || `Status changed from ${oldStatus} → ${status}`,
//           changedBy: userId ?? null,
//         },
//         { transaction: t }
//       );

//       // We'll send email *after* committing the transaction
//       if (order.userId) {
//         user = await User.findByPk(order.userId, {
//           attributes: ["id", "email", "name"],
//         });
//       }
//     }

//     // --- Update Shipping Address (if provided) ---
//     if (shippingAddress) {
//       const shipping = await OrderShippingAddress.findOne({
//         where: { order_id: order.id },
//         transaction: t,
//       });
//       if (shipping) await shipping.update(shippingAddress, { transaction: t });
//     }

//     // --- Update Billing Address (if provided) ---
//     if (billingAddress) {
//       const billing = await OrderBillingAddress.findOne({
//         where: { order_id: order.id },
//         transaction: t,
//       });
//       if (billing) await billing.update(billingAddress, { transaction: t });
//     }

//     // --- Send email AFTER commit (non-blocking) ---
//     if (status && status !== oldStatus) {
//       let emailTo = user?.email;

//       // Fallback for guest orders
//       if (!emailTo) {
//         emailTo = order.guestEmail || order.shippingAddress?.email || null;
//       }

//       if (emailTo) {
//         // 🧩 Re-fetch full order details for email
//         const fullOrder: any = await Order.findByPk(order.id, {
//           include: [
//             { model: OrderShippingAddress, as: "shippingAddress" },
//             { model: OrderBillingAddress, as: "billingAddress" },
//             { model: OrderProduct, as: "orderProducts" },
//           ],
//         });

//         if (fullOrder) {
//           const plainOrder = fullOrder.toJSON();
//           plainOrder.products = plainOrder.orderProducts; // ensure email fn works
//           sendOrderStatusEmail(emailTo, plainOrder, status).catch((err) =>
//             console.error("Email send failed:", err)
//           );
//         }
//       }
//     }

//     return res.json({ success: true, order });
//   } catch (err) {
//     await t.rollback();
//     next(err);
//   }
// };
export const updateOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const { orderId } = req.params;
    const {
      status,
      paymentStatus,
      trackingId,
      trackingUrl,
      shiprocketId,
      note,
      shippingAddress,
      billingAddress,
    } = req.body;

    const order = await Order.findByPk(orderId, { transaction: t });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const oldStatus = order.status;
    const oldPaymentStatus = order.paymentStatus;
    const userId = req.user?.id;

    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (trackingId) order.trackingId = trackingId;
    if (trackingUrl) order.trackingUrl = trackingUrl;
    if (shiprocketId) order.shiprocketId = shiprocketId;

    // Check if status is changing from pending to processing - if so, ensure payment status is updated to paid
    if (
      oldStatus === "pending" &&
      status === "process" &&
      order.paymentStatus !== "paid"
    ) {
      order.paymentStatus = "paid";
    }

    await order.save({ transaction: t });

    // Log status history
    if (status && status !== oldStatus) {
      await OrderStatusHistory.create(
        {
          orderId: order.id,
          status,
          note: note || `Status changed from ${oldStatus} → ${status}`,
          changedBy: userId ?? null,
        },
        { transaction: t }
      );
    }

    // Update addresses
    if (shippingAddress) {
      const shipping = await OrderShippingAddress.findOne({
        where: { order_id: order.id }, // ✅ correct key
        transaction: t,
      });
      if (shipping) await shipping.update(shippingAddress, { transaction: t });
    }

    if (billingAddress) {
      const billing = await OrderBillingAddress.findOne({
        where: { order_id: order.id }, // ✅ correct key
        transaction: t,
      });
      if (billing) await billing.update(billingAddress, { transaction: t });
    }

    await t.commit(); // ✅ COMMIT before sending response

    // Send email (non-blocking, outside transaction)
    if (status && status !== oldStatus) {
      // Check if status is one where we don't want to send emails
      const noEmailStatuses = [
        "process",
        "onHold",
        "refund",
        "cancelled",
        "trash",
      ];
      if (!noEmailStatuses.includes(status)) {
        const user = order.userId
          ? await User.findByPk(order.userId, {
            attributes: ["id", "email", "name"],
          })
          : null;

        let emailTo =
          user?.email || order.guestEmail || order.shippingAddress?.email;
        if (emailTo) {
          const fullOrder = await Order.findByPk(order.id, {
            include: [
              { model: OrderShippingAddress, as: "shippingAddress" },
              { model: OrderBillingAddress, as: "billingAddress" },
              { model: OrderProduct, as: "orderProducts" },
            ],
          });

          if (fullOrder) {
            const plainOrder: any = fullOrder.toJSON();
            // plainOrder.products = plainOrder.orderProducts;
            sendOrderStatusEmail(emailTo, plainOrder, status).catch((err) =>
              console.error("Email send failed:", err)
            );
          }
        }
      }
    }

    // Send order confirmation emails if payment status changed to 'paid'
    // This handles the case where admin manually updates status from pending to processing
    if (order.paymentStatus === "paid" && oldPaymentStatus !== "paid") {
      try {
        const fullOrder = await Order.findByPk(order.id, {
          include: [
            { model: OrderProduct, as: "orderProducts" },
            { model: OrderShippingAddress, as: "shippingAddress" },
            { model: OrderBillingAddress, as: "billingAddress" },
          ],
        });

        const email =
          (fullOrder as any)?.shippingAddress?.email ||
          (order as any)?.guestEmail ||
          (order as any)?.user?.email;

        if (email && email.includes("@")) {
          await sendOrderPlacedEmail(email, fullOrder);
          console.log(`📧 Order confirmation email sent to: ${email}`);
        }

        try {
          await sendOrderReceiverNotification(fullOrder);
          console.log(`📧 Order confirmation email sent to ORDER_RECEIVER`);
        } catch (err) {
          console.warn(
            "⚠️ Failed to send order confirmation email to ORDER_RECEIVER:",
            err
          );
        }
      } catch (err) {
        console.warn("⚠️ Failed to send order confirmation email:", err);
      }
    }

    return res.json({ success: true, order });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

export const cancelOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { orderId } = req.params;
    const order = await Order.findOne({
      where: { id: orderId, userId: userId },
      transaction: t,
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!["pending", "confirmed"].includes(order.status)) {
      return res
        .status(400)
        .json({ message: "Order cannot be cancelled at this stage" });
    }

    order.status = "cancelled";
    await order.save({ transaction: t });
    await t.commit();

    return res.json({ success: true, order });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

export const generateInvoice = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    // ✅ helper (must exist BEFORE use)

    const round2 = (v: number) => Math.round(v * 100) / 100;

    // 1️⃣ Fetch Order with Relations
    const order: any = await Order.findOne({
      where: { id: orderId },
      include: [
        { model: OrderProduct, as: "orderProducts" },
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "name",
            "email",
            "mobile",
            "companyName",
            "gstNumber",
          ],
        },
      ],
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    const products = order.orderProducts || [];
    const shipping = order.shippingAddress || {};
    const billing = order.billingAddress || {};

    const buyerState = shipping.state;
    const sellerState = "delhi"; // warehouse state
    const sameState = buyerState === sellerState;

    // 2️⃣ Load size names
    const sizeOptions = await Option.findAll({
      where: { optionType: "size" },
      raw: true,
    });
    const sizeMap: Record<string, string> = {};
    sizeOptions.forEach((s: any) => (sizeMap[s.id] = s.name));

    // 3️⃣ Compute totals and taxes
    let embroideryTotal = 0;
    let taxableSum = 0,
      cgstSum = 0,
      sgstSum = 0,
      igstSum = 0,
      totalWithTaxSum = 0;

    const taxRows: any[] = [];
    let baseProductTotal = 0;

    // Calculate original tax values first
    let originalTaxTotal = 0;
    const originalProductTaxes: any[] = [];
    const originalProductTaxableValues: number[] = [];

    products.forEach((p: any) => {
      const taxableValue = (p.price + (p.embroideryPrice || 0)) * p.quantity;
      embroideryTotal += (p.embroideryPrice || 0) * p.quantity;
      baseProductTotal += p.price * p.quantity;

      const taxInfo = calculateTax(
        p.price,
        p.quantity,
        p.embroideryPrice || 0,
        buyerState,
        sellerState
      );

      originalTaxTotal += taxInfo.taxAmount || 0;
      originalProductTaxes.push({
        taxAmount: taxInfo.taxAmount || 0,
        cgst: taxInfo.cgst || 0,
        sgst: taxInfo.sgst || 0,
        igst: taxInfo.igst || 0,
        total: taxInfo.total || 0,
      });
      originalProductTaxableValues.push(taxableValue);

      taxableSum += taxableValue;
      cgstSum += taxInfo.cgst || 0;
      sgstSum += taxInfo.sgst || 0;
      igstSum += taxInfo.igst || 0;
      totalWithTaxSum += taxInfo.total;

      taxRows.push({
        hsn: p.hsn || "-",
        category: taxInfo.taxRate === 5 ? "5% Category" : "18% Category",
        taxable: taxableValue.toFixed(2),
        rate: `${taxInfo.taxRate}%`,
        cgst: taxInfo.cgst?.toFixed(2) || "0.00",
        sgst: taxInfo.sgst?.toFixed(2) || "0.00",
        igst: taxInfo.igst?.toFixed(2) || "0.00",
        totalWithTax: taxInfo.total.toFixed(2),
      });
    });

    // If there's a discount, recalculate tax on discounted amount to ensure compliance
    // Use the same logic as in order creation and cart calculation
    if (order.discount > 0) {
      // Calculate average tax rate from original calculation
      const avgTaxRate =
        order.subtotal > 0 ? originalTaxTotal / order.subtotal : 0;
      // Calculate tax on discounted subtotal
      const discountedSubtotal = order.subtotal - order.discount;
      const newTaxTotal = round2(discountedSubtotal * avgTaxRate);

      // Distribute the new tax total proportionally across products
      if (originalTaxTotal > 0) {
        const taxRatio = newTaxTotal / originalTaxTotal;

        // Reset the sums
        cgstSum = 0;
        sgstSum = 0;
        igstSum = 0;
        totalWithTaxSum = 0;
        taxableSum = 0; // Reset taxable sum as well

        // Adjust each product's tax values proportionally
        originalProductTaxes.forEach((origTax, index) => {
          const adjustedTaxAmount = round2(origTax.taxAmount * taxRatio);
          const adjustedCgst = round2(origTax.cgst * taxRatio);
          const adjustedSgst = round2(origTax.sgst * taxRatio);
          const adjustedIgst = round2(origTax.igst * taxRatio);
          const adjustedTotal = round2(origTax.total * taxRatio);
          // Also adjust the taxable value
          const adjustedTaxable = round2(
            (originalProductTaxableValues[index] as number) * taxRatio
          );

          // Update the tax rows with adjusted values
          taxRows[index].cgst = adjustedCgst.toFixed(2);
          taxRows[index].sgst = adjustedSgst.toFixed(2);
          taxRows[index].igst = adjustedIgst.toFixed(2);
          taxRows[index].taxable = adjustedTaxable.toFixed(2); // Update taxable value
          taxRows[index].totalWithTax = adjustedTotal.toFixed(2); // Update total with tax

          // Update the sums
          cgstSum += adjustedCgst;
          sgstSum += adjustedSgst;
          igstSum += adjustedIgst;
          totalWithTaxSum += adjustedTotal;
          taxableSum += adjustedTaxable; // Update taxable sum
        });
      }
    }

    // ✅ FREEZE PRODUCT GST (before shipping GST is added)
    const productGstOnly = round2(sameState ? cgstSum + sgstSum : igstSum);

    // 4️⃣ Build Product Rows
    const itemsHtml = products
      .map((p: any, idx: number) => {
        // Product image URL
        const productImageUrl = p.productImage
          ? getFileUrl(p.productImage, "products/featured-image")
          : null;

        return `
          <tr>
            <td>${idx + 1}</td>
            <td>
              ${productImageUrl
            ? `<img src="${productImageUrl}" alt="Product" class="product-image"/>`
            : "-"
          }
            </td>
            <td>
              <div class="item-description">
                <strong>${p.product_name}</strong>
                <div class="item-details">
                  Sizes: ${p.sizes
            ? Object.entries(p.sizes)
              .map(
                ([s, q]: [string, any]) => `${sizeMap[s] || s}:${q}`
              )
              .join(", ")
            : "-"
          }<br/>
                  SKU: ${p.sku || "-"}<br/>
                  HSN: ${p.hsn || "-"}<br/>
                  Embroidery: ${p.embroidery ? "Yes" : "No"}
                </div>
              </div>
            </td>
            <td>${p.quantity}</td>
            <td>₹${p.price.toFixed(2)}</td>
            <td>₹${(p.embroideryPrice || 0).toFixed(2)}</td>
            <td>${taxRows[idx].rate}</td>
            <td>₹${Number(
            taxRows[idx]?.totalWithTax ?? p.lineTotal ?? 0
          ).toFixed(2)}</td>
          </tr>`;
      })
      .join("");

    // 5️⃣ Summary Tax Rows
    const taxSummaryRow = sameState
      ? `
        <div class="summary-line"><span>CGST</span><span>₹${cgstSum.toFixed(
        2
      )}</span></div>
        <div class="summary-line"><span>SGST</span><span>₹${sgstSum.toFixed(
        2
      )}</span></div>`
      : `<div class="summary-line"><span>IGST</span><span>₹${igstSum.toFixed(
        2
      )}</span></div>`;

    // 6️⃣ Tax Table Headers
    const taxHeadersHtml = sameState
      ? `<th colspan="2" class="text-center">GST</th>`
      : `<th colspan="2" class="text-center">IGST</th>`;

    const taxSubHeadersHtml = sameState
      ? `<tr><th>CGST</th><th>SGST</th></tr>`
      : `<tr><th>Rate</th><th>Amount</th></tr>`;

    // ✅ Include shipping values in tax totals (so tax table matches order summary)
    if (order.shippingTotal && order.shippingTotal > 0) {
      const shippingBase = order.shippingBase || order.shippingTotal / 1.18;
      const shippingTax =
        order.shippingTax || order.shippingTotal - shippingBase;

      taxableSum += shippingBase;
      totalWithTaxSum += order.shippingTotal;

      if (sameState) {
        const halfTax = shippingTax / 2;
        cgstSum += halfTax;
        sgstSum += halfTax;
      } else {
        igstSum += shippingTax;
      }
    }

    const taxTotalsHtml = sameState
      ? `<td><strong>₹${cgstSum.toFixed(
        2
      )}</strong></td><td><strong>₹${sgstSum.toFixed(2)}</strong></td>`
      : `<td><strong>₹${igstSum.toFixed(2)}</strong></td>`;

    let taxRowsHtml = taxRows
      .map((r: any) => {
        return sameState
          ? `<tr><td>${r.hsn}</td><td>${r.category}</td><td>₹${r.taxable}</td><td>₹${r.cgst}</td><td>₹${r.sgst}</td><td>₹${r.totalWithTax}</td></tr>`
          : `<tr><td>${r.hsn}</td><td>${r.category}</td><td>₹${r.taxable}</td><td>${r.rate}</td><td>₹${r.igst}</td><td>₹${r.totalWithTax}</td></tr>`;
      })
      .join("");
    // ✅ Add Shipping as a new row in tax table
    if (order.shippingTotal && order.shippingTotal > 0) {
      const shippingBase = order.shippingBase || order.shippingTotal / 1.18; // fallback if not stored
      const shippingTax =
        order.shippingTax || order.shippingTotal - shippingBase;
      const rate = 18; // adjust if your shipping GST rate differs

      const shippingRow = sameState
        ? `<tr>
        <td>9965</td>
        <td>18% Shipping</td>
        <td>₹${shippingBase.toFixed(2)}</td>
        <td>₹${(shippingTax / 2).toFixed(2)}</td>
        <td>₹${(shippingTax / 2).toFixed(2)}</td>
        <td>₹${order.shippingTotal.toFixed(2)}</td>
      </tr>`
        : `<tr>
        <td>9965</td>
        <td>18% Shipping</td>
        <td>₹${shippingBase.toFixed(2)}</td>
        <td>${rate}%</td>
        <td>₹${shippingTax.toFixed(2)}</td>
        <td>₹${order.shippingTotal.toFixed(2)}</td>
      </tr>`;

      // Append shipping row to the tax table HTML
      taxRowsHtml += shippingRow;
    }

    // ✅ CLEAN + CORRECT SUMMARY CALC (NO MRP / NO BULK DISCOUNT)

    const productSubTotal = round2(order.subtotal - embroideryTotal);

    // Product GST
    const productGstAmount = productGstOnly;

    // Shipping + shipping GST
    let shippingTax = 0;
    if (order.shippingTotal > 0) {
      shippingTax =
        order.shippingTax ??
        round2(order.shippingTotal - order.shippingTotal / 1.18);
    }

    const shippingTaxDisplay = `₹${shippingTax.toFixed(2)}`;

    const shippingBase = round2(order.shippingBase || 0);

    const gstTypeLabel = sameState ? "CGST / SGST (Product)" : "IGST (Product)";

    // Total GST = product GST + shipping GST
    const totalGstForDisplay = round2(productGstAmount + shippingTax);

    // Display helpers
    const displayFields = {
      productSubTotal: `₹${productSubTotal.toFixed(2)}`,
      gstTypeLabel,
      productGstAmountDisplay: `₹${productGstAmount.toFixed(2)}`,
      shippingBaseDisplay: `₹${shippingBase.toFixed(2)}`,
      shippingTaxDisplay,
      totalGstDisplay: `₹${totalGstForDisplay.toFixed(2)}`,
      payableDisplay: `₹${order.grandTotal.toFixed(2)}`,
      embroideryDisplay: `₹${embroideryTotal.toFixed(2)}`,
    };
    // ---------------- end add/replace -------------------------------------------------

    const couponDiscount = round2(order.discount || order.couponDiscount || 0);
    const couponDiscountDisplay = `₹${couponDiscount.toFixed(2)}`;

    // 7️⃣ Render Template with EJS
    const templatePath = path.join(__dirname, "../templates/invoice.ejs");
    const html = await ejs.renderFile(templatePath, {
      billingName: billing.name || "",
      billingAddress: `${billing.address}, ${billing.city}, ${billing.state} - ${billing.pinCode}`,
      billingPhone: billing.mobileNumber || "",
      billingEmail: billing.email || "",
      shippingName: shipping.name || "",
      shippingAddress: `${shipping.address}, ${shipping.city}, ${shipping.state} - ${shipping.pinCode}`,
      shippingPhone: shipping.mobileNumber || "",
      shippingEmail: shipping.email || "",
      invoiceNumber: order.invoiceNumber,
      invoiceDate: new Date(order.createdAt).toLocaleDateString(),
      orderNumber: order.id.toString(),
      orderDate: new Date(order.createdAt).toLocaleDateString(),
      paymentMethod: order.paymentMethod || "N/A",
      itemsHtml,
      subtotal: `₹${order.subtotal.toFixed(2)}`,
      // embroidery: `₹${embroideryTotal.toFixed(2)}`,
      shipping: `₹${order.shippingTotal.toFixed(2)}`,
      taxSummaryRow,
      grandTotal: `₹${order.grandTotal.toFixed(2)}`,

      productSubTotal: displayFields.productSubTotal,
      embroideryDisplay: displayFields.embroideryDisplay,
      embroideryTotalRaw: embroideryTotal,

      couponDiscount,
      couponDiscountRaw: couponDiscount,
      couponDiscountDisplay,

      gstTypeLabel: displayFields.gstTypeLabel,
      productGstAmountDisplay: displayFields.productGstAmountDisplay,
      shippingBaseDisplay: displayFields.shippingBaseDisplay,
      shippingTaxDisplay: displayFields.shippingTaxDisplay,
      totalGstDisplay: displayFields.totalGstDisplay,
      payableDisplay: displayFields.payableDisplay,
      taxHeaders: taxHeadersHtml,
      taxSubHeaders: taxSubHeadersHtml,
      taxRowsHtml,
      taxableTotal: `₹${taxableSum.toFixed(2)}`,
      taxTotals: taxTotalsHtml,
      taxGrandTotal: `₹${totalWithTaxSum.toFixed(2)}`,
      cgstSum,
      sgstSum,
      igstSum,
      sameState,
    });

    // 8️⃣ Generate PDF via Puppeteer Cluster
    const cluster = await getCluster();
    const pdfBuffer = await cluster.execute({ html });

    // 9️⃣ Send Response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${order.invoiceNumber}.pdf`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ Invoice generation failed:", err);
    next(err);
  }
};

export const generatePackingSlip = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      where: { id: orderId },
      include: [
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
      ],
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    const data = {
      COMPANY_PHONE_1: "7503 426 382",
      COMPANY_PHONE_2: "7777901997",
      COMPANY_EMAIL: "onlinesupport@easybuy.com",
      RECIPIENT_NAME: order.shippingAddress?.name || "",
      RECIPIENT_ADDRESS_LINE_1: order.shippingAddress?.address || "",
      RECIPIENT_ADDRESS_LINE_2: `${order.shippingAddress?.city || ""}, ${order.shippingAddress?.state || ""
        }`,
      RECIPIENT_ADDRESS_LINE_3: order.shippingAddress?.pinCode || "",
      RECIPIENT_PHONE: order.shippingAddress?.mobileNumber || "",
      RECIPIENT_EMAIL: order.shippingAddress?.email || "",
      RECIPIENT_GST: order.shippingAddress?.gstNumber || "",
      INVOICE_NUMBER: order.invoiceNumber,
      INVOICE_DATE: new Date(order.createdAt).toLocaleDateString(),
      ORDER_NUMBER: `#${order.id}`,
      RETURN_COMPANY_NAME: "A Unit of NK Enterprises Pvt. Ltd",
      RETURN_ADDRESS_LINE_1: "RZ 448A, Street No 14B, Tughlakabad",
      RETURN_ADDRESS_LINE_2: "Extension, New Delhi -110019.",
      GST_NUMBER: "07AADCJ6419N1Z6",
      UDYAM_NUMBER: "UDYAM-DL-08-0018361",
    };

    const templatePath = path.join(__dirname, "../templates/packingSlip.ejs");
    const html = await ejs.renderFile(templatePath, data);

    const cluster = await getCluster();
    const pdfBuffer = await cluster.execute({ html });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="packing-slip-${order.invoiceNumber}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ Error generating packing slip:", err);
    next(err);
  }
};

export const generateOrderForm = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;

    // 1️⃣ Fetch order data
    const order = await Order.findOne({
      where: { id: orderId },
      include: [
        { model: OrderProduct, as: "orderProducts" },
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
      ],
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    // 2️⃣ Load size options
    const sizeOptions = await Option.findAll({
      where: { optionType: "size" },
      raw: true,
    });

    const sizeMap: Record<string, string> = {};
    sizeOptions.forEach((s: any) => {
      sizeMap[s.id] = s.name;
    });

    // 3️⃣ Build product table rows
    const productsHtml =
      order.orderProducts
        ?.map((p: any, idx: number) => {
          const sizes = p.sizes
            ? Object.entries(p.sizes)
              .map(([id, qty]) => `${sizeMap[id] || id}: ${qty}`)
              .join(", ")
            : "-";

          return `
            <tr class="product-row">
              <td>${idx + 1}</td>
              <td>
                ${p.productImage
              ? `<img src="${getFileUrl(
                p.productImage,
                "products/featured-image"
              )}" alt="Product" class="product-image"/>`
              : "-"
            }
              </td>
              <td>
                <div class="product-details">
                  <div class="product-name">${p.product_name}</div>
                  <div class="product-info">Size: ${sizes}</div>
                  <div class="product-info">SKU: ${p.sku || "-"}</div>
                  <div class="product-info">Embroidery: ${p.embroideryPosition || "No"
            }</div>
                </div>
              </td>
              <td>${p.quantity}</td>
              <td>
                ${p.embroideryLogo
              ? `
                      <div style="text-align: center;">
                        <a href="${getFileUrl(
                p.embroideryLogo,
                "cart/embroidery"
              )}" target="_blank" rel="noopener noreferrer" title="Click to open image in new tab">
                          <img src="${getFileUrl(
                p.embroideryLogo,
                "cart/embroidery"
              )}" alt="Embroidery" class="embroidery-logo" style="cursor: pointer;"/>
                        </a>
                      </div>
                      `
              : "-"
            }
              </td>
              <td>${p.majorFabric || "-"} ${p.minorFabric ? " / " + p.minorFabric : ""
            }</td>
            </tr>`;
        })
        .join("") || "";

    // 4️⃣ Prepare data for template
    const data = {
      COMPANY_PHONE_1: "7503 426 382",
      COMPANY_PHONE_2: "7777901997",
      COMPANY_EMAIL: "onlinesupport@easybuy.com",
      ORDER_NUMBER: `#${order.id}`,
      CUSTOMER_NAME: order.shippingAddress?.name || "",
      CUSTOMER_ADDRESS_LINE_1: order.shippingAddress?.address || "",
      CUSTOMER_ADDRESS_LINE_2: order.shippingAddress?.city || "",
      CUSTOMER_ADDRESS_LINE_3: order.shippingAddress?.state || "",
      CUSTOMER_PHONE: order.shippingAddress?.mobileNumber || "",
      CUSTOMER_EMAIL: order.shippingAddress?.email || "",
      ASSIGNED_TO: "",
      ORDER_DATE: new Date(order.createdAt).toLocaleDateString(),
      MAJOR_FABRIC: order.orderProducts?.[0]?.majorFabric || "-",
      MINOR_FABRIC: order.orderProducts?.[0]?.minorFabric || "-",
      PATTERN_NUMBER: order.orderProducts?.[0]?.pattenNumber || "-",
      OTHER_COMMENTS: (order as any).otherComments || "",
      TOTAL_PIECES: String(
        order.orderProducts?.reduce(
          (sum: number, p: any) => sum + p.quantity,
          0
        ) || 0
      ),
      CUSTOMER_REMARKS: (order as any).customerRemarks || "",
      PRODUCTS: productsHtml,
    };

    // 5️⃣ Render HTML with EJS
    const templatePath = path.join(__dirname, "../templates/orderForm.ejs");
    const html = await ejs.renderFile(templatePath, data);

    // 6️⃣ Generate PDF via Puppeteer Cluster
    const cluster = await getCluster();
    const pdfBuffer = await cluster.execute({ html });

    // 7️⃣ Send PDF Response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=order-form-${order.id}.pdf`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ Order form generation failed:", err);
    next(err);
  }
};

// export const exportOrdersToExcel = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const { status, startDate, endDate } = req.query;

//     //  Fetch all orders (you can reuse your listAllOrders filters here)
//     const where: any = {};
//     if (status) where.status = status;
//     if (startDate && endDate) {
//       where.createdAt = {
//         [Op.between]: [
//           new Date(startDate as string),
//           new Date(endDate as string),
//         ],
//       };
//     }

//     const orders = await Order.findAll({
//       where,
//       include: [
//         { model: User, as: "user", attributes: ["name", "email", "mobile"] },
//         { model: OrderShippingAddress, as: "shippingAddress" },
//       ],
//       order: [["createdAt", "DESC"]],
//     });

//     //  Create workbook & worksheet
//     const workbook = new ExcelJS.Workbook();
//     const worksheet = workbook.addWorksheet("Orders");

//     //  Define headers
//     worksheet.columns = [
//       { header: "Order ID", key: "id", width: 10 },
//       { header: "Invoice Number", key: "invoiceNumber", width: 25 },
//       { header: "Customer Name", key: "customerName", width: 25 },
//       { header: "Email", key: "email", width: 30 },
//       { header: "Mobile", key: "mobile", width: 15 },
//       { header: "Amount", key: "grandTotal", width: 15 },
//       { header: "Status", key: "status", width: 15 },
//       { header: "Payment Method", key: "paymentMethod", width: 20 },
//       { header: "Date", key: "createdAt", width: 20 },
//       { header: "Shipping City", key: "city", width: 20 },
//       { header: "Shipping State", key: "state", width: 20 },
//     ];

//     //  Fill rows
//     orders.forEach((order: any) => {
//       worksheet.addRow({
//         id: order.id,
//         invoiceNumber: order.invoiceNumber,
//         customerName: order.user?.name || "N/A",
//         email: order.user?.email || "N/A",
//         mobile: order.user?.mobile || "N/A",
//         grandTotal: order.grandTotal,
//         status: order.status,
//         paymentMethod: order.paymentMethod,
//         createdAt: order.createdAt.toISOString().split("T")[0],
//         city: order.shippingAddress?.city || "",
//         state: order.shippingAddress?.state || "",
//       });
//     });

//     //  Set response headers for download
//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );
//     res.setHeader("Content-Disposition", "attachment; filename=orders.xlsx");

//     await workbook.xlsx.write(res);
//     res.end();
//   } catch (err) {
//     next(err);
//   }
// };

export const exportOrdersToExcel = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { status, startDate, endDate, corporateId } = req.query;

    //  Fetch all orders (you can reuse your listAllOrders filters here)
    const where: any = {};
    if (status) where.status = status;
    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [
          new Date(startDate as string),
          new Date(endDate as string),
        ],
      };
    }

    // Role-based restriction
    if (req.user?.role === "corporate") {
      where.status = {
        [Op.in]: ["process", "shipped", "delivered"],
      };
    } else if (status) {
      where.status = status;
    }

    // Build User include for filtering by corporateId
    const userInclude: any = {
      model: User,
      as: "user",
      attributes: ["name", "email", "mobile"],
      required: false,
    };

    // If corporateId is provided, filter orders by corporateId
    if (corporateId) {
      userInclude.where = {
        ...userInclude.where,
        corporateId: Number(corporateId),
      };
      userInclude.required = true;
    }

    const orders = await Order.findAll({
      where,
      include: [
        userInclude,
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
        {
          model: OrderProduct,
          as: "orderProducts",
          attributes: ["quantity"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    //  Create workbook & worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Orders");

    //  Define headers
    worksheet.columns = [
      { header: "Order ID", key: "id", width: 10 },
      { header: "PI", key: "invoiceNumber", width: 25 },
      { header: "Customer Name", key: "customerName", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Mobile", key: "mobile", width: 15 },
      { header: "Amount", key: "grandTotal", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Payment Method", key: "paymentMethod", width: 20 },
      { header: "Date", key: "createdAt", width: 20 },
      { header: "Shipping Address", key: "fullAddress", width: 50 },
      { header: "Total Units", key: "totalUnits", width: 15 },
    ];

    //  Fill rows
    orders.forEach((order: any) => {
      const address = order.shippingAddress;

      const fullAddress = address
        ? [
          address.address,
          address.locality,
          address.city,
          address.state,
          address.pinCode,
        ]
          .filter(Boolean)
          .join(", ")
        : "N/A";

      const totalUnits =
        order.orderProducts?.reduce(
          (sum: number, p: any) => sum + Number(p.quantity || 0),
          0
        ) || 0;

      // Get customer info from shipping address first, then billing address, then user as fallback
      const customerName =
        order.shippingAddress?.name ||
        order.billingAddress?.name ||
        order.user?.name ||
        "N/A";

      const email =
        order.shippingAddress?.email ||
        order.billingAddress?.email ||
        order.user?.email ||
        "N/A";

      const mobileNumber =
        order.shippingAddress?.mobileNumber ||
        order.billingAddress?.mobileNumber ||
        "N/A";

      worksheet.addRow({
        id: order.id,
        invoiceNumber: order.invoiceNumber,
        customerName: customerName,
        email: email,
        mobile: mobileNumber,
        grandTotal: order.grandTotal,
        status: order.status,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt.toISOString().split("T")[0],
        fullAddress,
        totalUnits,
      });
    });

    //  Set response headers for download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=orders.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

export const getOrderSearchSuggestions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const search = (req.query.search as string) || "";
    if (!search) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const user = req.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const likeSearch = { [Op.iLike]: `%${search}%` };

    // 🔹 Build where conditions based on user role
    const orderWhere: any = {
      [Op.or]: [
        { invoiceNumber: likeSearch },
        { status: likeSearch },
        // Add order ID search for numeric queries
        { id: !isNaN(Number(search)) ? Number(search) : null },
      ].filter((condition) => condition !== null),
    };

    const userWhere: any = {
      [Op.or]: [
        { name: likeSearch },
        { email: likeSearch },
        { mobile: likeSearch },
        { companyName: likeSearch },
      ],
    };

    // 🔹 Role-based filtering
    if (user.role === "corporate") {
      // Corporate users can only see their own data and data of users under their corporate entity
      const corporateUsers = await User.findAll({
        where: { corporateId: user.id },
        attributes: ["id"],
      });

      const corporateUserIds = corporateUsers.map((u) => u.id);
      // Include corporate's own orders + all users under them
      userWhere.id = { [Op.in]: [user.id, ...corporateUserIds] };

      // Filter orders by userId (users under corporate) or corporateId (if order directly linked)
      orderWhere[Op.or] = [
        { userId: { [Op.in]: [user.id, ...corporateUserIds] } },
        { corporateId: user.id },
        // Add order ID search for numeric queries
        { id: !isNaN(Number(search)) ? Number(search) : null },
      ].filter((condition) => condition !== null);
    } else if (user.role !== "superadmin" && user.role !== "admin") {
      // Regular users can only see their own data
      userWhere.id = user.id;
      orderWhere.userId = user.id;
      // Add order ID search for numeric queries
      orderWhere[Op.or] = [
        { userId: user.id },
        { invoiceNumber: likeSearch },
        { status: likeSearch },
        { id: !isNaN(Number(search)) ? Number(search) : null },
      ].filter((condition) => condition !== null);
    }

    // 🔹 Order fields
    const orderResults = await Order.findAll({
      where: orderWhere,
      attributes: ["id", "invoiceNumber", "status"],
      limit: 10,
    });

    // 🔹 User fields
    const userResults = await User.findAll({
      where: userWhere,
      attributes: ["name", "email", "mobile", "companyName"],
      limit: 10,
    });

    // 🔹 Grouped suggestions
    const suggestions = {
      names: userResults
        .map((u) => u.name)
        .filter((v): v is string => !!v)
        .slice(0, 5),
      emails: userResults
        .map((u) => u.email)
        .filter((v): v is string => !!v)
        .slice(0, 5),
      mobiles: userResults
        .map((u) => u.mobile)
        .filter((v): v is string => !!v)
        .slice(0, 5),
      companyNames: userResults
        .map((u) => u.companyName)
        .filter((v): v is string => !!v)
        .slice(0, 5),
      invoiceNumbers: orderResults
        .map((o) => o.invoiceNumber)
        .filter((v): v is string => !!v)
        .slice(0, 5),
      statuses: orderResults
        .map((o) => o.status)
        .filter((v): v is string => !!v)
        .slice(0, 5),
      orderIds: orderResults
        .map((o) => o.id)
        .filter((v): v is number => !!v)
        .slice(0, 5),
    };

    return res.status(200).json({ success: true, data: suggestions });
  } catch (err) {
    next(err);
  }
};

/**
 * 🧾 Create Order for Guest User
 * Endpoint: POST /api/v1/order/guest
 * Body:
 * {
 *   "guestToken": "...",
 *   "shippingAddress": {...},
 *   "billingAddress": {...},
 *   "paymentMode": "cod" | "online",
 *   "notes": "optional"
 * }
 */
export const createGuestOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      guestToken,
      shippingAddress,
      billingAddress,
      paymentMode,
      paymentMethod,
    } = req.body;

    if (!guestToken)
      return res.status(400).json({ message: "guestToken is required" });

    if (!shippingAddress || !shippingAddress.email || !shippingAddress.name)
      return res
        .status(400)
        .json({ message: "Shipping name and email are required" });

    // 🛒 Find guest cart
    const cart = await Cart.findOne({
      where: { guestToken },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
      transaction: t,
    });

    if (!cart || !cart.cartProducts?.length) {
      return res.status(400).json({ message: "Guest cart is empty" });
    }

    // Use state as-is (now lowercase) for consistency
    const buyerState = (shippingAddress.state || "Unknown").toLowerCase();
    const sellerState = "delhi"; // your warehouse state
    const round2 = (v: number) => Math.round(v * 100) / 100;

    // 📦 Compute subtotal & totals
    let subtotal = 0;
    let totalWeight = 0;
    let totalQuantity = 0;

    for (const cp of cart.cartProducts) {
      subtotal +=
        Number(cp.price) * Number(cp.quantity) +
        (cp.embroideryPrice || 0) * Number(cp.quantity);
      totalWeight += (cp.weight || 0) * cp.quantity;
      totalQuantity += cp.quantity;
    }

    // 🎟️ Coupon handling - calculate discount before tax calculation
    let discount = 0;
    let couponType: "fixed" | "percentage" | null = null;
    let couponDiscount = null;
    const coupon = cart.coupon; // Guest carts include coupon directly

    if (coupon && (coupon.type === "fixed" || coupon.type === "percentage")) {
      couponType = coupon.type;
      couponDiscount = coupon.discount;
      if (coupon.type === "percentage") {
        discount = round2((subtotal * coupon.discount) / 100);
      } else {
        discount = round2(Number(coupon.discount));
      }
    }

    // 🚚 Shipping
    const shippingInfo = await calculateShipping(
      Math.max(0.1, totalWeight), // Ensure minimum weight for shipping calculation
      buyerState
    );

    // 💰 Tax
    let taxTotal = 0;
    for (const cp of cart.cartProducts) {
      // 🔹 Calculate GST for this product based on unit price
      const taxInfo: any = calculateTax(
        Number(cp.price),
        Number(cp.quantity),
        cp.embroideryPrice || 0,
        buyerState,
        sellerState
      );
      taxTotal += taxInfo.taxAmount;
    }
    taxTotal = round2(taxTotal);

    // If there's a discount, recalculate tax on discounted amount to ensure compliance
    if (discount > 0) {
      // Calculate average tax rate from original calculation
      const avgTaxRate = subtotal > 0 ? taxTotal / subtotal : 0;
      // Calculate tax on discounted subtotal
      const discountedSubtotal = subtotal - discount;
      taxTotal = round2(discountedSubtotal * avgTaxRate);
    }

    const grandTotal = round2(
      subtotal - discount + taxTotal + shippingInfo.totalWithTax
    );

    // Generate checkout hash based on cart contents, coupon, and addresses
    const checkoutHash = generateCheckoutHash(
      cart.cartProducts,
      coupon,
      shippingAddress,
      billingAddress || shippingAddress
    );

    // Check if there's an existing pending unpaid guest order with the same checkoutHash
    let existingOrder = await Order.findOne({
      where: {
        guestToken: guestToken,
        paymentStatus: {
          [Op.not]: "paid",
        },
        status: "pending", // Only consider truly pending orders (not cancelled/failed)
        checkoutHash: checkoutHash,
      },
      transaction: t,
    });

    let order;
    if (existingOrder) {
      // Reuse existing order with same checkoutHash
      order = existingOrder;
    } else {
      // Check for any other pending guest orders for this guest that don't match the current checkoutHash
      const otherPendingOrders = await Order.findAll({
        where: {
          guestToken: guestToken,
          paymentStatus: "pending",
          status: "pending",
        },
        transaction: t,
      });

      // Mark other pending orders as 'trash' since they're no longer valid
      for (const pendingOrder of otherPendingOrders) {
        if (pendingOrder.checkoutHash !== checkoutHash) {
          pendingOrder.status = "trash";
          pendingOrder.paymentStatus = "expired";
          await pendingOrder.save({ transaction: t });
        }
      }

      // Create new order
      order = await Order.create(
        {
          userId: null,
          isGuest: true,
          guestToken,
          guestEmail: shippingAddress.email || null,
          guestMobile: shippingAddress.mobileNumber || null,
          guestName: shippingAddress.name,
          subtotal,
          discount,
          taxTotal,
          shippingBase: shippingInfo.finalAmount,
          shippingTax: shippingInfo.taxAmount,
          shippingTotal: shippingInfo.totalWithTax,
          grandTotal,
          couponCode: coupon ? coupon.code : null,
          couponType: couponType,
          couponDiscount: couponDiscount,
          paymentMode,
          paymentMethod,
          paymentStatus: paymentMethod === "credit" ? "complete" : "pending",
          status: "pending",
          checkoutHash: checkoutHash,
        },
        { transaction: t }
      );
    }

    // Generate invoice number only for new orders (not reused)
    if (!existingOrder) {
      const getFinancialYear = (): string => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        return month < 4
          ? `${year - 1}-${String(year).slice(-2)}`
          : `${year}-${String(year + 1).slice(-2)}`;
      };

      const paddedId = String(order.id).padStart(5, "0");
      order.invoiceNumber = paddedId;
      await order.save({ transaction: t });
    }

    // 📜 Log order status only for new orders (not reused)
    if (!existingOrder) {
      await OrderStatusHistory.create(
        {
          orderId: order.id,
          status: "pending",
          note: "Guest order placed",
          changedBy: null,
        },
        { transaction: t }
      );
    } else {
      // Update the existing order's status to pending if it was changed
      if (order.status !== "pending") {
        order.status = "pending";
        await order.save({ transaction: t });
      }
    }

    // If reusing an existing order, clear the existing order products and addresses first
    if (existingOrder) {
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
    }

    // 🧵 Copy Cart → Order Products
    for (const cp of cart.cartProducts) {
      const product = await Product.findByPk(cp.productId, { transaction: t });
      if (!product) {
        await t.rollback();
        return res
          .status(404)
          .json({ message: `Product ${cp.productId} not found` });
      }
      if (product.outOfStock) {
        await t.rollback();
        return res.status(400).json({
          message: `Product "${product.title}" is currently out of stock and cannot be ordered`,
        });
      }
      await product.save({ transaction: t });

      await OrderProduct.create(
        {
          order_id: order.id,
          productId: cp.productId,
          product_name: cp.productName!,
          sku: cp.sku,
          hsn: cp.hsn,
          quantity: cp.quantity,
          weight: cp.weight,
          price: cp.price,
          majorFabric: product.majorFabric,
          minorFabric: product.minorFabric,
          pattenNumber: product.pattenNumber,
          embroidery: cp.embroidery,
          embroideryLogo: cp.embroideryLogo,
          embroideryPosition: cp.embroideryPosition,
          embroideryPrice: cp.embroideryPrice,
          sizes: cp.sizes,
          productImage: cp.productImage,
          lineTotal: round2(
            Number(cp.price) * Number(cp.quantity) +
            (cp.embroideryPrice || 0) * Number(cp.quantity)
          ),
        },
        { transaction: t }
      );
    }

    // 🏠 Save shipping & billing addresses with capitalized states
    await OrderShippingAddress.create(
      {
        order_id: order.id,
        name: shippingAddress.name,
        email: shippingAddress.email || "unknown@example.com",
        companyName: shippingAddress.companyName,
        mobileNumber: shippingAddress.mobileNumber,
        pinCode: shippingAddress.pinCode,
        address: shippingAddress.address,
        locality: shippingAddress.locality,
        city: shippingAddress.city,
        state: shippingAddress.state.toLowerCase(), // Use lowercase state
        gstNumber: shippingAddress.gstNumber || null,
      },
      { transaction: t }
    );

    await OrderBillingAddress.create(
      {
        order_id: order.id,
        name: billingAddress?.name || shippingAddress.name,
        email:
          billingAddress?.email ||
          shippingAddress?.email ||
          "unknown@example.com",
        companyName: billingAddress?.companyName || shippingAddress.companyName,
        mobileNumber:
          billingAddress?.mobileNumber || shippingAddress.mobileNumber,
        pinCode: billingAddress?.pinCode || shippingAddress.pinCode,
        address: billingAddress?.address || shippingAddress.address,
        locality: billingAddress?.locality || shippingAddress.locality,
        city: billingAddress?.city || shippingAddress.city,
        state: (billingAddress?.state || shippingAddress.state).toLowerCase(), // Use lowercase state
        gstNumber: billingAddress?.gstNumber || null,
      },
      { transaction: t }
    );

    await t.commit();

    // 📧 Send Email - Commented out as email should only be sent when payment is successful
    // try {
    //   if (shippingAddress.email.includes("@")) {
    //     const fullOrder = await Order.findByPk(order.id, {
    //       include: [
    //         { model: OrderProduct, as: "orderProducts" },
    //         { model: OrderShippingAddress, as: "shippingAddress" },
    //         { model: OrderBillingAddress, as: "billingAddress" },
    //       ],
    //     });

    //     await sendOrderPlacedEmail(shippingAddress.email, fullOrder);
    //   }
    // } catch (err) {
    //   console.warn("⚠️ Guest email send failed:", err);
    // }

    // 📦 Fetch full order for response
    const fullOrder = await Order.findByPk(order.id, {
      include: [
        { model: OrderProduct, as: "orderProducts" },
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
      ],
    });

    const allSizeIds =
      fullOrder?.orderProducts?.flatMap((p: any) =>
        Object.keys(p.sizes || {}).map((id) => Number(id))
      ) || [];
    const validOptions = allSizeIds.length
      ? await Option.findAll({
        where: { id: allSizeIds, optionType: "size", status: "active" },
      })
      : [];
    const formattedOrder = await formatOrderResponse(fullOrder, validOptions);

    return res.status(201).json({
      success: true,
      message: "Guest order placed successfully",
      order: formattedOrder,
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// 🧾 Get Guest Order by ID (for tracking or thank-you page)
// Endpoint: GET /api/v1/order/guest/:orderId?mobile=9999999999

export const getGuestOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    let { mobile, guestToken } = req.query;

    // Normalize to string
    const mobileStr = Array.isArray(mobile)
      ? String(mobile[0])
      : String(mobile || "");
    const guestTokenStr = Array.isArray(guestToken)
      ? String(guestToken[0])
      : String(guestToken || "");

    // Require at least one identifier
    if (!mobileStr && !guestTokenStr) {
      return res.status(400).json({
        success: false,
        message: "Either mobile number or guest token is required",
      });
    }

    // 🧠 Find order by ID + guest flag (mobile OR token)
    const where: any = {
      id: orderId,
      isGuest: true,
    };
    if (mobileStr) where.guestMobile = mobileStr;
    if (guestTokenStr) where.guestToken = guestTokenStr;

    const order = await Order.findOne({
      where,
      include: [
        { model: OrderProduct, as: "orderProducts" },
        { model: OrderShippingAddress, as: "shippingAddress" },
        { model: OrderBillingAddress, as: "billingAddress" },
        {
          model: OrderStatusHistory,
          as: "statusHistory",
          include: [
            {
              model: User,
              as: "changedByUser",
              attributes: ["id", "name", "email", "role"],
            },
          ],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Guest order not found or credentials mismatch",
      });
    }

    const allSizeIds =
      order.orderProducts?.flatMap((p: any) =>
        Object.keys(p.sizes || {}).map((id) => Number(id))
      ) || [];

    const validOptions =
      allSizeIds.length > 0
        ? await Option.findAll({
          where: { id: allSizeIds, optionType: "size", status: "active" },
        })
        : [];

    const formattedOrder = await formatOrderResponse(order, validOptions);

    return res.status(200).json({
      success: true,
      order: formattedOrder,
    });
  } catch (err) {
    next(err);
  }
};
