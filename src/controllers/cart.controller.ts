import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../models";
import Cart from "../models/cart.model";
import CartProduct from "../models/cartProduct.model";
import Product from "../models/product.model";
import Coupon from "../models/coupon.model";
import { getApplicableBulkPrice } from "../utils/priceHelpers";
import { calculateEmbroideryCharge } from "../utils/embroideryHelper";
import Option from "../models/option.model";
import { deleteImage, singleUpload, getFileUrl } from "../utils/awsS3";
import { calculateTax } from "../utils/taxHelper";
import Address from "../models/address.model";
import { calculateShipping } from "../utils/shippingHelper";

const formatCartResponse = async (
  cart: any,
  optionsMap: Option[] = [],
  buyerStateOverride?: string,
  shippingTotal: number = 0, // Add shipping total parameter
  shippingTax: number = 0 // Add shipping tax parameter
) => {
  if (!cart) return null;

  let totalBulkDiscount = 0;
  let totalEmbroidery = 0;

  let totalTax = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  const sellerState = "delhi"; // same as order
  const buyerStateRaw =
    buyerStateOverride ||
    cart.user?.defaultAddress?.state ||
    cart.user?.addresses?.[0]?.state;

  const buyerState = buyerStateRaw ? buyerStateRaw.toLowerCase() : undefined;

  const products = (cart.cartProducts || []).map((p: any) => {
    const unitPrice = Number(p.price);
    const embroideryTotal = (p.embroideryPrice || 0) * Number(p.quantity);
    totalEmbroidery += embroideryTotal;

    const productTotal = unitPrice * Number(p.quantity);
    const totalCost = productTotal + embroideryTotal;

    // 🔹 Calculate GST for this product
    const taxInfo = calculateTax(
      unitPrice,
      Number(p.quantity),
      p.embroideryPrice || 0,
      buyerState, // can be undefined
      sellerState
    );

    totalTax += taxInfo.taxAmount || 0;
    totalCGST += taxInfo.cgst || 0;
    totalSGST += taxInfo.sgst || 0;
    totalIGST += taxInfo.igst || 0;

    // ✅ Build all sizes for the product, not just those added to cart
    const optionById = new Map<number, Option>();
    optionsMap.forEach((o: any) => optionById.set(Number(o.id), o));

    const productSizeIds: number[] = Array.isArray(p.product?.sizes)
      ? p.product.sizes.map((id: any) => Number(id))
      : [];

    const sizes = productSizeIds.map((sizeId) => {
      const optionObj = optionById.get(sizeId);
      return {
        id: sizeId,
        name: optionObj?.name || `Size ${sizeId}`,
        quantity: Number((p.sizes && p.sizes[sizeId]) || 0),
      };
    });

    const basePrice = Number(p.product.price || p.price); // fallback to cart price
    const bulkDiscountPerUnit = basePrice - unitPrice;
    const bulkDiscountTotal = bulkDiscountPerUnit * Number(p.quantity);

    totalBulkDiscount += bulkDiscountTotal;

    return {
      id: p.id,
      productId: p.productId,
      productName: p.productName,
      slug: p.product?.slug,
      outOfStock: p.product?.outOfStock,
      sku: p.sku,
      productImage: getFileUrl(p.productImage, "products/featured-image"),
      embroideryLogo: getFileUrl(p.embroideryLogo),
      embroideryPosition: p.embroideryPosition,
      quantity: p.quantity,
      unitPrice,
      basePrice,
      bulkDiscountPerUnit,
      bulkDiscountTotal,
      productTotal,
      embroidery: p.embroidery,
      embroideryPrice: p.embroideryPrice,
      embroideryTotal,
      totalCost,
      // Add tax rate information for frontend display purposes
      taxRate: taxInfo.taxRate,
      totalTax: taxInfo.taxAmount,
      totalWithTax: taxInfo.total,
      sizes,
    };
  });

  const subtotal = products.reduce(
    (sum: number, p: any) => sum + p.totalCost,
    0
  );

  // ✅ Fix: Calculate grandTotal consistently with order controller
  // Include all components in initial calculation, including shipping
  const round2 = (v: number) => Math.round(v * 100) / 100;

  // Calculate discount with safety check to prevent discount exceeding subtotal
  let discount = 0;
  if (cart.coupon?.type === "percentage") {
    discount = round2((cart.coupon.discount / 100) * subtotal);
  } else if (cart.coupon?.type === "fixed") {
    // For fixed discounts, ensure it doesn't exceed the subtotal
    discount = Math.min(round2(Number(cart.coupon.discount)), subtotal);
  }

  // If there's a discount, recalculate tax on discounted amount to ensure compliance
  if (discount > 0) {
    // Calculate average tax rate from original calculation
    const avgTaxRate = subtotal > 0 ? totalTax / subtotal : 0;
    // Calculate tax on discounted subtotal
    const discountedSubtotal = subtotal - discount;
    totalTax = round2(discountedSubtotal * avgTaxRate);
  }

  let grandTotal = round2(subtotal - discount + totalTax + shippingTotal);

  // total MRP of products (product.basePrice * qty) — excludes embroidery add-ons
  const totalMRP = products.reduce(
    (sum: number, p: any) => sum + p.basePrice * Number(p.quantity),
    0
  );

  // total selling price (unitPrice * qty) — what customer actually pays for product units (excludes embroidery & coupons)
  const totalProductSelling = products.reduce(
    (sum: number, p: any) => sum + p.unitPrice * Number(p.quantity),
    0
  );

  // Bulk discount on MRP (product-level only). This EXCLUDES coupon.
  const totalDiscountOnMRP = Math.max(
    0,
    round2(totalMRP - totalProductSelling)
  );

  // Determine GST type for display (CGST/SGST or IGST)
  const isInterState = totalIGST > 0;
  const gstType = isInterState ? "IGST" : "CGST/SGST";

  // Add simple tax rate indicator for frontend display purposes
  // This indicates whether the cart predominantly contains 5% or 18% taxed items
  let cartTaxRate = 5; // default to 5%
  if (products.length > 0) {
    // Count products by tax rate
    let count5Percent = 0;
    let count18Percent = 0;

    products.forEach((p: any) => {
      if (p.taxRate === 18) {
        count18Percent++;
      } else {
        count5Percent++;
      }
    });

    // Set the predominant tax rate
    cartTaxRate = count18Percent > count5Percent ? 18 : 5;
  }

  // ✅ Add totalGst field combining product tax and shipping tax
  const totalGst = round2(totalTax + shippingTax);

  return {
    id: cart.id,
    products,
    totalMRP: round2(totalMRP),
    bulkDiscount: round2(totalBulkDiscount),
    totalDiscountOnMRP: round2(totalDiscountOnMRP),
    productSubTotal: round2(totalMRP - totalBulkDiscount - discount),
    totalEmbroidery: round2(totalEmbroidery),
    subtotal: round2(subtotal),
    couponDiscount: round2(discount),
    discount: round2(discount),
    taxTotal: round2(totalTax),

    // Add tax rate information for frontend display purposes
    taxRate: cartTaxRate,
    gstType, // Added GST type for display purposes
    taxBreakdown: {
      cgst: round2(totalCGST),
      sgst: round2(totalSGST),
      igst: round2(totalIGST),
      total: round2(totalTax),
    },
    // ✅ Add totalGst field to match order response
    totalGst: totalGst.toFixed(2),
    grandTotal: round2(grandTotal),
    coupon: cart.coupon
      ? {
          code: cart.coupon.code,
          type: cart.coupon.type,
          discount: cart.coupon.discount,
        }
      : null,
  };
};

