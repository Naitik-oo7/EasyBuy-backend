import { Request, Response, NextFunction } from "express";
import WebSettings from "../models/webSettings.model";
import { singleUpload, deleteImage, getFileUrl } from "../utils/awsS3";

// Get current settings
export const getWebSettings = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settings = await WebSettings.findOne({ where: { id: 1 } });
    if (!settings)
      return res.status(404).json({ message: "Settings not found" });

    const json = settings.toJSON();
    json.logo = getFileUrl(json.logo ?? null);
    json.favicon = getFileUrl(json.favicon ?? null);
    json.ogImage = getFileUrl(json.ogImage ?? null);
    json.audio = getFileUrl(json.audio ?? null);

    return res.json({ success: true, data: json });
  } catch (err) {
    next(err);
  }
};

// Upsert (create/update)
export const upsertWebSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let settings = await WebSettings.findOne({ where: { id: 1 } });

    // Handle file uploads
    const files = req.files as any;
    if (files?.logo) {
      if (settings?.logo) await deleteImage(settings.logo);
      req.body.logo = await singleUpload(files.logo[0], "settings");
    }
    if (files?.favicon) {
      if (settings?.favicon) await deleteImage(settings.favicon);
      req.body.favicon = await singleUpload(files.favicon[0], "settings");
    }
    if (files?.ogImage) {
      if (settings?.ogImage) await deleteImage(settings.ogImage);
      req.body.ogImage = await singleUpload(files.ogImage[0], "settings");
    }
    if (files?.audio) {
      if (settings?.audio) await deleteImage(settings.audio);
      req.body.audio = await singleUpload(files.audio[0], "settings");
    }

    if (settings) {
      await settings.update(req.body);
    } else {
      settings = await WebSettings.create({ id: 1, ...req.body });
    }

    const json = settings.toJSON();
    json.logo = getFileUrl(json.logo ?? null);
    json.favicon = getFileUrl(json.favicon ?? null);
    json.ogImage = getFileUrl(json.ogImage ?? null);
    json.audio = getFileUrl(json.audio ?? null);

    return res.json({ success: true, data: json });
  } catch (err) {
    next(err);
  }
};

// Public: Get website settings (no auth)
export const getPublicWebSettings = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settings = await WebSettings.findOne({ where: { id: 1 } });
    if (!settings) {
      return res.status(404).json({ message: "Settings not found" });
    }

    const json = settings.toJSON();
    json.logo = getFileUrl(json.logo ?? null);
    json.favicon = getFileUrl(json.favicon ?? null);
    json.ogImage = getFileUrl(json.ogImage ?? null);
    json.audio = getFileUrl(json.audio ?? null);

    return res.status(200).json({ success: true, data: json });
  } catch (err) {
    next(err);
  }
};
