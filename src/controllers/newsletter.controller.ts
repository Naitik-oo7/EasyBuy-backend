import { Request, Response, NextFunction } from "express";
import NewsletterSubscriber from "../models/newsletterSubscriber.model";
import { Op } from "sequelize";
import ExcelJS from "exceljs";

export const subscribeNewsletter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, name } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check existing subscriber
    const existing = await NewsletterSubscriber.findOne({
      where: { email: normalizedEmail },
    });

    if (existing) {
      if (existing.status === "unsubscribed") {
        await existing.update({ status: "active" });
        return res.status(200).json({
          success: true,
          message: "Welcome back! You have been resubscribed.",
        });
      }
      return res
        .status(200)
        .json({ success: true, message: "Already subscribed." });
    }

    // Create new subscriber
    await NewsletterSubscriber.create({
      email: normalizedEmail,
      name: name || null,
    });

    // Optionally: send welcome email here
    // await sendNewsletterWelcomeEmail(email);

    return res.status(201).json({
      success: true,
      message: "Subscription successful! You'll now receive updates.",
    });
  } catch (err) {
    next(err);
  }
};

export const unsubscribeNewsletter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    const subscriber = await NewsletterSubscriber.findOne({ where: { email } });

    if (!subscriber)
      return res
        .status(404)
        .json({ message: "No subscriber found with this email." });

    await subscriber.update({ status: "unsubscribed" });

    return res.status(200).json({
      success: true,
      message: "You have been unsubscribed successfully.",
    });
  } catch (err) {
    next(err);
  }
};

// 📋 List / search subscribers (paginated)
export const listNewsletterSubscribers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "20"));
    const offset = (page - 1) * limit;

    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (status) where.status = status;

    const { count: total, rows: subscribers } =
      await NewsletterSubscriber.findAndCountAll({
        where,
        limit,
        offset,
        order: [["createdAt", "DESC"]],
      });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: subscribers,
    });
  } catch (err) {
    next(err);
  }
};

export const exportNewsletterSubscribersToExcel = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, status } = req.query;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (status) where.status = status;

    const subscribers = await NewsletterSubscriber.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Subscribers");

    // -----------------------------
    // 🔹 HEADER ROW
    // -----------------------------
    const headerRow = sheet.addRow([
      "ID",
      "Name",
      "Email",
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
        fgColor: { argb: "FFEFEFEF" }, // light gray header
      };
    });

    // -----------------------------
    // 🔹 DATA ROWS
    // -----------------------------
    subscribers.forEach((s: any) => {
      const row = sheet.addRow([
        s.id,
        s.name || "-",
        s.email,
        s.status,
        s.createdAt ? s.createdAt.toISOString() : "",
        s.updatedAt ? s.updatedAt.toISOString() : "",
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

    // -----------------------------
    // 🔹 AUTO-FIT COLUMNS
    // -----------------------------
    sheet.columns.forEach((col: any, index) => {
      let maxLength = 10;

      col.eachCell({ includeEmpty: true }, (cell: any) => {
        const value = cell.value ? cell.value.toString() : "";
        maxLength = Math.max(maxLength, value.length + 2);
      });

      // Email columns can get long → limit width to max 40
      if (index === 2) {
        col.width = Math.min(maxLength, 40);
      } else {
        col.width = Math.min(maxLength, 30);
      }
    });

    // -----------------------------
    // 🔹 FREEZE HEADER
    // -----------------------------
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // -----------------------------
    // 🔹 SEND EXPORT
    // -----------------------------
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=newsletter-subscribers.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

export const deleteNewsletterSubscriber = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const subscriber = await NewsletterSubscriber.findByPk(id);

    if (!subscriber) {
      return res
        .status(404)
        .json({ success: false, message: "Subscriber not found" });
    }

    await subscriber.destroy();

    return res.status(200).json({
      success: true,
      message: `Subscriber ${subscriber.email} deleted successfully`,
    });
  } catch (err) {
    next(err);
  }
};
