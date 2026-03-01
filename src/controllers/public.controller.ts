import { Request, Response, NextFunction } from "express";
import {
  sendContactEmail,
  sendCareerEmail,
  sendOrderPlacedEmail,
  sendOrderReceiverNotification,
} from "../utils/emailHelper";
import { singleUpload, getFileUrl } from "../utils/awsS3";
import Category from "../models/category.model";
import Product from "../models/product.model";
import jwt from "jsonwebtoken";
import path from "path";
import ejs from "ejs";
import { getCluster } from "../utils/puppeteerCluster";
import OrderProduct from "../models/orderProduct.model";
import Order from "../models/order.model";
import OrderShippingAddress from "../models/orderShippingAddress.model";
import OrderBillingAddress from "../models/orderBillingAddress.model";
import User from "../models/user.model";
import Option from "../models/option.model";
import { calculateTax } from "../utils/taxHelper";
import Payment from "../models/payment.model";
import { generatePaymentCode } from "../utils/codeHelper";
import { generateOrderForm, generatePackingSlip } from "./order.controller";

// 📨 CONTACT US FORM
export const submitContactForm = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { firstName, lastName, email, phone, message } = req.body;

    if (!firstName || !email || !message) {
      return res
        .status(400)
        .json({ success: false, message: "Please fill all required fields." });
    }

    await sendContactEmail({ firstName, lastName, email, phone, message });

    return res.status(200).json({
      success: true,
      message: "Thank you for contacting us. We’ll get back to you soon!",
    });
  } catch (err) {
    next(err);
  }
};

// 💼 CAREER FORM (with resume upload)
export const submitCareerForm = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, lastName, phone, email, applyFor, message } = req.body;

    if (!name || !email || !applyFor) {
      return res
        .status(400)
        .json({ success: false, message: "Please fill all required fields." });
    }

    // ✅ Handle optional resume upload via AWS S3
    let resumeUrl: string | null = null;

    if (req.file) {
      const key = await singleUpload(req.file, "careers/resumes");
      resumeUrl = getFileUrl(key, "careers/resumes");
    }

    await sendCareerEmail({
      name,
      lastName,
      phone,
      email,
      applyFor,
      message,
      resumeUrl,
    });

    return res.status(200).json({
      success: true,
      message: "Application submitted successfully. We’ll contact you soon!",
    });
  } catch (err) {
    next(err);
  }
};

export const listAllSlugs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const [cats, products] = await Promise.all([
      Category.findAll({
        where: { status: "active" },
        attributes: ["slug"],
        order: [["id", "ASC"]],
        raw: true,
      }),
      Product.findAll({
        where: { status: "active" },
        attributes: ["slug"],
        order: [["id", "ASC"]],
        raw: true,
      }),
    ]);

    const catSlugs = (cats as Array<{ slug?: string }>).map((c) =>
      (c.slug ?? "").trim()
    );
    const productSlugs = (products as Array<{ slug?: string }>).map((p) =>
      (p.slug ?? "").trim()
    );

    // Combine & deduplicate
    const seen = new Set<string>();
    const combined: string[] = [];

    for (const s of [...catSlugs, ...productSlugs]) {
      if (!s) continue;
      if (!seen.has(s)) {
        seen.add(s);
        combined.push(s);
      }
    }

    return res.status(200).json({
      success: true,
      data: combined,
    });
  } catch (err) {
    next(err);
  }
};

// export const tokenInvoiceGenerate = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const token = String(req.query.token || "");
//     const downloadFlag = String(req.query.download || "0") === "1";

//     if (!token) return res.status(400).send("Missing token");

//     let payload: any;
//     let INVOICE_JWT_SECRET: any = process.env.INVOICE_JWT_SECRET;

//     try {
//       payload = jwt.verify(token, INVOICE_JWT_SECRET);
//     } catch (e) {
//       return res.status(401).send("Invalid or expired token");
//     }

//     const orderId = payload.orderId;
//     const tokenEmail = payload.email;

