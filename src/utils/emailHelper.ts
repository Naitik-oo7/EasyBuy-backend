import nodemailer from "nodemailer";
import fs from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import dotenv from "dotenv";
import Option from "../models/option.model";
import ejs from "ejs";
import Order from "../models/order.model";
import OrderProduct from "../models/orderProduct.model";
import OrderBillingAddress from "../models/orderBillingAddress.model";
import OrderShippingAddress from "../models/orderShippingAddress.model";
import { calculateTax } from "./taxHelper";
import { getFileUrl } from "./awsS3";

dotenv.config();

// Create transporter from env vars with proper TLS configuration for Brevo
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 587),
  secure: false, // true for 465, false for others
  tls: {
    ciphers: "SSLv3",
    rejectUnauthorized: false, // optional: allow self-signed certs (for testing only)
  },
  auth:
    process.env.MAIL_USERNAME && process.env.MAIL_PASSWORD
      ? { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD }
      : undefined,
  logger: false, // Logs to console
  debug: true, // Shows SMTP traffic (low-level logs)
});

// Verify transporter at startup
transporter
  .verify()
  .then(() => {
    console.log(
      `✅ SMTP transporter ready (host=${process.env.MAIL_HOST}, port=${process.env.MAIL_PORT})`
    );
  })
  .catch((err: any) =>
    console.warn("SMTP transporter verification failed:", err.message)
  );

const TEMPLATE_DIR = path.join(process.cwd(), "src", "templates");

export async function sendOrderStatusEmail(
  to: string,
  order: any,
  newStatus: string
) {
  try {
    const templatePath = path.join(TEMPLATE_DIR, "orderStatusEmail.ejs");

    const addr = order.shippingAddress || {};

    // Load size options
    const allSizes = await Option.findAll({
      where: { optionType: "size" },
      attributes: ["id", "name"],
    });
    const sizeMap: Record<number, string> = {};
    allSizes.forEach((s: any) => (sizeMap[s.id] = s.name));

    // Build products array
    const products: any =
      (order.orderProducts || []).map((p: any, i: number) => {
        const sizeList = p.sizes
          ? Object.entries(p.sizes)
              .map(([id, qty]) => `${sizeMap[id as any] || id}: ${qty}`)
              .join(", ")
          : "-";

        // Use correct property names from OrderProduct model
        const price = Number(p.price || 0);
        const embroidery = Number(p.embroideryPrice || 0);
        const qty = Number(p.quantity || 0);
        const gstPercent = price > 2500 ? 18 : 5;
        const taxable = (price + embroidery) * qty;
        const gstAmount = (taxable * gstPercent) / 100;

        const totalNumber = taxable + gstAmount;

        return {
          PRODUCT_NAME: p.product_name || "-", // Keep as is
          SIZES: sizeList, // Keep as is
          SKU: p.sku || "-", // Keep as is
          HSN: p.hsn || "-", // Keep as is
          EMBROIDERY_STATUS: embroidery > 0 ? "Yes" : "No", // Keep as is
          QUANTITY: qty, // Keep as is
          PRICE: `₹${price.toFixed(2)}`, // Updated from unitPrice to price
          EMBROIDERY_COST: `₹${embroidery.toFixed(2)}`, // Keep as is
          GST_PERCENT: `${gstPercent}%`, // Keep as is
          ITEM_TOTAL: `₹${totalNumber.toFixed(2)}`, // ✔ GST included!
        };
      }) || [];

    order.products = products;

    const html = await ejs.renderFile(templatePath, {
      ORDER_NUMBER: order.invoiceNumber || order.id,
      STATUS_MESSAGE: newStatus,
      STATUS_DATE:
        new Date().toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        }) + " IST",
      TRACKING_URL: order.trackingUrl || "#",
      TRACKING_ID: order.trackingId || "N/A",
      CUSTOMER_NAME: addr.name || "Valued Customer",
      CUSTOMER_EMAIL: addr.email || to,
      CUSTOMER_PHONE: addr.mobileNumber || "",
      ADDRESS_LINE_1: addr.address || "",
      ADDRESS_LINE_2: `${addr.city || ""}, ${addr.state || ""} - ${
        addr.pinCode || ""
      }`,
      ADDRESS_LINE_3: addr.locality || "",
      ORDER_DATE:
        new Date(order.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        }) + " IST",
      SUBTOTAL: `₹${Number(order.subtotal || 0).toFixed(2)}`,
      EMBROIDERY_TOTAL: `₹${Number(order.embroideryTotal || 0).toFixed(2)}`,
      SHIPPING: `₹${Number(order.shippingTotal || 0).toFixed(2)}`,
      GST_AMOUNT: `₹${Number(order.taxTotal || 0).toFixed(2)}`,
      TOTAL: `₹${Number(order.grandTotal || 0).toFixed(2)}`,
      products,
    });

    await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to,
      subject: `Order ${order.invoiceNumber} - Status Updated to ${newStatus}`,
      html,
    });

    console.log(`✅ Order status email sent to ${to}`);
  } catch (err) {
    console.error("❌ Error sending order status email:", err);
  }
}

