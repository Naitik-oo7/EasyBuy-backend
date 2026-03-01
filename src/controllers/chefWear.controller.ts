import { Request, Response, NextFunction } from "express";
import ChefWear from "../models/chefWear.model";
import { singleUpload, chefWearMultiUpload, deleteImage, getFileUrl } from "../utils/awsS3";
import db from "../models";

export const getChefWear = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let cw = await ChefWear.findByPk(1);

    if (!cw) {
      cw = await ChefWear.create({ id: 1, images: [] });
    }

    const json: any = cw.toJSON();

    // Background image formatter
    json.backgroundImage = json.backgroundImage
      ? {
          key: json.backgroundImage,
          url: getFileUrl(json.backgroundImage, "chef-wear/background"),
        }
      : null;

    // Images formatter
    json.images = (json.images || []).map((k: string) => ({
      key: k,
      url: getFileUrl(k, "chef-wear/images"),
    }));

    return res.json({ success: true, data: json });
  } catch (err) {
    next(err);
  }
};

export const updateChefWear = async (req: Request, res: Response, next: NextFunction) => {
  const t = await db.sequelize.transaction();
  try {
    let cw = await ChefWear.findByPk(1);
    if (!cw) {
      cw = await ChefWear.create({ id: 1 }, { transaction: t });
    }

    const { title, description, link, removeImages } = req.body;

    // Existing images
    let images: string[] = Array.isArray(cw.images) ? [...cw.images] : [];

    // Background image update
    const bg = (req.files as any)?.backgroundImage?.[0];
    if (bg) {
      const key = await singleUpload(bg, "chef-wear/background");

      if (cw.backgroundImage) {
        try {
          await deleteImage(cw.backgroundImage);
        } catch {}
      }

      cw.backgroundImage = key;
    }

    // Multiple image upload (ChefWear-specific folder)
    const uploaded = (req.files as any)?.images || [];
    if (uploaded.length) {
      const newKeys = await chefWearMultiUpload(uploaded);
      images = images.concat(newKeys);
    }

    // Remove requested images
    if (removeImages) {
      let rem: string[] = [];

      if (typeof removeImages === "string") {
        try {
          rem = JSON.parse(removeImages);
        } catch {
          rem = removeImages.split(",").map((x: string) => x.trim());
        }
      } else if (Array.isArray(removeImages)) {
        rem = removeImages;
      }

      // Delete from S3
      for (const rm of rem) {
        try {
          await deleteImage(rm);
        } catch {}
      }

      images = images.filter((img) => !rem.includes(img));
    }

    // Save fields
    cw.title = title ?? cw.title;
    cw.description = description ?? cw.description;
    cw.link = link ?? cw.link;
    cw.images = images;

    await cw.save({ transaction: t });
    await t.commit();

    const json: any = cw.toJSON();

    json.backgroundImage = json.backgroundImage
      ? {
          key: json.backgroundImage,
          url: getFileUrl(json.backgroundImage, "chef-wear/background"),
        }
      : null;

    json.images = (json.images || []).map((k: string) => ({
      key: k,
      url: getFileUrl(k, "chef-wear/images"),
    }));

    return res.json({ success: true, data: json });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// Public API - Landing Page
export const publicChefWear = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let cw = await ChefWear.findByPk(1);
    if (!cw) return res.json({ success: true, data: null });

    const json: any = cw.toJSON();

    json.backgroundImage = json.backgroundImage
      ? {
          key: json.backgroundImage,
          url: getFileUrl(json.backgroundImage, "chef-wear/background"),
        }
      : null;

    json.images = (json.images || []).map((k: string) => ({
      key: k,
      url: getFileUrl(k, "chef-wear/images"),
    }));

    return res.json({ success: true, data: json });
  } catch (err) {
    next(err);
  }
};