//     // Fetch order and relations (same as your existing generateInvoice fetch)
//     const order: any = await Order.findOne({
//       where: { id: orderId },
//       include: [
//         { model: OrderProduct, as: "orderProducts" },
//         { model: OrderShippingAddress, as: "shippingAddress" },
//         { model: OrderBillingAddress, as: "billingAddress" },
//         {
//           model: User,
//           as: "user",
//           attributes: [
//             "id",
//             "name",
//             "email",
//             "mobile",
//             "companyName",
//             "gstNumber",
//           ],
//         },
//       ],
//     });

//     if (!order) return res.status(404).json({ message: "Order not found" });

//     // make local copies exactly like generateInvoice
//     const products = order.orderProducts || [];
//     const shipping = order.shippingAddress || {};
//     const billing = order.billingAddress || {};

//     const buyerState = shipping.state.toLowerCase();
//     const sellerState = "delhi"; // warehouse state
//     const sameState = buyerState === sellerState;

//     // optional extra-check: ensure token email matches order email (defense-in-depth)
//     const shippingEmail = shipping.email || order.user?.email || "";
//     if (tokenEmail && shippingEmail && tokenEmail !== shippingEmail) {
//       return res.status(401).send("Token does not match order");
//     }

//     // 2️⃣ Load size names
//     const sizeOptions = await Option.findAll({
//       where: { optionType: "size" },
//       raw: true,
//     });
//     const sizeMap: Record<string, string> = {};
//     sizeOptions.forEach((s: any) => (sizeMap[s.id] = s.name));

//     // 3️⃣ Compute totals and taxes
//     let embroideryTotal = 0;
//     let taxableSum = 0,
//       cgstSum = 0,
//       sgstSum = 0,
//       igstSum = 0,
//       totalWithTaxSum = 0;

//     const taxRows: any[] = [];

//     // use the same calculateTax helper as generateInvoice
//     const { calculateTax } = require("../utils/taxHelper"); // keep path consistent with your project

//     products.forEach((p: any) => {
//       const taxableValue = (p.price + (p.embroideryPrice || 0)) * p.quantity;
//       embroideryTotal += (p.embroideryPrice || 0) * p.quantity;

//       const taxInfo = calculateTax(
//         p.price,
//         p.quantity,
//         p.embroideryPrice || 0,
//         buyerState,
//         sellerState
//       );
//       taxableSum += taxableValue;
//       cgstSum += taxInfo.cgst || 0;
//       sgstSum += taxInfo.sgst || 0;
//       igstSum += taxInfo.igst || 0;
//       totalWithTaxSum += taxInfo.total;

//       taxRows.push({
//         hsn: p.hsn || "-",
//         category: taxInfo.taxRate === 5 ? "5% Category" : "18% Category",
//         taxable: taxableValue.toFixed(2),
//         rate: `${taxInfo.taxRate}%`,
//         cgst: taxInfo.cgst?.toFixed(2) || "0.00",
//         sgst: taxInfo.sgst?.toFixed(2) || "0.00",
//         igst: taxInfo.igst?.toFixed(2) || "0.00",
//         totalWithTax: taxInfo.total.toFixed(2),
//       });
//     });

//     // 4️⃣ Build Product Rows (exact same structure)
//     const itemsHtml = products
//       .map(
//         (p: any, idx: number) => `
//         <tr>
//           <td>${idx + 1}</td>
//           <td>
//             <div class="item-description">
//               <strong>${p.product_name}</strong>
//               <div class="item-details">
//                 Sizes: ${
//                   p.sizes
//                     ? Object.entries(p.sizes)
//                         .map(
//                           ([s, q]: [string, any]) => `${sizeMap[s] || s}:${q}`
//                         )
//                         .join(", ")
//                     : "-"
//                 }<br/>
//                 SKU: ${p.sku || "-"}<br/>
//                 HSN: ${p.hsn || "-"}<br/>
//                 Embroidery: ${p.embroidery ? "Yes" : "No"}
//               </div>
//             </div>
//           </td>
//           <td>${p.quantity}</td>
//           <td>₹${p.price.toFixed(2)}</td>
//           <td>₹${(p.embroideryPrice || 0).toFixed(2)}</td>
//           <td>${taxRows[idx].rate}</td>
//           <td>₹${Number(taxRows[idx]?.totalWithTax ?? p.lineTotal ?? 0).toFixed(
//             2
//           )}</td>
//         </tr>`
//       )
//       .join("");