export async function sendOrderPlacedEmail(to: string, order: any) {
  try {
    if (!to || !to.includes("@")) {
      console.warn(`⚠️ Skipping email: invalid recipient (${to})`);
      return;
    }
    if (!Array.isArray(order.orderProducts)) {
      order = await Order.findByPk(order.id, {
        include: [
          { model: OrderProduct, as: "orderProducts" },
          { model: OrderShippingAddress, as: "shippingAddress" },
          { model: OrderBillingAddress, as: "billingAddress" },
        ],
      });
    }

    const templatePath = path.join(TEMPLATE_DIR, "orderPlacedEmail.ejs");
    const formatINR = (n: number) =>
      `₹${Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`;

    // 📦 Load size options
    const sizeOptions = await Option.findAll({
      where: { optionType: "size" },
      attributes: ["id", "name"],
    });
    const sizeMap: Record<number, string> = {};
    sizeOptions.forEach((s: any) => (sizeMap[s.id] = s.name));

    const getTaxRate = (price: number) => (price > 2500 ? 18 : 5);
    const products = Array.isArray(order.orderProducts)
      ? order.orderProducts
      : [];

    const itemsHTML =
      products
        .map((p: any, i: number) => {
          const sizeList =
            Object.entries(p.sizes || {})
              .map(([id, qty]) => `${sizeMap[Number(id)] || id}: ${qty}`)
              .join(", ") || "-";

          const price = Number(p.price || 0);
          const embroidery = Number(p.embroideryPrice || 0);
          const qty = Number(p.quantity || 1);

          // Base amount (price + embroidery) * qty
          const baseAmount = (price + embroidery) * qty;

          // GST using same helper as invoice/cart/order
          const taxInfo = calculateTax(
            price,
            qty,
            embroidery,
            (order.shippingAddress?.state || "").toLowerCase(),
            "delhi"
          );

          // Final total INCLUDING GST
          const totalCost = baseAmount + (taxInfo.taxAmount || 0);

          const taxRate = getTaxRate(price);

          // Product image URL
          const productImageUrl = p.productImage
            ? getFileUrl(p.productImage, "products/featured-image")
            : "";

          return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${i + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">
            ${
              productImageUrl
                ? `<img src="${productImageUrl}" alt="Product" style="width:60px;height:80px;object-fit:cover;border-radius:4px;display:block;" />`
                : "-"
            }
          </td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">
            <strong>${p.product_name}</strong><br/>
            <span style="font-size:11px;color:#555;">
              Size: ${sizeList}<br/>
              SKU: ${p.sku || "-"}<br/>
              Embroidery: ${p.embroideryPrice && embroidery > 0 ? "Yes" : "No"}
           </span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${
            p.quantity
          }</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${formatINR(
            price
          )}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${formatINR(
            embroidery
          )}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${taxRate}%</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${formatINR(
            totalCost
          )}</td>
        </tr>`;
        })
        .join("") || "";

    const shipping =
      order.shippingAddress?.toJSON?.() || order.shippingAddress || {};

    // 🧾 Determine dynamic tax label and percentage
    let taxLabel = "GST";
    let taxPercent = "18%"; // default fallback

    try {
      const buyerState = order.shippingAddress?.state || "";
      const sellerState = "delhi"; // adjust if dynamic later

      // Determine IGST vs CGST+SGST
      if (
        buyerState &&
        buyerState.toLowerCase() === sellerState.toLowerCase()
      ) {
        taxLabel = "CGST + SGST";
      } else {
        taxLabel = "IGST";
      }

      // Try to infer rate from first product or taxTotal/subtotal
      if (
        Array.isArray(order.orderProducts) &&
        order.orderProducts.length > 0
      ) {
        const firstProduct = order.orderProducts[0];
        const inferredRate =
          firstProduct?.taxRate || getTaxRate(firstProduct?.price || 0);
        taxPercent = `${inferredRate}%`;
      }
    } catch (e) {
      console.warn("⚠️ Could not determine dynamic tax rate:", e);
    }

    const INVOICE_JWT_SECRET = process.env.INVOICE_JWT_SECRET;
    if (!INVOICE_JWT_SECRET) {
      console.error("❌ Missing INVOICE_JWT_SECRET");
      throw new Error("Server misconfiguration: INVOICE_JWT_SECRET not set");
    }
    const buyerEmail =
      order.shippingAddress?.email || order.user?.email || to || "";
    const token = jwt.sign(
      { orderId: order.id, email: buyerEmail },
      INVOICE_JWT_SECRET,
      { expiresIn: "7d" } // choose 1d/3d/7d as you prefer
    );

    // --- MATCH INVOICE SUMMARY CALC ---

    const round2 = (v: number) => Math.round(v * 100) / 100;

    // Extract shipping fields
    const buyerState = String(shipping.state || "").toLowerCase();
    const sellerState = "delhi";
    const sameState = buyerState === sellerState;

    // Embroidery total
    let embroideryTotal = 0;
    let cgstSum = 0;
    let sgstSum = 0;
    let igstSum = 0;

    // Calculate original tax values first
    let originalTaxTotal = 0;
    const originalProductTaxes: any[] = [];

    // Calculate totals EXACTLY like invoice
    order.orderProducts.forEach((p: any) => {
      const qty = Number(p.quantity);
      const price = Number(p.price);
      const emb = Number(p.embroideryPrice || 0);

      embroideryTotal += emb * qty;

      const taxInfo = calculateTax(price, qty, emb, buyerState, sellerState);

      originalTaxTotal += taxInfo.taxAmount || 0;
      originalProductTaxes.push({
        taxAmount: taxInfo.taxAmount || 0,
        cgst: taxInfo.cgst || 0,
        sgst: taxInfo.sgst || 0,
        igst: taxInfo.igst || 0,
      });

      cgstSum += taxInfo.cgst || 0;
      sgstSum += taxInfo.sgst || 0;
      igstSum += taxInfo.igst || 0;
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

        // Adjust each product's tax values proportionally
        originalProductTaxes.forEach((origTax) => {
          const adjustedCgst = round2(origTax.cgst * taxRatio);
          const adjustedSgst = round2(origTax.sgst * taxRatio);
          const adjustedIgst = round2(origTax.igst * taxRatio);

          // Update the sums
          cgstSum += adjustedCgst;
          sgstSum += adjustedSgst;
          igstSum += adjustedIgst;
        });
      }
    }

    // PRODUCT SUBTOTAL (excluding embroidery)
    const productSubTotalRaw = round2(order.subtotal - embroideryTotal);
    const productSubTotal = `₹${productSubTotalRaw.toFixed(2)}`;

    // PRODUCT GST ONLY
    const productGstOnly = sameState
      ? round2(cgstSum + sgstSum)
      : round2(igstSum);

    const productGstAmountDisplay = `₹${productGstOnly.toFixed(2)}`;

    // SHIPPING BASE + SHIPPING TAX
    const shippingBase = round2(order.shippingBase || 0);
    const shippingBaseDisplay = `₹${shippingBase.toFixed(2)}`;

    const shippingTax = round2(
      order.shippingTax ?? order.shippingTotal - order.shippingTotal / 1.18
    );
    const shippingTaxDisplay = `₹${shippingTax.toFixed(2)}`;

    // GST LABEL (same as invoice)
    const gstTypeLabel = sameState ? "CGST / SGST (Product)" : "IGST (Product)";

    const totalGstDisplay = `₹${round2(productGstOnly + shippingTax).toFixed(
      2
    )}`;

    const payableDisplay = `₹${order.grandTotal.toFixed(2)}`;

    const couponDiscount = round2(order.discount || order.couponDiscount || 0);
    const couponDiscountDisplay = `₹${couponDiscount.toFixed(2)}`;

    // Calculate expected delivery date based on total quantity
    const totalQuantity =
      order.orderProducts?.reduce((sum: number, product: any) => {
        return sum + (product.quantity || 0);
      }, 0) || 0;

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

    const data = {
      customerName: shipping.name || "Valued Customer",
      customerEmail: shipping.email || "",
      customerPhone: shipping.mobileNumber || "",
      customerAddress: shipping.address || "",
      customerCity: shipping.city || "",
      customerState: shipping.state || "",
      customerPincode: shipping.pinCode || "",
      orderNumber: order.invoiceNumber || String(order.id),
      orderDate:
        new Date(order.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        }) + " IST",
      expectedDeliverDate,
      // subtotal: formatINR(order.subtotal),
      // embroidery: formatINR(order.embroideryTotal || 0),
      // shipping: formatINR(order.shippingTotal),
      // taxLabel,
      // taxPercent,
      // tax: formatINR(order.taxTotal),
      // grandTotal: formatINR(order.grandTotal),

      productSubTotal,
      embroideryDisplay: `₹${embroideryTotal.toFixed(2)}`,
      embroideryTotalRaw: embroideryTotal,

      couponDiscount,
      couponDiscountDisplay,
      couponDiscountRaw: couponDiscount,

      gstTypeLabel,
      productGstAmountDisplay,
      shippingBaseDisplay,
      shippingTaxDisplay,
      totalGstDisplay,
      payableDisplay,

      itemsHTML,
      invoiceDownloadLink: `${process.env.APP_BASE_URL}/api/v1/public/invoice?token=${token}&download=1`,
      isReceiver: false,
    };

    const html = await ejs.renderFile(templatePath, data);

    const info = await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to,
      subject: `Thank you for your order #${order.invoiceNumber || order.id}`,
      html,
    });

    console.log(`✅ Order placed email sent to ${to}`);
    console.log("📩 Brevo response:", info);
  } catch (err) {
    console.error("❌ Error sending order placed email:", err);
  }
}

export async function sendWelcomeEmail(to: string, name: string) {
  try {
    if (!to || !to.includes("@")) {
      console.warn(`⚠️ Skipping welcome email: invalid recipient (${to})`);
      return;
    }

    const templatePath = path.join(TEMPLATE_DIR, "welcomeEmail.ejs");

    const data = {
      NAME: name || "Valued Customer",
      SHOP_URL: "https://www.easybuy.com",
      SUPPORT_URL: "https://www.easybuy.com/contact",
      X_OR_TWITTER_URL: "https://twitter.com/easybuy",
      FACEBOOK_URL: "https://www.facebook.com/ueasybuydesign/",
      INSTAGRAM_URL: "https://www.instagram.com/easybuy_official/",
      LINKEDIN_URL: "https://in.linkedin.com/company/easybuy",
      WHATSAPP_URL: "https://wa.me/918860300234",
    };

    const html = await ejs.renderFile(templatePath, data);

    await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to,
      subject: `You're all set, ${name} — welcome to Easy Buy 🎉`,
      html,
    });

    console.log(`✅ Welcome email sent to ${to}`);
  } catch (err) {
    console.error("❌ Error sending welcome email:", err);
  }
}

