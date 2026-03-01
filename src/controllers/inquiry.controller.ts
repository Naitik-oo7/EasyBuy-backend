import ExcelJS from "exceljs";
import { Request, Response, NextFunction } from "express";
import Inquiry from "../models/inquiry.model";
import { Op } from "sequelize";
import Product from "../models/product.model";
import { deleteImage, getFileUrl, singleUpload } from "../utils/awsS3";
import { sendInquiryEmail } from "../utils/emailHelper";

/** 🟢 Public API — Create Inquiry */
export const createInquiry = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      name,
      companyName,
      mobile,
      category,
      noOfUniform,
      description,
      sourcePage,
      productId,
      type,
      isReselling,
    } = req.body;

    if (!name || !mobile) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ✅ Validate noOfUniform only if provided and not empty
    let uniformCount: number | null = null;
    if (
      noOfUniform !== undefined &&
      noOfUniform !== null &&
      noOfUniform !== ""
    ) {
      const parsed = Number(noOfUniform);
      if (isNaN(parsed) || parsed <= 0) {
        return res
          .status(400)
          .json({ message: "noOfUniform must be a valid positive number" });
      }
      uniformCount = parsed;
    }

    let validProductId = null;
    let product = null;

    if (productId) {
      product = await Product.findByPk(productId);
      if (!product) {
        return res
          .status(404)
          .json({ message: "Invalid productId — product not found" });
      }
      validProductId = productId;
    }

    let imageKey: string | null = null;

    if (req.file) {
      imageKey = await singleUpload(req.file, "inquiries");
    }

    const inquiry = await Inquiry.create({
      name,
      companyName,
      mobile,
      category,
      noOfUniform: uniformCount as number,
      description,
      status: "pending",
      sourcePage: sourcePage || "unknown",
      productId: validProductId,
      image: imageKey,
      type: type,
      isReselling: isReselling || false,
    });

    // Send email notification to CONTACT_RECEIVER
    try {
      await sendInquiryEmail(inquiry, product);
    } catch (emailError) {
      console.error("Failed to send inquiry email:", emailError);
      // Don't fail the request if email sending fails
    }

    return res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully",
      data: inquiry,
    });
  } catch (err) {
    next(err);
  }
};

/** 🔵 Admin API — List Inquiries with name/date/status filters */
export const listInquiries = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const { search, startDate, endDate, status, type, isReselling } = req.query;
    const where: any = {};

    // Search across multiple fields using the same search keyword
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { mobile: { [Op.iLike]: `%${search}%` } },
        { category: { [Op.iLike]: `%${search}%` } },
        { noOfUniform: { [Op.eq]: search } },
      ];
    }

    if (isReselling !== undefined) {
      where.isReselling = isReselling === "true" || isReselling === "false";
    }
    if (status) where.status = { [Op.iLike]: `%${status}%` };

    if (type) where.type = type;

    // Date filtering
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate as string) : null;
      const end = endDate ? new Date(endDate as string) : null;

      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);

      if (start && end) {
        where.createdAt = { [Op.between]: [start, end] };
      } else if (start) {
        where.createdAt = { [Op.gte]: start };
      } else if (end) {
        where.createdAt = { [Op.lte]: end };
      }
    }

    const { count: total, rows: inquiries } = await Inquiry.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Product,
          as: "product",
          attributes: ["id", "title", "sku", "featuredImage", "price"],
        },
      ],
    });

    // ✅ Convert image keys to full URLs
    const data = inquiries.map((inq: any) => {
      const json = inq.toJSON();

      if (json.image) {
        json.image = getFileUrl(json.image, "inquiries");
      }
      if (json.product?.featuredImage) {
        json.product.featuredImage = getFileUrl(
          json.product.featuredImage,
          "products/featured-image"
        );
      }
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

/** 🟣 Admin API — Update Inquiry Status */
export const updateInquiryStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const inquiry = await Inquiry.findByPk(req.params.id);
    if (!inquiry) return res.status(404).json({ message: "Inquiry not found" });

    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "Status is required" });

    await inquiry.update({ status });

    return res.status(200).json({
      success: true,
      message: "Status updated successfully",
      data: inquiry,
    });
  } catch (err) {
    next(err);
  }
};

/** 🔴 Admin API — Delete Inquiry */
export const deleteInquiry = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const inquiry = await Inquiry.findByPk(req.params.id);
    if (!inquiry) return res.status(404).json({ message: "Inquiry not found" });
    if (inquiry.image) {
      try {
        await deleteImage(inquiry.image);
      } catch (e) {
        console.warn("Failed to delete inquiry image:", e);
      }
    }

    await inquiry.destroy();

    return res.status(200).json({
      success: true,
      message: "Inquiry deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const exportInquiriesToExcel = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, startDate, endDate, status } = req.query;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { mobile: { [Op.iLike]: `%${search}%` } },
        { category: { [Op.iLike]: `%${search}%` } },
        { noOfUniform: { [Op.eq]: search } },
      ];
    }

    if (status) {
      where.status = { [Op.iLike]: `%${status}%` };
    }

    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { [Op.between]: [start, end] };
    } else if (startDate) {
      where.createdAt = { [Op.gte]: new Date(startDate as string) };
    } else if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { [Op.lte]: end };
    }

    const inquiries = await Inquiry.findAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Product,
          as: "product",
          attributes: ["id", "title", "sku", "featuredImage"],
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inquiries");

    // ---------------------------
    // 🔹 HEADER ROW
    // ---------------------------
    const headerRow = sheet.addRow([
      "ID",
      "Name",
      "Company Name",
      "Mobile",
      "Type",
      "Category",
      "No. of Uniform",
      "Description",
      "Status",
      "Source Page",
      "Product Title",
      "Product SKU",
      "Image",
      "Is Reselling",
      "Created At",
      "Updated At",
    ]);

    // Style header
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
        fgColor: { argb: "FFEFEFEF" }, // Light gray header bg
      };
    });

    // ---------------------------
    // 🔹 DATA ROWS
    // ---------------------------
    inquiries.forEach((inq: any) => {
      const p = inq.product || {};

      const row = sheet.addRow([
        inq.id,
        inq.name,
        inq.companyName,
        inq.mobile,
        inq.type,
        inq.category,
        inq.noOfUniform,
        inq.description,
        inq.status,
        inq.sourcePage,
        p.title || "-",
        p.sku || "-",
        inq.image ? getFileUrl(inq.image, "inquiries") : "-", // 👈 add this
        inq.isReselling ? "Yes" : "No",
        inq.createdAt ? inq.createdAt.toISOString() : "",
        inq.updatedAt ? inq.updatedAt.toISOString() : "",
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

    // ---------------------------
    // 🔹 AUTO-FIT COLUMN WIDTHS
    // ---------------------------
    sheet.columns.forEach((col: any, index) => {
      let maxLength = 15;

      col.eachCell({ includeEmpty: true }, (cell: any) => {
        const value = cell.value ? cell.value.toString() : "";
        maxLength = Math.max(maxLength, value.length + 2);
      });

      // Long Description column? Limit width
      if (index === 6) col.width = 50;
      else col.width = Math.min(maxLength, 40);
    });

    // ---------------------------
    // 🔹 FREEZE HEADER
    // ---------------------------
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // ---------------------------
    // 🔹 SEND FILE
    // ---------------------------
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=inquiries.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};