//     // 5️⃣ Summary Tax Rows (same)
//     const taxSummaryRow = sameState
//       ? `
//         <div class="summary-line"><span>CGST</span><span>₹${cgstSum.toFixed(
//           2
//         )}</span></div>
//         <div class="summary-line"><span>SGST</span><span>₹${sgstSum.toFixed(
//           2
//         )}</span></div>`
//       : `<div class="summary-line"><span>IGST</span><span>₹${igstSum.toFixed(
//           2
//         )}</span></div>`;

//     // 6️⃣ Tax Table Headers (same)
//     const taxHeadersHtml = sameState
//       ? `<th colspan="2" class="text-center">GST</th>`
//       : `<th colspan="2" class="text-center">IGST</th>`;

//     const taxSubHeadersHtml = sameState
//       ? `<tr><th>CGST</th><th>SGST</th></tr>`
//       : `<tr><th>Rate</th><th>Amount</th></tr>`;

//     const taxTotalsHtml = sameState
//       ? `<td><strong>₹${cgstSum.toFixed(
//           2
//         )}</strong></td><td><strong>₹${sgstSum.toFixed(2)}</strong></td>`
//       : `<td><strong>₹${igstSum.toFixed(2)}</strong></td>`;

//     const taxRowsHtml = taxRows
//       .map((r: any) => {
//         return sameState
//           ? `<tr><td>${r.hsn}</td><td>${r.category}</td><td>₹${r.taxable}</td><td>₹${r.cgst}</td><td>₹${r.sgst}</td><td>₹${r.totalWithTax}</td></tr>`
//           : `<tr><td>${r.hsn}</td><td>${r.category}</td><td>₹${r.taxable}</td><td>${r.rate}</td><td>₹${r.igst}</td><td>₹${r.totalWithTax}</td></tr>`;
//       })
//       .join("");

//     // 7️⃣ Render Template with EJS (exact same data keys/formatting)
//     const templatePath = path.join(__dirname, "../templates/invoice.ejs");
//     const html = await ejs.renderFile(templatePath, {
//       billingName: billing.name || "",
//       billingAddress: `${billing.address}, ${billing.city}, ${billing.state} - ${billing.pinCode}`,
//       billingPhone: billing.mobileNumber || "",
//       billingEmail: billing.email || "",
//       shippingName: shipping.name || "",
//       shippingAddress: `${shipping.address}, ${shipping.city}, ${shipping.state} - ${shipping.pinCode}`,
//       shippingPhone: shipping.mobileNumber || "",
//       shippingEmail: shipping.email || "",
//       invoiceNumber: order.invoiceNumber,
//       invoiceDate: new Date(order.createdAt).toLocaleDateString(),
//       orderNumber: order.id.toString(),
//       orderDate: new Date(order.createdAt).toLocaleDateString(),
//       paymentMethod: order.paymentMethod || "N/A",
//       itemsHtml,
//       subtotal: `₹${order.subtotal.toFixed(2)}`,
//       embroidery: `₹${embroideryTotal.toFixed(2)}`,
//       shipping: `₹${order.shippingTotal.toFixed(2)}`,
//       taxSummaryRow,
//       grandTotal: `₹${order.grandTotal.toFixed(2)}`,
//       taxHeaders: taxHeadersHtml,
//       taxSubHeaders: taxSubHeadersHtml,
//       taxRowsHtml,
//       taxableTotal: `₹${taxableSum.toFixed(2)}`,
//       taxTotals: taxTotalsHtml,
//       taxGrandTotal: `₹${totalWithTaxSum.toFixed(2)}`,
//       sameState,
//       cgstSum,
//       sgstSum,
//       igstSum,
//     });

//     // 8️⃣ Generate PDF via Puppeteer Cluster (same)
//     const cluster = await getCluster();
//     const pdfBuffer = await cluster.execute({ html });

//     // 9️⃣ Send Response
//     const filename = `invoice-${order.invoiceNumber || order.id}.pdf`;
//     res.setHeader("Content-Type", "application/pdf");