export async function sendContactEmail({
  firstName,
  lastName,
  email,
  phone,
  message,
}: any) {
  const html = `
  <div style="background-color:#f6f9fc;padding:40px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.05);overflow:hidden;">
      <div style="background:#1a73e8;color:#ffffff;padding:20px 30px;text-align:center;">
        <h1 style="margin:0;font-size:22px;">📬 New Contact Message</h1>
      </div>
      <div style="padding:30px;color:#333333;">
        <p style="font-size:16px;margin-bottom:10px;"><strong>Name:</strong> ${firstName} ${
    lastName || ""
  }</p>
        <p style="font-size:16px;margin-bottom:10px;"><strong>Email:</strong> <a href="mailto:${email}" style="color:#1a73e8;text-decoration:none;">${email}</a></p>
        <p style="font-size:16px;margin-bottom:10px;"><strong>Phone:</strong> ${
          phone || "-"
        }</p>
        <p style="font-size:16px;margin:20px 0 10px;"><strong>Message:</strong></p>
        <div style="background:#f2f4f8;padding:15px;border-radius:6px;font-size:15px;line-height:1.6;color:#444;">${message}</div>
      </div>
      <div style="background:#f6f9fc;padding:15px;text-align:center;font-size:13px;color:#777;">
        <p style="margin:0;">This email was sent from the <strong>Easy Buy Contact Us</strong> form.</p>
        <p style="margin:5px 0 0;">© ${new Date().getFullYear()} Easy Buy. All rights reserved.</p>
      </div>
    </div>
  </div>
  `;

  console.log("Using FROM:", process.env.MAIL_FROM_NAME);
  console.log("Sending TO:", process.env.CONTACT_RECEIVER);

  const receivers = (process.env.CONTACT_RECEIVER || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  await transporter.sendMail({
    from:
      process.env.MAIL_FROM_NAME ||
      `"Easy Buy" <${process.env.MAIL_USERNAME}>`,
    to: receivers,
    replyTo: email,
    subject: `New Contact Inquiry - ${firstName} ${lastName || ""}`,
    html,
  });

  console.log(`✅ Contact inquiry email sent to Easy Buy from ${email}`);
}

export async function sendCareerEmail({
  name,
  lastName,
  phone,
  email,
  applyFor,
  message,
  resumeUrl,
}: any) {
  const html = `
  <div style="background-color:#f6f9fc;padding:40px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.05);overflow:hidden;">
      <div style="background:#1a73e8;color:#ffffff;padding:20px 30px;text-align:center;">
        <h1 style="margin:0;font-size:22px;">💼 New Job Application</h1>
      </div>
      <div style="padding:30px;color:#333333;">
        <p style="font-size:16px;margin-bottom:10px;"><strong>Name:</strong> ${name} ${
    lastName || ""
  }</p>
        <p style="font-size:16px;margin-bottom:10px;"><strong>Email:</strong> <a href="mailto:${email}" style="color:#1a73e8;text-decoration:none;">${email}</a></p>
        <p style="font-size:16px;margin-bottom:10px;"><strong>Phone:</strong> ${
          phone || "-"
        }</p>
        <p style="font-size:16px;margin-bottom:10px;"><strong>Position Applied For:</strong> ${applyFor}</p>
        <p style="font-size:16px;margin:20px 0 10px;"><strong>Message:</strong></p>
        <div style="background:#f2f4f8;padding:15px;border-radius:6px;font-size:15px;line-height:1.6;color:#444;">${message}</div>
        ${
          resumeUrl
            ? `<p style="margin-top:20px;font-size:16px;"><strong>Resume:</strong> <a href="${resumeUrl}" target="_blank" style="color:#1a73e8;text-decoration:none;">Download Resume</a></p>`
            : ""
        }
      </div>
      <div style="background:#f6f9fc;padding:15px;text-align:center;font-size:13px;color:#777;">
        <p style="margin:0;">This email was sent from the <strong>Easy Buy Careers</strong> page.</p>
        <p style="margin:5px 0 0;">© ${new Date().getFullYear()} Easy Buy. All rights reserved.</p>
      </div>
    </div>
  </div>
  `;

  const fromEmail =
    `"Easy Buy Careers" <${process.env.MAIL_FROM_NAME}>` ||
    `"Easy Buy Careers" <no-reply@easybuy.com>`;
  const receivers = (process.env.CAREER_RECEIVER || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  console.log("📤 Preparing to send career email...");
  console.log("   From:", fromEmail);
  console.log("   To:", receivers);
  console.log("   Reply-To:", email);
  console.log("   Subject:", `New Job Application - ${applyFor}`);

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM_NAME,
      to: receivers,
      replyTo: email,
      subject: `New Job Application - ${applyFor}`,
      html,
    });

    console.log("✅ Career email successfully sent!");
    console.log("   Message ID:", info.messageId);
    console.log("   Sent to:", receivers);
  } catch (err: any) {
    console.error("❌ Failed to send career email:");
    console.error("   Error:", err.message || err);
  }
}