// Get or Create Cart
export const getOrCreateCart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const addressId = req.query.addressId
      ? Number(req.query.addressId)
      : undefined;

    // 1️⃣ Fetch or create cart
    let cart = await Cart.findOne({
      where: { userId },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
      order: [[{ model: CartProduct, as: "cartProducts" }, "id", "DESC"]],
    });

    if (!cart) {
      cart = await Cart.create({ userId });
    }

    // 2️⃣ Load valid size options
    const productIds = cart.cartProducts?.map((cp: any) => cp.productId) || [];
    let validOptions: Option[] = [];
    if (productIds.length) {
      const products = await Product.findAll({
        where: { id: productIds },
        attributes: ["id", "sizes"],
      });
      const allSizeIds = products.flatMap((p: any) => p.sizes || []);
      if (allSizeIds.length) {
        validOptions = await Option.findAll({
          where: { id: allSizeIds, optionType: "size", status: "active" },
        });
      }
    }

    // 4️⃣ Estimate shipping
    let estimatedShipping: number | null = null;
    let shippingBreakdown: any = null;
    let usedAddress: any = null;

    try {
      // Determine which address to use
      if (addressId) {
        usedAddress = await Address.findOne({
          where: { id: addressId, userId },
        });
      } else {
        usedAddress =
          (await Address.findOne({
            where: { userId, isDefault: true, addressType: "shipping" },
          })) ||
          (await Address.findOne({
            where: { userId, addressType: "shipping" },
            order: [["createdAt", "ASC"]],
          }));
      }

      // ✅ Fix: Always set shippingAddress in response if we have a usedAddress
      // This ensures shippingAddress is not null when an address exists
      if (usedAddress && cart.cartProducts?.length) {
        // ✅ Fix: Use cart product weight instead of product weight for consistency with order flow
        const totalWeight = cart.cartProducts.reduce(
          (sum, p: any) =>
            sum + (Number(p.weight) || 0) * Number(p.quantity || 0),
          0
        );

        // ✅ Fix: Calculate shipping even if totalWeight is 0
        // Some shipping providers charge a minimum fee even for lightweight items
        if (totalWeight >= 0) {
          // Use state as-is (now lowercase) for calculating shipping
          const normalizedState = usedAddress.state;

          const shippingInfo = await calculateShipping(
            Math.max(0.1, totalWeight), // Ensure minimum weight for shipping calculation
            normalizedState
          );
          estimatedShipping = shippingInfo.totalWithTax;
          shippingBreakdown = shippingInfo;
        }
      }
    } catch (err) {
      console.warn("⚠️ Shipping estimation failed:", err);
    }

    // 3️⃣ Format main cart with the selected address state for tax calculation
    // First, set simplifiedShipping
    let simplifiedShipping = null;

    // ✅ Fix: Set simplifiedShipping if we have usedAddress, even without shippingBreakdown
    // This provides better feedback about shipping status
    if (usedAddress) {
      if (shippingBreakdown) {
        simplifiedShipping = {
          amount: shippingBreakdown.finalAmount, // ✅ Fix: Remove Math.round to preserve precision
          tax: shippingBreakdown.taxAmount, // ✅ Fix: Remove Math.round to preserve precision
          total: shippingBreakdown.totalWithTax, // ✅ Fix: Remove Math.round to preserve precision
          currency: "INR",
          label: `Shipping to ${usedAddress.state}`,
        };
      } else {
        // Provide a clear indication that shipping calculation failed or is not applicable
        simplifiedShipping = {
          amount: 0,
          tax: 0,
          total: 0,
          currency: "INR",
          label: `Shipping to ${usedAddress.state}`,
          note: "Shipping calculation not available",
        };
      }
    }

    const formattedCart = await formatCartResponse(
      cart,
      validOptions,
      usedAddress?.state,
      simplifiedShipping?.total || 0, // Pass shipping total
      simplifiedShipping?.tax || 0 // Pass shipping tax
    );

    // 5️⃣ Return full response
    let finalCartResponse = {
      ...formattedCart,
      shipping: simplifiedShipping,
      shippingAddress: usedAddress
        ? {
            id: usedAddress.id,
            name: usedAddress.name,
            city: usedAddress.city,
            state: usedAddress.state,
            pinCode: usedAddress.pinCode,
            summary: `${usedAddress.name}, ${usedAddress.city}, ${usedAddress.state} - ${usedAddress.pinCode}`,
          }
        : null,
    };

    // Remove the separate shipping addition since it's now included in the formattedCart
    // The grandTotal is already calculated with shipping included

    return res.json(finalCartResponse);
  } catch (err) {
    next(err);
  }
};
// Add Product to Cart
export const addProductToCart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Coerce types from form-data
    const productId = Number(req.body.productId);
    const embroidery =
      req.body.embroidery === "true" || req.body.embroidery === true;
    const embroideryPosition = req.body.embroideryPosition;
    const sizes =
      typeof req.body.sizes === "string"
        ? JSON.parse(req.body.sizes)
        : req.body.sizes;

    const cart = await Cart.findOrCreate({
      where: { userId },
      defaults: { userId },
      transaction: t,
    }).then(([c]) => c);

    if (cart.couponId) {
      const coupon = await Coupon.findByPk(cart.couponId);
      if (!coupon) {
        cart.couponId = null;
        await cart.save({ transaction: t });
      }
    }

    const product = await Product.findByPk(productId, {
      include: [{ association: "bulkOrders" }],
      transaction: t,
    });
    if (!product) throw new Error("Product not found");

    if (product.outOfStock) {
      return res.status(400).json({
        message: "This product is currently out of stock and cannot be ordered",
      });
    }

    if (!product.allowEmbroidery && req.body.embroidery === "true") {
      return res.status(400).json({
        message: "Embroidery is not allowed for this product",
      });
    }

    // Load valid size Option records
    const validOptions = await Option.findAll({
      where: { id: product.sizes || [], optionType: "size", status: "active" },
      transaction: t,
    });
    const validSizeIds = validOptions.map((opt) => opt.id);

    let cartProduct = await CartProduct.findOne({
      where: { cartId: cart.id, productId: productId },
      transaction: t,
    });

    let logoUrl: string | undefined = undefined;

    if (req.file) {
      logoUrl = await singleUpload(req.file, "cart/embroidery");

      if (cartProduct?.embroideryLogo) {
        try {
          await deleteImage(cartProduct.embroideryLogo);
        } catch (e) {
          console.warn("Failed to delete old embroidery logo:", e);
        }
      }
    }
    if (!cartProduct) {
      cartProduct = await CartProduct.create(
        {
          cartId: cart.id,
          productId,
          price: product.price!,
          weight: product.weight != null ? Number(product.weight) : null,
          embroidery,
          embroideryLogo: logoUrl ?? null,
          embroideryPosition,
          productName: product.title,
          sku: product.sku,
          hsn: product.hsn,
          majorFabric: product.majorFabric,
          minorFabric: product.minorFabric,
          pattenNumber: product.pattenNumber,
          productImage: product.featuredImage,
          quantity: 0,
          sizes: {},
        },
        { transaction: t }
      );
    } else {
      cartProduct.embroidery = embroidery;
      if (logoUrl) cartProduct.embroideryLogo = logoUrl;
      cartProduct.embroideryPosition = embroideryPosition;
      await cartProduct.save({ transaction: t });
    }

    // Sync size options
    if (Array.isArray(sizes) && sizes.length) {
      const sizesMap: Record<string, number> = { ...cartProduct.sizes };

      sizes.forEach(({ id, quantity }: any) => {
        if (validSizeIds.includes(id)) {
          sizesMap[id] = (sizesMap[id] || 0) + quantity;
        } else {
          throw new Error(`Invalid size ID ${id} for this product`);
        }
      });

      cartProduct.sizes = sizesMap;
    }

    const totalQty = Object.values(cartProduct.sizes || {}).reduce(
      (sum, q) => sum + q,
      0
    );
    const dynamic = getApplicableBulkPrice(product, totalQty);
    const unitPrice = dynamic?.price ?? Number(product.price);
    const embroideryPerUnit =
      embroidery && totalQty > 0
        ? calculateEmbroideryCharge(totalQty) / totalQty
        : 0;

    cartProduct.quantity = totalQty;
    cartProduct.price = unitPrice;
    cartProduct.embroideryPrice = embroideryPerUnit;
    await cartProduct.save({ transaction: t });

    await t.commit();

    const refreshedCart = await Cart.findOne({
      where: { userId: userId },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // For add/update operations, we don't have shipping information, so pass 0
    return res.json(
      await formatCartResponse(refreshedCart, validOptions, undefined, 0)
    );
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// Update Cart Product
export const updateCartProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { cartProductId } = req.params;
    const { sizes, embroidery, embroideryLogo, embroideryPosition } = req.body;

    const cartProduct = await CartProduct.findByPk(cartProductId, {
      transaction: t,
    });
    if (!cartProduct)
      return res.status(404).json({ message: "Cart product not found" });

    const cart = await Cart.findOne({
      where: { id: cartProduct.cartId, userId },
    });
    if (!cart) return res.status(403).json({ message: "Unauthorized" });
    const product = await Product.findByPk(cartProduct.productId, {
      include: [{ association: "bulkOrders" }],
      transaction: t,
    });
    if (!product) throw new Error("Product not found");

    // Load valid size Option records
    const validOptions = await Option.findAll({
      where: { id: product.sizes || [], optionType: "size", status: "active" },
      transaction: t,
    });
    const validSizeIds = validOptions.map((opt) => opt.id);

    // 🧵 Embroidery logo handling
    let logoUrl = cartProduct.embroideryLogo;

    if (req.file) {
      logoUrl = await singleUpload(req.file, "cart/embroidery");

      if (cartProduct.embroideryLogo) {
        try {
          await deleteImage(cartProduct.embroideryLogo);
        } catch (e) {
          console.warn("Failed to delete old embroidery logo:", e);
        }
      }
    }

    // Update embroidery fields - only update if explicitly provided
    if (embroidery !== undefined) {
      const hasEmbroidery = embroidery === "true" || embroidery === true;
      cartProduct.embroidery = hasEmbroidery;
    }

    if (embroideryPosition !== undefined) {
      cartProduct.embroideryPosition = embroideryPosition;
    }

    if (logoUrl !== undefined) {
      cartProduct.embroideryLogo = logoUrl;
    }

    let parsedSizes: any[] = [];
    if (typeof sizes === "string") {
      try {
        parsedSizes = JSON.parse(sizes);
      } catch {
        throw new Error("Invalid sizes JSON");
      }
    } else if (Array.isArray(sizes)) {
      parsedSizes = sizes;
    }

    if (Array.isArray(parsedSizes)) {
      const sizesMap: Record<string, number> = {};

      parsedSizes.forEach(({ id, quantity }: any) => {
        if (validSizeIds.includes(id)) {
          if (quantity > 0) sizesMap[id] = quantity;
        } else {
          throw new Error(`Invalid size ID ${id}`);
        }
      });

      cartProduct.sizes = sizesMap;
      cartProduct.changed("sizes", true); // 🔥 Important
    }

    // Recalculate totals
    const totalQty = Object.values(cartProduct.sizes || {}).reduce(
      (sum, q) => sum + q,
      0
    );
    const dynamic = getApplicableBulkPrice(product, totalQty);
    const unitPrice = dynamic?.price ?? Number(product.price);
    let embroideryPerUnit = 0;

    if (cartProduct.embroidery && totalQty > 0) {
      const totalEmbCharge = calculateEmbroideryCharge(totalQty);
      embroideryPerUnit = totalEmbCharge / totalQty;
    }
    cartProduct.quantity = totalQty;
    cartProduct.price = unitPrice;
    cartProduct.embroideryPrice = embroideryPerUnit;

    await cartProduct.save({ transaction: t });
    await t.commit();

    const refreshedCart = await Cart.findOne({
      where: { userId: userId },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // For add/update operations, we don't have shipping information, so pass 0
    return res.json(
      await formatCartResponse(refreshedCart, validOptions, undefined, 0)
    );
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

//  Remove Cart Product
export const removeCartProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { cartProductId } = req.params;
    const cartProduct = await CartProduct.findByPk(cartProductId, {
      transaction: t,
    });
    if (!cartProduct)
      return res.status(404).json({ message: "Cart product not found" });

    // ensure this cart belongs to the user (do this inside the transaction)
    const cart = await Cart.findOne({
      where: { id: cartProduct.cartId, userId },
      transaction: t,
    });
    if (!cart) return res.status(403).json({ message: "Unauthorized" });

    // remove the cart product
    await cartProduct.destroy({ transaction: t });

    // if there are no products left in the cart, clear the coupon (DB + in-memory)
    const remainingCount = await CartProduct.count({
      where: { cartId: cart.id },
      transaction: t,
    });

    if (remainingCount === 0) {
      // clear coupon in DB within same transaction
      await Cart.update(
        { couponId: null },
        { where: { id: cart.id }, transaction: t }
      );

      // clear in-memory association so API response reflects the change
      (cart as any).setDataValue("coupon", null);
    }

    await t.commit();

    const refreshedCart = await Cart.findOne({
      where: { userId: userId },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // For remove operations, we don't have shipping information, so pass 0
    return res.json(
      await formatCartResponse(refreshedCart, undefined, undefined, 0)
    );
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

//  Clear Cart
export const clearCart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const cart = await Cart.findOne({ where: { userId }, transaction: t });

    if (cart) {
      // 1️⃣ Clear all cart products
      await CartProduct.destroy({
        where: { cartId: cart.id },
        transaction: t,
      });

      // 2️⃣ Clear coupon reference safely
      await Cart.update(
        { couponId: null }, // explicit DB update
        { where: { id: cart.id }, transaction: t }
      );

      // 3️⃣ Also clear in-memory association cache (for API response)
      (cart as any).setDataValue("coupon", null);
    }

    await t.commit();

    // 4️⃣ Refetch updated cart for response
    const refreshedCart = await Cart.findOne({
      where: { userId },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    return res.json(
      await formatCartResponse(refreshedCart, undefined, undefined, 0)
    );
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// Apply Coupon
export const applyCoupon = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { code } = req.body;
    if (!code)
      return res.status(400).json({ message: "Coupon code is required" });

    const coupon = await Coupon.findOne({
      where: { code, status: "active" },
      transaction: t,
    });
    if (!coupon)
      return res.status(404).json({ message: "Invalid or expired coupon" });

    let usage = await db.CouponUsage.findOne({
      where: { couponId: coupon.id, userId: userId },
      transaction: t,
    });
    if (!usage) {
      usage = await db.CouponUsage.create(
        { couponId: coupon.id, userId: userId, usedCount: 0 },
        { transaction: t }
      );
    }

    if (coupon.maxUsage && usage.usedCount >= coupon.maxUsage) {
      return res
        .status(400)
        .json({ message: "Coupon usage limit reached for this user" });
    }

    const cart = await Cart.findOrCreate({
      where: { userId: userId },
      defaults: { userId: userId },
      transaction: t,
    }).then(([c]) => c);

    cart.couponId = coupon.id;
    await cart.save({ transaction: t });

    await t.commit();

    const refreshedCart = await Cart.findOne({
      where: { userId: userId },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // For apply coupon operations, we don't have shipping information, so pass 0
    return res.json(
      await formatCartResponse(refreshedCart, undefined, undefined, 0)
    );
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// --- Helper: get or generate guestToken ---
function getGuestToken(req: Request): string {
  return (
    req.header("x-guest-token") ||
    (req.query.guestToken as string) ||
    (req.body.guestToken as string) ||
    uuidv4()
  );
}

// Get or Create Guest Cart
export const getOrCreateGuestCart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const guestToken = getGuestToken(req);

    let cart = await Cart.findOne({
      where: { guestToken },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
      order: [[{ model: CartProduct, as: "cartProducts" }, "id", "DESC"]],
    });

    if (!cart) {
      cart = await Cart.create({ guestToken });
    }

    // fetch valid options for size names
    const productIds = cart.cartProducts?.map((cp: any) => cp.productId) || [];
    let validOptions: Option[] = [];
    if (productIds.length) {
      const products = await Product.findAll({
        where: { id: productIds },
        attributes: ["id", "sizes"],
      });
      const allSizeIds = products.flatMap((p: any) => p.sizes || []);
      if (allSizeIds.length) {
        validOptions = await Option.findAll({
          where: { id: allSizeIds, optionType: "size", status: "active" },
        });
      }
    }

    // 🟢 Shipping estimation for guest user
    let estimatedShipping: number | null = null;
    let shippingBreakdown: any = null;
    let usedAddress: any = null;

    try {
      // 1️⃣ Guest provides state via query/body
      const guestState =
        (req.query.state as string) || (req.body.state as string);

      // Use state as-is (now lowercase) for calculating shipping
      if (guestState) {
        const normalizedState = guestState.toLowerCase();

        // 2️⃣ Calculate total weight safely
        // ✅ Fix: Use cart product weight instead of product weight for consistency with order flow
        const totalWeight =
          cart.cartProducts?.reduce(
            (sum: number, p: any) =>
              sum + (Number(p.weight) || 0) * Number(p.quantity || 0),
            0
          ) ?? 0;

        // ✅ Fix: Calculate shipping even if totalWeight is 0
        // Some shipping providers charge a minimum fee even for lightweight items
        if (totalWeight >= 0) {
          const shippingInfo = await calculateShipping(
            Math.max(0.1, totalWeight), // Ensure minimum weight for shipping calculation
            normalizedState
          );
          estimatedShipping = shippingInfo.totalWithTax;
          shippingBreakdown = shippingInfo;

          usedAddress = { state: normalizedState };
        }
      }
    } catch (err) {
      console.warn("⚠️ Guest shipping estimation failed:", err);
    }

    // ✅ Fix: Set simplifiedShipping if we have usedAddress, even without shippingBreakdown
    // This provides better feedback about shipping status
    let simplifiedShipping = null;
    if (usedAddress) {
      if (shippingBreakdown) {
        simplifiedShipping = {
          amount: shippingBreakdown.finalAmount, // ✅ Fix: Remove Math.round to preserve precision
          tax: shippingBreakdown.taxAmount, // ✅ Fix: Remove Math.round to preserve precision
          total: shippingBreakdown.totalWithTax, // ✅ Fix: Remove Math.round to preserve precision
          currency: "INR",
          label: `Shipping to ${usedAddress.state}`,
        };
      } else {
        // Provide a clear indication that shipping calculation failed or is not applicable
        simplifiedShipping = {
          amount: 0,
          tax: 0,
          total: 0,
          currency: "INR",
          label: `Shipping to ${usedAddress.state}`,
          note: "Shipping calculation not available",
        };
      }
    }

    // 🟣 Response
    // Format cart with shipping total included in grand total calculation
    const formattedCart = await formatCartResponse(
      cart,
      validOptions,
      usedAddress?.state,
      simplifiedShipping?.total || 0, // Pass shipping total
      simplifiedShipping?.tax || 0 // Pass shipping tax
    );

    let finalGuestResponse = {
      success: true,
      guestToken,
      data: {
        ...formattedCart,
        shipping: simplifiedShipping,
        shippingAddress: usedAddress
          ? {
              state: usedAddress.state,
              summary: `Shipping to ${usedAddress.state}`,
            }
          : null,
      },
    };

    // Remove the separate shipping addition since it's now included in the formattedCart
    // The grandTotal is already calculated with shipping included

    return res.status(200).json(finalGuestResponse);
  } catch (err) {
    next(err);
  }
};

// Add Product to Guest Cart
export const addProductToGuestCart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const guestToken = getGuestToken(req);
    const productId = Number(req.body.productId);
    const embroidery =
      req.body.embroidery === "true" || req.body.embroidery === true;
    const embroideryPosition = req.body.embroideryPosition;
    const sizes =
      typeof req.body.sizes === "string"
        ? JSON.parse(req.body.sizes)
        : req.body.sizes;

    const [cart] = await Cart.findOrCreate({
      where: { guestToken },
      defaults: { guestToken },
      transaction: t,
    });

    const product = await Product.findByPk(productId, {
      include: [{ association: "bulkOrders" }],
      transaction: t,
    });
    if (!product) throw new Error("Product not found");

    if (product.outOfStock) {
      return res.status(400).json({
        message: "This product is currently out of stock and cannot be ordered",
      });
    }
    if (!product.allowEmbroidery && req.body.embroidery === "true") {
      return res.status(400).json({
        message: "Embroidery is not allowed for this product",
      });
    }

    const validOptions = await Option.findAll({
      where: { id: product.sizes || [], optionType: "size", status: "active" },
      transaction: t,
    });
    const validSizeIds = validOptions.map((opt) => opt.id);

    let cartProduct = await CartProduct.findOne({
      where: { cartId: cart.id, productId },
      transaction: t,
    });

    let logoUrl: string | undefined;
    if (req.file) {
      logoUrl = await singleUpload(req.file, "cart/embroidery");
      if (cartProduct?.embroideryLogo) {
        try {
          await deleteImage(cartProduct.embroideryLogo);
        } catch (err) {
          console.warn("Failed to delete old embroidery logo:", err);
        }
      }
    }

    if (!cartProduct) {
      cartProduct = await CartProduct.create(
        {
          cartId: cart.id,
          productId,
          price: product.price!,
          weight: product.weight != null ? Number(product.weight) : null,
          embroidery,
          embroideryLogo: logoUrl ?? null,
          embroideryPosition,
          productName: product.title,
          sku: product.sku,
          hsn: product.hsn,
          productImage: product.featuredImage,
          quantity: 0,
          sizes: {},
        },
        { transaction: t }
      );
    } else {
      cartProduct.embroidery = embroidery;
      if (logoUrl) cartProduct.embroideryLogo = logoUrl;
      cartProduct.embroideryPosition = embroideryPosition;
      await cartProduct.save({ transaction: t });
    }

    // Merge sizes
    if (Array.isArray(sizes) && sizes.length) {
      const sizesMap: Record<string, number> = { ...cartProduct.sizes };
      sizes.forEach(({ id, quantity }: any) => {
        if (validSizeIds.includes(id)) {
          sizesMap[id] = (sizesMap[id] || 0) + quantity;
        } else {
          throw new Error(`Invalid size ID ${id} for this product`);
        }
      });
      cartProduct.sizes = sizesMap;
    }

    const totalQty = Object.values(cartProduct.sizes || {}).reduce(
      (sum, q) => sum + q,
      0
    );
    const dynamic = getApplicableBulkPrice(product, totalQty);
    const unitPrice = dynamic?.price ?? Number(product.price);
    const embroideryPerUnit = embroidery
      ? calculateEmbroideryCharge(totalQty) / totalQty
      : 0;

    cartProduct.quantity = totalQty;
    cartProduct.price = unitPrice;
    cartProduct.embroideryPrice = embroideryPerUnit;
    await cartProduct.save({ transaction: t });

    await t.commit();

    const refreshedCart = await Cart.findOne({
      where: { guestToken },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // For guest cart operations, we don't have shipping information, so pass 0
    const response = await formatCartResponse(
      refreshedCart,
      validOptions,
      undefined,
      0
    );
    return res.status(200).json({ success: true, guestToken, data: response });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// Update Guest Cart Product
export const updateGuestCartProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const guestToken = getGuestToken(req);
    const { cartProductId } = req.params;
    let { sizes, embroidery, embroideryPosition } = req.body;

    // 🧩 Find guest cart
    const cart = await Cart.findOne({ where: { guestToken } });
    if (!cart) return res.status(404).json({ message: "Guest cart not found" });

    // 🧩 Find cart product
    const cartProduct = await CartProduct.findByPk(cartProductId);
    if (!cartProduct)
      return res.status(404).json({ message: "Cart product not found" });

    // 🧩 Find linked product with bulk orders
    const product = await Product.findByPk(cartProduct.productId, {
      include: [{ association: "bulkOrders" }],
    });
    if (!product) throw new Error("Product not found");

    // 🧩 Validate size options
    const validOptions = await Option.findAll({
      where: { id: product.sizes || [], optionType: "size", status: "active" },
    });
    const validSizeIds = validOptions.map((opt) => opt.id);

    // 🪡 Update embroidery details - only update if explicitly provided
    if (embroidery !== undefined) {
      const hasEmbroidery = embroidery === "true" || embroidery === true;
      cartProduct.embroidery = hasEmbroidery;
    }

    if (embroideryPosition !== undefined) {
      cartProduct.embroideryPosition = embroideryPosition;
    }

    // 🧾 Parse sizes safely (from stringified JSON or array)
    if (typeof sizes === "string") {
      try {
        sizes = JSON.parse(sizes);
      } catch {
        throw new Error("Invalid sizes JSON");
      }
    }

    // 🧩 Replace existing sizes (no merge)
    if (Array.isArray(sizes)) {
      const sizesMap: Record<string, number> = {};

      sizes.forEach(({ id, quantity }: any) => {
        if (validSizeIds.includes(id)) {
          if (quantity > 0) sizesMap[id] = quantity;
        } else {
          throw new Error(`Invalid size ID ${id}`);
        }
      });

      cartProduct.sizes = sizesMap;
      cartProduct.changed("sizes", true); // ✅ Ensure Sequelize updates JSON field
    }

    // 📦 Recalculate totals
    const totalQty = Object.values(cartProduct.sizes || {}).reduce(
      (sum, q) => sum + q,
      0
    );
    const dynamic = getApplicableBulkPrice(product, totalQty);
    const unitPrice = dynamic?.price ?? Number(product.price);
    const embroideryPerUnit = cartProduct.embroidery
      ? calculateEmbroideryCharge(totalQty) / totalQty
      : 0;

    cartProduct.quantity = totalQty;
    cartProduct.price = unitPrice;
    cartProduct.embroideryPrice = embroideryPerUnit;

    await cartProduct.save();

    // 🔄 Refresh and return updated guest cart
    const refreshedCart = await Cart.findOne({
      where: { guestToken },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // For guest cart operations, we don't have shipping information, so pass 0
    const response = await formatCartResponse(
      refreshedCart,
      validOptions,
      undefined,
      0
    );
    return res.status(200).json({ success: true, data: response });
  } catch (err) {
    next(err);
  }
};

// Remove Guest Cart Product
export const removeGuestCartProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const { cartProductId } = req.params;
    const guestToken = getGuestToken(req);
    if (!guestToken) {
      await t.rollback();
      return res.status(400).json({ message: "Guest token required" });
    }

    const cart = await Cart.findOne({ where: { guestToken }, transaction: t });
    if (!cart) {
      await t.rollback();
      return res.status(404).json({ message: "Guest cart not found" });
    }

    // destroy the specific cartProduct scoped to this cart
    const destroyed = await CartProduct.destroy({
      where: { id: cartProductId, cartId: cart.id },
      transaction: t,
    });

    if (!destroyed) {
      // nothing deleted (maybe wrong id) — commit/rollback then respond
      await t.commit();
      return res
        .status(404)
        .json({ message: "Cart product not found in guest cart" });
    }

    // check remaining products within same transaction
    const remainingCount = await CartProduct.count({
      where: { cartId: cart.id },
      transaction: t,
    });

    if (remainingCount === 0) {
      // clear coupon reference in DB
      await Cart.update(
        { couponId: null },
        { where: { id: cart.id }, transaction: t }
      );

      // clear in-memory association for immediate response
      (cart as any).setDataValue("coupon", null);
    }

    await t.commit();

    // refetch cart (outside transaction) with associations for response
    const refreshedCart = await Cart.findOne({
      where: { guestToken },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // For guest cart operations, we don't have shipping information, so pass 0
    const response = await formatCartResponse(
      refreshedCart,
      undefined,
      undefined,
      0
    );
    return res.status(200).json({ success: true, data: response });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// Clear Guest Cart
export const clearGuestCart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const guestToken = getGuestToken(req);
    const cart = await Cart.findOne({ where: { guestToken } });
    if (!cart) return res.status(404).json({ message: "Guest cart not found" });

    // 1️⃣ Delete all products
    await CartProduct.destroy({ where: { cartId: cart.id } });

    // 2️⃣ Force clear coupon reference in the database (guaranteed)
    await Cart.update(
      { couponId: null }, // direct SQL update
      { where: { id: cart.id } }
    );

    // 3️⃣ Clear in-memory relation cache for response safety
    (cart as any).setDataValue("coupon", null);

    // 4️⃣ Respond
    return res.status(200).json({ success: true, message: "Cart cleared" });
  } catch (err) {
    next(err);
  }
};

export const applyCouponToGuestCart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    // 1️⃣ Get guest token
    const guestToken = getGuestToken(req);

    // 2️⃣ Validate input
    const { code } = req.body;
    if (!code)
      return res.status(400).json({ message: "Coupon code is required" });

    // 3️⃣ Find active coupon
    const coupon = await Coupon.findOne({
      where: { code, status: "active" },
      transaction: t,
    });
    if (!coupon)
      return res.status(404).json({ message: "Invalid or expired coupon" });

    // 4️⃣ Find or create guest cart
    const [cart] = await Cart.findOrCreate({
      where: { guestToken },
      defaults: { guestToken },
      transaction: t,
    });

    // 5️⃣ Apply coupon to guest cart
    cart.couponId = coupon.id;
    await cart.save({ transaction: t });

    await t.commit();

    // 6️⃣ Fetch refreshed cart
    const refreshedCart = await Cart.findOne({
      where: { guestToken },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // 7️⃣ Gather valid size options
    const productIds =
      refreshedCart?.cartProducts?.map((cp: any) => cp.productId) || [];
    let validOptions: Option[] = [];
    if (productIds.length) {
      const products = await Product.findAll({
        where: { id: productIds },
        attributes: ["id", "sizes"],
      });

      const allSizeIds = products.flatMap((p: any) => p.sizes || []);
      if (allSizeIds.length) {
        validOptions = await Option.findAll({
          where: { id: allSizeIds, optionType: "size", status: "active" },
        });
      }
    }

    // 8️⃣ Format response (same shape as logged-in user)
    // For guest cart operations, we don't have shipping information, so pass 0
    const response = await formatCartResponse(
      refreshedCart,
      validOptions,
      undefined,
      0
    );

    return res.status(200).json({ success: true, guestToken, data: response });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// Remove coupon from user's cart
export const removeCoupon = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const cart = await Cart.findOne({
      where: { userId },
      transaction: t,
    });

    if (!cart) {
      await t.commit();
      return res.status(404).json({ message: "Cart not found" });
    }

    // Remove coupon from cart
    cart.couponId = null;
    await cart.save({ transaction: t });

    await t.commit();

    const refreshedCart = await Cart.findOne({
      where: { userId: userId },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // For remove coupon operations, we don't have shipping information, so pass 0
    return res.json(
      await formatCartResponse(refreshedCart, undefined, undefined, 0)
    );
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// Remove coupon from guest cart
export const removeCouponFromGuestCart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const guestToken = getGuestToken(req);
    if (!guestToken) {
      return res.status(400).json({ message: "Guest token required" });
    }

    const cart = await Cart.findOne({ where: { guestToken } });
    if (!cart) return res.status(404).json({ message: "Guest cart not found" });

    // Remove coupon from cart
    cart.couponId = null;
    await cart.save();

    // Fetch refreshed cart
    const refreshedCart = await Cart.findOne({
      where: { guestToken },
      include: [
        {
          model: CartProduct,
          as: "cartProducts",
          include: [{ model: Product, as: "product" }],
        },
        { model: Coupon, as: "coupon" },
      ],
    });

    // Gather valid size options
    const productIds =
      refreshedCart?.cartProducts?.map((cp: any) => cp.productId) || [];
    let validOptions: Option[] = [];
    if (productIds.length) {
      const products = await Product.findAll({
        where: { id: productIds },
        attributes: ["id", "sizes"],
      });

      const allSizeIds = products.flatMap((p: any) => p.sizes || []);
      if (allSizeIds.length) {
        validOptions = await Option.findAll({
          where: { id: allSizeIds, optionType: "size", status: "active" },
        });
      }
    }

    // Format response (same shape as logged-in user)
    // For guest cart operations, we don't have shipping information, so pass 0
    const response = await formatCartResponse(
      refreshedCart,
      validOptions,
      undefined,
      0
    );

    return res.status(200).json({ success: true, guestToken, data: response });
  } catch (err) {
    next(err);
  }
};
