import { Request, Response, NextFunction } from "express";
import ProductFaq from "../models/productFaq.model";
import Product from "../models/product.model";

// CREATE FAQ
export const createProductFaq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId, question, answer } = req.body;

    if (!productId || !question || !answer) {
      return res
        .status(400)
        .json({ message: "productId, question, and answer are required" });
    }

    // validate product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const faq = await ProductFaq.create({ productId, question, answer });
    return res.status(201).json({ success: true, data: faq });
  } catch (err) {
    next(err);
  }
};

// LIST FAQS (optionally filter by productId)
export const listProductFaqs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId } = req.query;

    let where: any = {};
    if (productId) {
      where.productId = productId;
    }

    const faqs = await ProductFaq.findAll({
      where,
      order: [["id", "ASC"]],
    });

    return res.status(200).json({ success: true, data: faqs });
  } catch (err) {
    next(err);
  }
};

// GET FAQ BY ID
export const getProductFaqById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await ProductFaq.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ message: "FAQ not found" });
    return res.status(200).json({ success: true, data: faq });
  } catch (err) {
    next(err);
  }
};

// UPDATE FAQ
export const updateProductFaq = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await ProductFaq.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ message: "FAQ not found" });

    await faq.update(req.body);
    return res.status(200).json({ success: true, data: faq });
  } catch (err) {
    next(err);
  }
};

// DELETE FAQ
export const deleteProductFaq = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await ProductFaq.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ message: "FAQ not found" });

    await faq.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};