// export const sendNewsletterWelcomeEmail = async (email: string) => {
//   await transporter.sendMail({
//     to: email,
//     subject: "Welcome to the easybuy Newsletter",
//     html: `
//       <h2>Thanks for subscribing!</h2>
//       <p>You'll now receive our latest offers, updates, and news directly in your inbox.</p>
//     `,
//   });
// };

export async function sendPasswordResetOtp(to: string, otp: string) {
  try {
    await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to,
      subject: "Your Password Reset OTP",
      html: `
        <div style="font-family: Arial; font-size: 15px; color: #333;">
          <p>Dear User,</p>
          <p>Your OTP to reset your password is:</p>
          <h2 style="background:#000; color:#fff; display:inline-block; padding:6px 12px; border-radius:4px;">
            ${otp}
          </h2>
          <p>This OTP is valid for 10 minutes.</p>
          <p>If you did not request this, please ignore the email.</p>
        </div>
      `,
    });

    console.log(`📧 Password reset OTP email sent to ${to}`);
  } catch (err) {
    console.error("❌ Failed to send password reset email:", err);
    throw new Error("Failed to send OTP email");
  }
}

// Corporate user signup - notify user that account is awaiting approval
export async function sendCorporateUserAwaitingApprovalEmail(
  to: string,
  userName: string,
  corporateName: string
) {
  try {
    if (!to || !to.includes("@")) {
      console.warn(`⚠️ Skipping email: invalid recipient (${to})`);
      return;
    }

    const templatePath = path.join(
      TEMPLATE_DIR,
      "corporateUserAwaitingApproval.ejs"
    );

    const data = {
      userName: userName || "Valued Customer",
      userEmail: to,
      corporateName: corporateName || "your organization",
    };

    const html = await ejs.renderFile(templatePath, data);

    await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to,
      subject: `Your Account is Awaiting Approval - ${corporateName}`,
      html,
    });

    console.log(`✅ Corporate user awaiting approval email sent to ${to}`);
  } catch (err) {
    console.error(
      "❌ Error sending corporate user awaiting approval email:",
      err
    );
  }
}