//     // match generateInvoice behavior when downloadFlag is false (inline),
//     // but allow forced download when ?download=1
//     if (downloadFlag) {
//       res.setHeader(
//         "Content-Disposition",
//         `attachment; filename="${filename}"`
//       );
//     } else {
//       res.setHeader(
//         "Content-Disposition",
//         `inline; filename=invoice-${order.invoiceNumber}.pdf`
//       );
//     }

//     res.send(pdfBuffer);
//   } catch (err) {
//     console.error("❌ Public invoice error:", err);
//     next(err);
//   }
// };

// 💳 PUBLIC PAYMENT CREATION FOR ESTIMATES
export const createPublicPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      estimateOrderId,
      amount,
      name,
      email,
      mobile,
      address1,
      city,
      state,
      pincode,
      description,
    } = req.body;

    // Handle name field from frontend - split into fname and lname if needed
    let finalFname = "";
    let finalLname = "";

    if (name) {
      const nameParts = name.trim().split(" ");
      if (nameParts.length === 1) {
        finalFname = nameParts[0];
        finalLname = "";
      } else if (nameParts.length >= 2) {
        finalFname = nameParts[0];
        finalLname = nameParts.slice(1).join(" ");
      }
    }

    // Validate required fields for public payment creation
    if (
      !estimateOrderId ||
      !amount ||
      !name ||
      !email ||
      !mobile ||
      !city ||
      !state ||
      !pincode
    ) {
      return res.status(400).json({
        success: false,
        message:
          "estimateOrderId, amount, name, email, mobile, city, state, and pincode are required",
      });
    }

    // Check if a payment already exists with this estimateOrderId
    const existingPayment = await Payment.findOne({
      where: { estimateOrderId },
    });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: "A payment already exists for this estimate",
      });
    }

    // Generate unique payment code
    let code: string;
    let exists: any;
    do {
      code = generatePaymentCode(8);
      exists = await Payment.findOne({ where: { code } });
    } while (exists);

    // Create payment record with estimateOrderId
    const payment = await Payment.create({
      estimateOrderId,
      code,
      amount,
      fname: finalFname,
      lname: finalLname,
      email,
      mobile,
      address1: address1 || null,
      city,
      state,
      pincode,
      description: description || null,
      status: "pending",
      gateway: "public_estimate",
    });

    return res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: {
        paymentCode: payment.code,
        estimateOrderId: payment.estimateOrderId,
        amount: payment.amount,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const tokenInvoiceGenerate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = String(req.query.token || "");
    const downloadFlag = String(req.query.download || "0") === "1";

    if (!token) return res.status(400).send("Missing token");

    const INVOICE_JWT_SECRET: any = process.env.INVOICE_JWT_SECRET;
    let payload: any;

    try {
      payload = jwt.verify(token, INVOICE_JWT_SECRET);
    } catch (e) {
      return res.status(401).send("Invalid or expired token");
    }

    const orderId = payload.orderId;
    const tokenEmail = payload.email;

    // Fetch order
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

    const buyerState = String(shipping.state || "").toLowerCase();
    const sellerState = "delhi";
    const sameState = buyerState === sellerState;

    // Optional: Ensure token email matches order email
    const orderEmail = shipping.email || order.user?.email || "";
    if (tokenEmail && orderEmail && tokenEmail !== orderEmail) {
      return res.status(401).send("Token does not match order");
    }

    // Load size names
    const sizeOptions = await Option.findAll({
      where: { optionType: "size" },
      raw: true,
    });

    const sizeMap: Record<string, string> = {};
    sizeOptions.forEach((s: any) => (sizeMap[s.id] = s.name));

    const round2 = (v: number) => Math.round(v * 100) / 100;

    // -----------------------------------------------------
    // 3️⃣ Compute totals and taxes (FULL COPY FROM MAIN CODE)
    // -----------------------------------------------------

    let embroideryTotal = 0;
    let taxableSum = 0,
      cgstSum = 0,
      sgstSum = 0,
      igstSum = 0,
      totalWithTaxSum = 0;

    const taxRows: any[] = [];

    // Calculate original tax values first
    let originalTaxTotal = 0;
    const originalProductTaxes: any[] = [];
    const originalProductTaxableValues: number[] = [];

    products.forEach((p: any) => {
      const lineQty = Number(p.quantity);
      const embPrice = Number(p.embroideryPrice || 0);
      const price = Number(p.price);

      const taxableValue = (price + embPrice) * lineQty;
      embroideryTotal += embPrice * lineQty;

      const taxInfo = calculateTax(
        price,
        lineQty,
        embPrice,
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
            (originalProductTaxableValues[index] || 0) * taxRatio
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

    // Freeze product GST before adding shipping GST
    const productGstOnly = round2(sameState ? cgstSum + sgstSum : igstSum);

    // Now add shipping GST
    const shippingBase = Number(order.shippingBase || 0);
    const shippingTax =
      Number(order.shippingTax) ||
      round2(order.shippingTotal - order.shippingTotal / 1.18);

    if (order.shippingTotal > 0) {
      taxableSum += shippingBase;
      totalWithTaxSum += Number(order.shippingTotal);

      if (sameState) {
        const half = shippingTax / 2;
        cgstSum += half;
        sgstSum += half;
      } else {
        igstSum += shippingTax;
      }
    }

    // -----------------------------------------------------
    // BUILD TAX TABLE HTML (same as main)
    // -----------------------------------------------------

    const taxHeadersHtml = sameState
      ? `<th colspan="2" class="text-center">GST</th>`
      : `<th colspan="2" class="text-center">IGST</th>`;

    const taxSubHeadersHtml = sameState
      ? `<tr><th>CGST</th><th>SGST</th></tr>`
      : `<tr><th>Rate</th><th>Amount</th></tr>`;

    let taxRowsHtml = taxRows
      .map((r: any) =>
        sameState
          ? `<tr><td>${r.hsn}</td><td>${r.category}</td><td>₹${r.taxable}</td><td>₹${r.cgst}</td><td>₹${r.sgst}</td><td>₹${r.totalWithTax}</td></tr>`
          : `<tr><td>${r.hsn}</td><td>${r.category}</td><td>₹${r.taxable}</td><td>${r.rate}</td><td>₹${r.igst}</td><td>₹${r.totalWithTax}</td></tr>`
      )
      .join("");

    // Add shipping row
    if (order.shippingTotal > 0) {
      const rate = 18;

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

      taxRowsHtml += shippingRow;
    }

    const taxTotalsHtml = sameState
      ? `<td><strong>₹${cgstSum.toFixed(
          2
        )}</strong></td><td><strong>₹${sgstSum.toFixed(2)}</strong></td>`
      : `<td><strong>₹${igstSum.toFixed(2)}</strong></td>`;

    const taxSummaryRow = sameState
      ? `
        <div class="summary-line"><span>CGST</span><span>₹${cgstSum.toFixed(
          2
        )}</span></div>
        <div class="summary-line"><span>SGST</span><span>₹${sgstSum.toFixed(
          2
        )}</span></div>
      `
      : `<div class="summary-line"><span>IGST</span><span>₹${igstSum.toFixed(
          2
        )}</span></div>`;

    // -----------------------------------------------------
    // COMPUTE DISPLAY FIELDS (FULL COPY)
    // -----------------------------------------------------

    const productSubTotal = round2(order.subtotal - embroideryTotal);

    const productGstAmount = productGstOnly;

    const totalGstForDisplay = round2(productGstAmount + shippingTax);

    const gstTypeLabel = sameState ? "CGST / SGST (Product)" : "IGST (Product)";

    const displayFields = {
      productSubTotal: `₹${productSubTotal.toFixed(2)}`,
      embroideryDisplay: `₹${embroideryTotal.toFixed(2)}`,
      gstTypeLabel,
      productGstAmountDisplay: `₹${productGstAmount.toFixed(2)}`,
      shippingBaseDisplay: `₹${shippingBase.toFixed(2)}`,
      shippingTaxDisplay: `₹${shippingTax.toFixed(2)}`,
      totalGstDisplay: `₹${totalGstForDisplay.toFixed(2)}`,
      payableDisplay: `₹${order.grandTotal.toFixed(2)}`,
    };

    const couponDiscount = round2(order.discount || order.couponDiscount || 0);
    const couponDiscountDisplay = `₹${couponDiscount.toFixed(2)}`;

    // -----------------------------------------------------
    // PRODUCT ROW HTML (same)
    // -----------------------------------------------------

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
              ${
                productImageUrl
                  ? `<img src="${productImageUrl}" alt="Product" class="product-image"/>`
                  : "-"
              }
            </td>
            <td>
              <div class="item-description">
                <strong>${p.product_name}</strong>
                <div class="item-details">
                  Sizes: ${
                    p.sizes
                      ? Object.entries(p.sizes)
                          .map(
                            ([s, q]: any) => `${sizeMap[s] || s}:${q as any}`
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
            <td>₹${Number(p.price).toFixed(2)}</td>
            <td>₹${Number(p.embroideryPrice || 0).toFixed(2)}</td>
            <td>${taxRows[idx].rate}</td>
            <td>₹${Number(
              taxRows[idx]?.totalWithTax ?? p.lineTotal ?? 0
            ).toFixed(2)}</td>
          </tr>`;
      })
      .join("");

    // -----------------------------------------------------
    // RENDER TEMPLATE (FULL MATCH)
    // -----------------------------------------------------

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

      productSubTotal: displayFields.productSubTotal,
      embroideryDisplay: displayFields.embroideryDisplay,
      embroideryTotalRaw: embroideryTotal,

      couponDiscount,
      couponDiscountDisplay,
      couponDiscountRaw: couponDiscount,

      gstTypeLabel: displayFields.gstTypeLabel,
      productGstAmountDisplay: displayFields.productGstAmountDisplay,
      shippingBaseDisplay: displayFields.shippingBaseDisplay,
      shippingTaxDisplay: displayFields.shippingTaxDisplay,
      totalGstDisplay: displayFields.totalGstDisplay,
      payableDisplay: displayFields.payableDisplay,

      taxSummaryRow,
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

    // -----------------------------------------------------
    // GENERATE AND SEND PDF
    // -----------------------------------------------------
    const cluster = await getCluster();
    const pdfBuffer = await cluster.execute({ html });

    const filename = `invoice-${order.invoiceNumber || order.id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");

    if (downloadFlag) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }

    res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ Public invoice error:", err);
    next(err);
  }
};

export const tokenOrderFormGenerate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = String(req.query.token || "");
    if (!token) return res.status(400).send("Missing token");

    const INVOICE_JWT_SECRET: any = process.env.INVOICE_JWT_SECRET;
    let payload: any;

    try {
      payload = jwt.verify(token, INVOICE_JWT_SECRET);
    } catch {
      return res.status(401).send("Invalid or expired token");
    }

    const orderId = payload.orderId;

    // 🔒 Optional hard guard
    if (payload.scope !== "internal") {
      return res.status(403).send("Unauthorized document access");
    }

    // 🔁 REUSE YOUR EXISTING GENERATOR
    // IMPORTANT: call the SAME function used by auth route
    req.params.orderId = String(orderId);
    return generateOrderForm(req, res, next);
  } catch (err) {
    next(err);
  }
};

export const tokenPackingSlipGenerate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = String(req.query.token || "");
    if (!token) return res.status(400).send("Missing token");

    const INVOICE_JWT_SECRET: any = process.env.INVOICE_JWT_SECRET;
    let payload: any;

    try {
      payload = jwt.verify(token, INVOICE_JWT_SECRET);
    } catch {
      return res.status(401).send("Invalid or expired token");
    }

    const orderId = payload.orderId;

    if (payload.scope !== "internal") {
      return res.status(403).send("Unauthorized document access");
    }

    req.params.orderId = String(orderId);
    return generatePackingSlip(req, res, next);
  } catch (err) {
    next(err);
  }
};

// // Temporary endpoint for direct image upload to S3
// export const directImageUpload = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: "No image file provided" });
//     }

//     // Upload the image to S3
//     const imageKey = await singleUpload(req.file, "direct-upload");

//     // Get the full S3 URL
//     const imageUrl = getFileUrl(imageKey);

//     return res.status(200).json({
//       success: true,
//       message: "Image uploaded successfully",
//       imageUrl,
//       imageKey, // Returning the key as well in case it's needed
//     });
//   } catch (error) {
//     next(error);
//   }
// };
