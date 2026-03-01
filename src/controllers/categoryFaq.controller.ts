import { Request, Response, NextFunction } from "express";
import CategoryFaq from "../models/categoryFaq.model";
import Category from "../models/category.model";
import { hasPermission } from "../utils/permissionUtils";

// CREATE CATEGORY FAQ
export const createCategoryFaq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { categoryId, question, answer } = req.body;

    // Validate required fields
    if (!categoryId || !question || !answer) {
      return res.status(400).json({
        message: "categoryId, question, and answer are required",
      });
    }

    // Check if category exists
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Create FAQ
    const faq = await CategoryFaq.create({
      categoryId,
      question,
      answer,
    });

    return res.status(201).json({
      success: true,
      data: faq,
    });
  } catch (err) {
    next(err);
  }
};

// GET ALL FAQS FOR A CATEGORY
export const getCategoryFaqs = async (
  req: Request<{ categoryId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const categoryId = Number(req.params.categoryId);

    // Check if category exists
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Get all FAQs for this category
    const faqs = await CategoryFaq.findAll({
      where: { categoryId },
      order: [["createdAt", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: faqs,
    });
  } catch (err) {
    next(err);
  }
};

// UPDATE CATEGORY FAQ
export const updateCategoryFaq = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const faqId = Number(req.params.id);
    const { question, answer } = req.body;

    // Find the FAQ
    const faq = await CategoryFaq.findByPk(faqId);
    if (!faq) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    // Update FAQ
    await faq.update({
      ...(question && { question }),
      ...(answer && { answer }),
    });

    return res.status(200).json({
      success: true,
      data: faq,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE CATEGORY FAQ
export const deleteCategoryFaq = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const faqId = Number(req.params.id);

    // Find the FAQ
    const faq = await CategoryFaq.findByPk(faqId);
    if (!faq) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    // Delete FAQ
    await faq.destroy();

    return res.status(200).json({
      success: true,
      message: "FAQ deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};