// Corporate user signup - notify corporate admin about new user
export async function sendCorporateNewUserNotification(
  to: string,
  corporateName: string,
  newUser: {
    name: string;
    email: string;
    mobile: string;
    designation?: string;
    dealerCode?: string;
  }
) {
  try {
    if (!to || !to.includes("@")) {
      console.warn(`⚠️ Skipping email: invalid recipient (${to})`);
      return;
    }

    const templatePath = path.join(
      TEMPLATE_DIR,
      "corporateNewUserNotification.ejs"
    );

    const data = {
      corporateName: corporateName || "Corporate",
      userName: newUser.name || "New User",
      userEmail: newUser.email || "N/A",
      userMobile: newUser.mobile || "N/A",
      userDesignation: newUser.designation || "N/A",
      dealerCode: newUser.dealerCode || null,
      corporateDashboardUrl: `https://www.easybuy.com/?corporate=corporate-login`,
    };

    const html = await ejs.renderFile(templatePath, data);

    // Send email to the primary recipient
    await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to,
      subject: `New User Registration - ${newUser.name} Awaiting Approval`,
      html,
    });

    console.log(`✅ Corporate new user notification email sent to ${to}`);

    // Also send email to ORDER_RECEIVER addresses if configured
    // Commenting out as per requirement to only send to corporate
    /*
    const orderReceivers = (process.env.ORDER_RECEIVER || "")
      .split(",")
      .map((e) => e.trim())
      .filter((email) => email && email.includes("@"));

    if (orderReceivers.length > 0) {
      await transporter.sendMail({
        from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
        to: orderReceivers,
        subject: `New User Registration - ${newUser.name} Awaiting Approval`,
        html,
      });

      // console.log(
      //   `✅ Corporate new user notification email also sent to ORDER_RECEIVER: ${orderReceivers.join(
      //     ", "
      //   )}`
      // );
    }
    */
  } catch (err) {
    console.error(
      "❌ Error sending corporate new user notification email:",
      err
    );
  }
}

