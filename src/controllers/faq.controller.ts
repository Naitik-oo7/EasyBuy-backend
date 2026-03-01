import { Request, Response, NextFunction } from "express";
import Faq from "../models/faq.model";
import { Op } from "sequelize";

// 🟢 Create FAQ
export const createFaq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { question, answer, status, orderBy } = req.body;
    if (!question || !answer) {
      return res
        .status(400)
        .json({ message: "Question and answer are required." });
    }

    const faq = await Faq.create({ question, answer, status, orderBy });
    return res.status(201).json({ success: true, data: faq });
  } catch (err) {
    next(err);
  }
};

// 🔵 List FAQs (Admin or All)
export const listFaqs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { question: { [Op.iLike]: `%${search}%` } },
        { answer: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (status) where.status = status;

    const { count: total, rows } = await Faq.findAndCountAll({
      where,
      order: [
        ["orderBy", "ASC"],
        ["createdAt", "DESC"],
      ],
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: rows,
    });
  } catch (err) {
    next(err);
  }
};

// 🟣 Get single FAQ
export const getFaqById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await Faq.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ message: "FAQ not found" });
    return res.status(200).json({ success: true, data: faq });
  } catch (err) {
    next(err);
  }
};

// 🟠 Update FAQ
export const updateFaq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await Faq.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ message: "FAQ not found" });

    await faq.update(req.body);
    return res.status(200).json({ success: true, data: faq });
  } catch (err) {
    next(err);
  }
};

// 🔴 Delete FAQ
export const deleteFaq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await Faq.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ message: "FAQ not found" });

    await faq.destroy();
    return res
      .status(200)
      .json({ success: true, message: "FAQ deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// 🌐 Public endpoint — active FAQs for frontend
export const listPublicFaqs = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const faqs = await Faq.findAll({
      where: { status: "active" },
      order: [
        ["orderBy", "ASC"],
        ["createdAt", "DESC"],
      ],
    });
    return res.status(200).json({ success: true, data: faqs });
  } catch (err) {
    next(err);
  }
};
