import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
});


export async function singleUpload(
  file: Express.Multer.File,
  folder?: string,
  limits: { maxImageMB?: number; maxVideoMB?: number } = {}
): Promise<string> {
  const isImage = file.mimetype.startsWith("image/");
  const isVideo = file.mimetype.startsWith("video/");
  const isAudio = file.mimetype.startsWith("audio/");

  const maxImageMB = limits.maxImageMB ?? 5;
  const maxVideoMB = limits.maxVideoMB ?? 5;

  if (isImage && file.size > maxImageMB * 1024 * 1024) {
    throw new Error(`Image must not exceed ${maxImageMB} MB`);
  }

  if (isVideo && file.size > maxVideoMB * 1024 * 1024) {
    throw new Error(`Video must not exceed ${maxVideoMB} MB`);
  }

  if (isAudio && file.size > maxVideoMB * 1024 * 1024) {
    throw new Error(`Audio must not exceed ${maxVideoMB} MB`);
  }

  // Convert buffer to base64 for Cloudinary upload
  const base64Data = file.buffer.toString("base64");
  const mimeType = file.mimetype;

  // Build the folder path for Cloudinary
  const folderPath = folder
    ? folder.replace(/\/+$/, "").replace(/\//g, "/")
    : "uploads";

  // Upload to Cloudinary
  const result = await cloudinary.uploader.upload(
    `data:${mimeType};base64,${base64Data}`,
    {
      folder: folderPath,
      public_id: `${Date.now()}_${path.parse(file.originalname).name}`,
      resource_type: "auto",
    }
  );

  return result.secure_url;
}

/**
 * Uploads multiple file buffers to Cloudinary and returns an array of public URLs
 */
export async function multiUpload(
  files: Express.Multer.File[]
): Promise<string[]> {
  const folder = "products/original";
  return Promise.all(files.map((f) => singleUpload(f, folder)));
}

export function getFileUrl(key: string | null, folder?: string): string | null {
  if (!key) return null;

  // Cloudinary already returns the full URL (secure_url) on upload,
  // so we just return it as-is if it's already a complete URL
  if (key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }

  // Fallback: if somehow a key is passed without URL, construct from base
  const base = process.env.CLOUDINARY_BASE_URL || "";
  if (folder) {
    return `${base}${folder.replace(/\/+$/, "")}/${key}`;
  }

  return `${base}${key}`;
}

export async function deleteImage(urlOrUrls: string | string[]): Promise<void> {
  const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];

  // Extract public_id from Cloudinary URLs and delete them
  const deletePromises = urls.map(async (url) => {
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      // If it's not a URL, treat it as a public_id directly
      if (url) {
        await cloudinary.uploader.destroy(url);
      }
      return;
    }

    // Extract public_id from Cloudinary URL
    // Format: https://res.cloudinary.com/<cloud_name>/image/upload/v<version>/<folder>/<public_id>
    // or: https://res.cloudinary.com/<cloud_name>/video/upload/v<version>/<folder>/<public_id>
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const regex = new RegExp(`https://res\\.cloudinary\\.com/${cloudName}/(image|video|raw)/upload/(v\\d+/)?(.+)`);
    const match = url.match(regex);

    if (match && match[3]) {
      // Remove file extension from public_id
      const publicId = match[3].replace(/\\.[^/.]+$/, "");
      await cloudinary.uploader.destroy(publicId);
    }
  });

  await Promise.all(deletePromises);
}

// Multer setup if you want direct middleware
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file (image or video)
    files: 10, // max 10 files
  },
});

// Middleware to handle image and subImage separately
export const sliderUploadMiddleware = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

export const singleFileMiddleware = upload.single("image");
export const singleVideoMiddleware = upload.single("video");
export const multiFileMiddleware = upload.array("images", 10);

export const multipleFileMiddleware = upload.fields([
  { name: "images", maxCount: 10 },
  { name: "video", maxCount: 10 },
]);

export const fileMiddleware = upload.single("file");

export const productFileMiddleware = upload.fields([
  { name: "featuredImage", maxCount: 1 }, // featured image
  { name: "images", maxCount: 10 }, // extra images
  { name: "video", maxCount: 10 },
  { name: "videoThumbnail", maxCount: 1 },
]);

export const blogUploadMiddleware = upload.fields([
  { name: "featuredImage", maxCount: 1 },
]);

export const logoUploadMiddleware = upload.single("embroideryLogo");

export const categoryUploadMiddleware = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "image2", maxCount: 1 },
  { name: "metaImage", maxCount: 1 },
  { name: "video", maxCount: 1 }, // Added video field
]);

export const webSettingsUploadMiddleware = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "favicon", maxCount: 1 },
  { name: "ogImage", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

export const chefWearUpload = upload.fields([
  { name: "backgroundImage", maxCount: 1 },
  { name: "images", maxCount: 10 },
]);

export async function chefWearMultiUpload(
  files: Express.Multer.File[]
): Promise<string[]> {
  const folder = "chef-wear/images";
  return Promise.all(files.map((f) => singleUpload(f, folder)));
}