// Corporate user approved - notify user that their account is now active
export async function sendCorporateUserApprovedEmail(
  to: string,
  userName: string,
  loginPortalUrl: string
) {
  try {
    if (!to || !to.includes("@")) {
      console.warn(`⚠️ Skipping email: invalid recipient (${to})`);
      return;
    }

    const templatePath = path.join(TEMPLATE_DIR, "corporateUserApproved.ejs");

    const data = {
      userName: userName || "Valued Customer",
      loginPortalUrl: loginPortalUrl || `${process.env.APP_BASE_URL}/login`,
    };

    const html = await ejs.renderFile(templatePath, data);

    await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to,
      subject: "Your Corporate Account Has Been Approved",
      html,
    });

    console.log(`✅ Corporate user approved email sent to ${to}`);
  } catch (err) {
    console.error("❌ Error sending corporate user approved email:", err);
  }
}

export async function sendOrderReceiverNotification(order: any) {
  try {
    const receivers = (process.env.ORDER_RECEIVER || "")
      .split(",")
      .map((e) => e.trim())
      .filter((email) => email && email.includes("@")); // ✅ Filter invalid emails

    if (!receivers.length) {
      console.warn("⚠️ No ORDER_RECEIVER configured, skipping notification");
      return;
    }

    // ✅ Send emails in parallel (faster)
    await Promise.all(
      receivers.map((receiver) =>
        sendOrderPlacedEmailToReceiver(receiver, order)
      )
    );

    console.log(
      `✅ Order placed email sent to ORDER_RECEIVER: ${receivers.join(", ")}`
    );
  } catch (err) {
    console.error("❌ Error sending order receiver notification:", err);
  }
}

export async function sendInquiryEmail(inquiry: any, product?: any) {
  try {
    const templatePath = path.join(TEMPLATE_DIR, "inquiryEmail.ejs");

    // Format the date with explicit timezone (IST)
    const createdAt =
      new Date(inquiry.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
        hour12: true,
      }) + " IST";

    // Get image URL if exists using the standard getFileUrl function
    const imageUrl = inquiry.image
      ? getFileUrl(inquiry.image, "inquiries")
      : null;

    const data = {
      name: inquiry.name,
      companyName: inquiry.companyName,
      mobile: inquiry.mobile,
      type: inquiry.type,
      category: inquiry.category || null,
      noOfUniform: inquiry.noOfUniform,
      description: inquiry.description,
      sourcePage: inquiry.sourcePage,
      isReselling: inquiry.isReselling,
      product: product
        ? {
            title: product.title,
            sku: product.sku,
          }
        : null,
      imageUrl,
      createdAt,
    };

    const html = await ejs.renderFile(templatePath, data);

    const receivers = (process.env.INQUIRY_RECEIVER || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (!receivers.length) {
      console.warn(
        "⚠️ No CONTACT_RECEIVER configured, skipping inquiry notification"
      );
      return;
    }

    await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to: receivers,
      subject: inquiry.category
        ? `New Inquiry: ${inquiry.name} - ${inquiry.category}`
        : `New Inquiry: ${inquiry.name}`,
      html,
    });

    console.log(`✅ Inquiry email sent to inquiry receiver`);
  } catch (err) {
    console.error("❌ Error sending inquiry email:", err);
  }
}

