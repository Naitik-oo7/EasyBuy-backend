import { Request, Response, NextFunction } from "express";
import Client from "../models/client.model";
import { deleteImage, singleUpload, getFileUrl } from "../utils/awsS3";
import { Op } from "sequelize";

// CREATE Client
export const createClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, orderBy, status } = req.body;
    if (!title) return res.status(400).json({ message: "Title is required" });

    let image: string | null = null;
    if (req.file) image = await singleUpload(req.file, "clients");

    const client = await Client.create({
      title,
      orderBy: orderBy !== undefined ? orderBy : 0, // Default to 0 if not provided
      status,
      image,
    });

    const jsonClient = client.toJSON();
    jsonClient.image = getFileUrl(jsonClient.image, "clients");

    return res.status(201).json({ success: true, data: jsonClient });
  } catch (err) {
    next(err);
  }
};

// LIST Clients with pagination, search, and status filter
export const listClients = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || undefined;

    const where: any = {};
    if (search) where.title = { [Op.iLike]: `%${search}%` };
    if (status) where.status = status;

    const { count: total, rows: clients } = await Client.findAndCountAll({
      where,
      limit,
      offset,
      order: [["orderBy", "ASC"]],
    });

    const normalized = clients.map((c) => {
      const json = c.toJSON();
      json.image = getFileUrl(json.image);
      return json;
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: normalized,
    });
  } catch (err) {
    next(err);
  }
};

// GET Client by ID
export const getClientById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const client = await Client.findByPk(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const jsonClient = client.toJSON();
    jsonClient.image = getFileUrl(jsonClient.image);

    return res.status(200).json({ success: true, data: jsonClient });
  } catch (err) {
    next(err);
  }
};

// UPDATE Client
export const updateClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const client = await Client.findByPk(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const { title, orderBy, status } = req.body;

    if (req.file) {
      if (client.image) await deleteImage(client.image);
      client.image = await singleUpload(req.file, "clients");
    }

    // Update the client with new values
    Object.assign(client, {
      title: title ?? client.title,
      orderBy: orderBy !== undefined ? orderBy : client.orderBy,
      status: status ?? client.status,
    });

    await client.save();

    const jsonClient = client.toJSON();
    jsonClient.image = getFileUrl(jsonClient.image);

    return res.status(200).json({ success: true, data: jsonClient });
  } catch (err) {
    next(err);
  }
};

// DELETE Client
export const deleteClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const client = await Client.findByPk(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    if (client.image) await deleteImage(client.image);
    await client.destroy();

    return res
      .status(200)
      .json({ success: true, message: "Client deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// --- PUBLIC: Get active clients (for homepage etc.)
export const listPublicClients = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const clients = await Client.findAll({
      where: { status: "active" },
      order: [["orderBy", "ASC"]],
      attributes: ["id", "title", "image", "orderBy"], // keep it lightweight
    });

    const normalized = clients.map((c) => {
      const json = c.toJSON();
      json.image = getFileUrl(json.image);
      return json;
    });

    return res.status(200).json({
      success: true,
      data: normalized,
    });
  } catch (err) {
    next(err);
  }
};