export async function sendOrderPlacedEmailToReceiver(to: string, order: any) {
  try {
    if (!to || !to.includes("@")) {
      console.warn(`⚠️ Skipping email: invalid recipient (${to})`);
      return;
    }

    if (!Array.isArray(order.orderProducts)) {
      order = await Order.findByPk(order.id, {
        include: [
          { model: OrderProduct, as: "orderProducts" },
          { model: OrderShippingAddress, as: "shippingAddress" },
          { model: OrderBillingAddress, as: "billingAddress" },
        ],
      });
    }

    const templatePath = path.join(TEMPLATE_DIR, "orderPlacedEmail.ejs");
    const formatINR = (n: number) =>
      `₹${Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`;

    // 📦 Load size options
    const sizeOptions = await Option.findAll({
      where: { optionType: "size" },
      attributes: ["id", "name"],
    });
    const sizeMap: Record<number, string> = {};
    sizeOptions.forEach((s: any) => (sizeMap[s.id] = s.name));

    const getTaxRate = (price: number) => (price > 2500 ? 18 : 5);
    const products = Array.isArray(order.orderProducts)
      ? order.orderProducts
      : [];

    const itemsHTML =
      products
        .map((p: any, i: number) => {
          const sizeList =
            Object.entries(p.sizes || {})
              .map(([id, qty]) => `${sizeMap[Number(id)] || id}: ${qty}`)
              .join(", ") || "-";

          const price = Number(p.price || 0);
          const embroidery = Number(p.embroideryPrice || 0);
          const qty = Number(p.quantity || 1);

          const baseAmount = (price + embroidery) * qty;

          const taxInfo = calculateTax(
            price,
            qty,
            embroidery,
            (order.shippingAddress?.state || "").toLowerCase(),
            "delhi"
          );

          const totalCost = baseAmount + (taxInfo.taxAmount || 0);
          const taxRate = getTaxRate(price);

          const productImageUrl = p.productImage
            ? getFileUrl(p.productImage, "products/featured-image")
            : "";

          return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${i + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">
            ${
              productImageUrl
                ? `<img src="${productImageUrl}" alt="Product" style="width:60px;height:80px;object-fit:cover;border-radius:4px;display:block;" />`
                : "-"
            }
          </td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">
            <strong>${p.product_name}</strong><br/>
            <span style="font-size:11px;color:#555;">
              Size: ${sizeList}<br/>
              SKU: ${p.sku || "-"}<br/>
              Embroidery: ${p.embroideryPrice && embroidery > 0 ? "Yes" : "No"}
           </span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${
            p.quantity
          }</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${formatINR(
            price
          )}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${formatINR(
            embroidery
          )}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${taxRate}%</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${formatINR(
            totalCost
          )}</td>
        </tr>`;
        })
        .join("") || "";

    const shipping =
      order.shippingAddress?.toJSON?.() || order.shippingAddress || {};

    // 🧾 Determine dynamic tax label and percentage
    let taxLabel = "GST";
    let taxPercent = "18%"; // default fallback

    try {
      const buyerState = order.shippingAddress?.state || "";
      const sellerState = "delhi"; // adjust if dynamic later

      // Determine IGST vs CGST+SGST
      if (
        buyerState &&
        buyerState.toLowerCase() === sellerState.toLowerCase()
      ) {
        taxLabel = "CGST + SGST";
      } else {
        taxLabel = "IGST";
      }

      // Try to infer rate from first product or taxTotal/subtotal
      if (
        Array.isArray(order.orderProducts) &&
        order.orderProducts.length > 0
      ) {
        const firstProduct = order.orderProducts[0];
        const inferredRate =
          firstProduct?.taxRate || getTaxRate(firstProduct?.price || 0);
        taxPercent = `${inferredRate}%`;
      }
    } catch (e) {
      console.warn("⚠️ Could not determine dynamic tax rate:", e);
    }

    const INVOICE_JWT_SECRET = process.env.INVOICE_JWT_SECRET;
    if (!INVOICE_JWT_SECRET) {
      console.error("❌ Missing INVOICE_JWT_SECRET");
      throw new Error("Server misconfiguration: INVOICE_JWT_SECRET not set");
    }

    // 🔹 NORMAL INVOICE TOKEN (unchanged behavior)
    const buyerEmail =
      order.shippingAddress?.email || order.user?.email || to || "";

    const invoiceToken = jwt.sign(
      { orderId: order.id, email: buyerEmail },
      INVOICE_JWT_SECRET
    );

    // 🔹 INTERNAL TOKEN (ONLY ADDITION)
    const internalToken = jwt.sign(
      { orderId: order.id, scope: "internal" },
      INVOICE_JWT_SECRET
    );

    const orderFormLink = `${process.env.APP_BASE_URL}/api/v1/public/order-form?token=${internalToken}`;

    const packingSlipLink = `${process.env.APP_BASE_URL}/api/v1/public/packing-slip?token=${internalToken}`;

    const round2 = (v: number) => Math.round(v * 100) / 100;

    const buyerState = String(shipping.state || "").toLowerCase();
    const sellerState = "delhi";
    const sameState = buyerState === sellerState;

    let embroideryTotal = 0;
    let cgstSum = 0;
    let sgstSum = 0;
    let igstSum = 0;

    let originalTaxTotal = 0;
    const originalProductTaxes: any[] = [];

    order.orderProducts.forEach((p: any) => {
      const qty = Number(p.quantity);
      const price = Number(p.price);
      const emb = Number(p.embroideryPrice || 0);

      embroideryTotal += emb * qty;

      const taxInfo = calculateTax(price, qty, emb, buyerState, sellerState);

      originalTaxTotal += taxInfo.taxAmount || 0;
      originalProductTaxes.push({
        taxAmount: taxInfo.taxAmount || 0,
        cgst: taxInfo.cgst || 0,
        sgst: taxInfo.sgst || 0,
        igst: taxInfo.igst || 0,
      });
      cgstSum += taxInfo.cgst || 0;
      sgstSum += taxInfo.sgst || 0;
      igstSum += taxInfo.igst || 0;
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

        // Adjust each product's tax values proportionally
        originalProductTaxes.forEach((origTax) => {
          const adjustedCgst = round2(origTax.cgst * taxRatio);
          const adjustedSgst = round2(origTax.sgst * taxRatio);
          const adjustedIgst = round2(origTax.igst * taxRatio);

          // Update the sums
          cgstSum += adjustedCgst;
          sgstSum += adjustedSgst;
          igstSum += adjustedIgst;
        });
      }
    }

    // PRODUCT SUBTOTAL (excluding embroidery)
    const productSubTotalRaw = round2(order.subtotal - embroideryTotal);
    const productSubTotal = `₹${productSubTotalRaw.toFixed(2)}`;

    const productGstOnly = sameState
      ? round2(cgstSum + sgstSum)
      : round2(igstSum);

    const productGstAmountDisplay = `₹${productGstOnly.toFixed(2)}`;

    // SHIPPING BASE + SHIPPING TAX
    const shippingBase = round2(order.shippingBase || 0);
    const shippingBaseDisplay = `₹${shippingBase.toFixed(2)}`;

    const shippingTax = round2(
      order.shippingTax ?? order.shippingTotal - order.shippingTotal / 1.18
    );
    const shippingTaxDisplay = `₹${shippingTax.toFixed(2)}`;

    // GST LABEL (same as invoice)
    const gstTypeLabel = sameState ? "CGST / SGST (Product)" : "IGST (Product)";

    const totalGstDisplay = `₹${round2(productGstOnly + shippingTax).toFixed(
      2
    )}`;

    const payableDisplay = `₹${order.grandTotal.toFixed(2)}`;

    const couponDiscount = round2(order.discount || order.couponDiscount || 0);
    const couponDiscountDisplay = `₹${couponDiscount.toFixed(2)}`;

    // Calculate expected delivery date based on total quantity
    const totalQuantity =
      order.orderProducts?.reduce((sum: number, product: any) => {
        return sum + (product.quantity || 0);
      }, 0) || 0;

    let expectedDeliverDate = "";
    if (totalQuantity < 5) {
      expectedDeliverDate = "7-8 working days";
    } else if (totalQuantity >= 5 && totalQuantity < 20) {
      expectedDeliverDate = "8-10 working days";
    } else if (totalQuantity >= 20 && totalQuantity < 50) {
      expectedDeliverDate = "12-15 working days";
    } else if (totalQuantity >= 50) {
      expectedDeliverDate = "Please contact our support team for timelines";
    }

    const data = {
      customerName: shipping.name || "Valued Customer",
      customerEmail: shipping.email || "",
      customerPhone: shipping.mobileNumber || "",
      customerAddress: shipping.address || "",
      customerCity: shipping.city || "",
      customerState: shipping.state || "",
      customerPincode: shipping.pinCode || "",
      orderNumber: order.invoiceNumber || String(order.id),
      orderDate:
        new Date(order.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        }) + " IST",
      expectedDeliverDate,
      // subtotal: formatINR(order.subtotal),
      // embroidery: formatINR(order.embroideryTotal || 0),
      // shipping: formatINR(order.shippingTotal),
      // taxLabel,
      // taxPercent,
      // tax: formatINR(order.taxTotal),
      // grandTotal: formatINR(order.grandTotal),

      productSubTotal,
      embroideryDisplay: `₹${embroideryTotal.toFixed(2)}`,
      embroideryTotalRaw: embroideryTotal,

      couponDiscount,
      couponDiscountDisplay,
      couponDiscountRaw: couponDiscount,

      gstTypeLabel,
      productGstAmountDisplay,
      shippingBaseDisplay,
      shippingTaxDisplay,
      totalGstDisplay,
      payableDisplay,

      itemsHTML,
      invoiceDownloadLink: `${process.env.APP_BASE_URL}/api/v1/public/invoice?token=${invoiceToken}&download=1`,

      // ✅ ONLY ADDITIONS
      isReceiver: true,
      orderFormLink,
      packingSlipLink,
    };

    const html = await ejs.renderFile(templatePath, data);

    await transporter.sendMail({
      from: `"Easy Buy" <${process.env.MAIL_FROM_NAME}>`,
      to,
      subject: `New Order Received #${order.invoiceNumber || order.id}`,
      html,
    });

    console.log(`📧 Order receiver email sent to ${to}`);
  } catch (err) {
    console.error("❌ Error sending order receiver email:", err);
  }
}
