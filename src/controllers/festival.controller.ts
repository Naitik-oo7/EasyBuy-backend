import { Request, Response, NextFunction } from "express";
import { Op } from "sequelize";
import Festival from "../models/festival.model";

// CREATE FESTIVAL
export const createFestival = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type, status } = req.body;

    // Validate required fields
    if (!type) {
      return res.status(400).json({ message: "Type is required" });
    }

    // If trying to create an active festival, deactivate any existing active festival
    if (status === "active") {
      await Festival.update(
        { status: "inactive" },
        { where: { status: "active" } }
      );
    }

    const festival = await Festival.create({
      type,
      status: status || "inactive",
    });

    return res.status(201).json({
      success: true,
      data: festival,
    });
  } catch (err) {
    next(err);
  }
};

// GET ALL FESTIVALS (Admin)
export const getAllFestivals = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const festivals = await Festival.findAll({
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: festivals,
    });
  } catch (err) {
    next(err);
  }
};

// GET ACTIVE FESTIVAL (Public)
export const getActiveFestival = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const festival = await Festival.findOne({
      where: { status: "active" },
    });

    // Return null if no active festival found
    return res.status(200).json({
      success: true,
      data: festival || null,
    });
  } catch (err) {
    next(err);
  }
};

// GET FESTIVAL BY ID
export const getFestivalById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const festival = await Festival.findByPk(req.params.id);
    if (!festival) {
      return res.status(404).json({ message: "Festival not found" });
    }

    return res.status(200).json({
      success: true,
      data: festival,
    });
  } catch (err) {
    next(err);
  }
};

// UPDATE FESTIVAL
export const updateFestival = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const festival = await Festival.findByPk(req.params.id);
    if (!festival) {
      return res.status(404).json({ message: "Festival not found" });
    }

    const { type, status } = req.body;

    // If trying to activate this festival, deactivate any existing active festival
    if (status === "active") {
      await Festival.update(
        { status: "inactive" },
        { where: { status: "active" } }
      );
    }

    await Festival.update(
      {
        type,
        status,
      },
      { where: { id: req.params.id } }
    );

    const updatedFestival = await Festival.findByPk(req.params.id);
    return res.status(200).json({
      success: true,
      data: updatedFestival,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE FESTIVAL
export const deleteFestival = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const festival = await Festival.findByPk(req.params.id);
    if (!festival) {
      return res.status(404).json({ message: "Festival not found" });
    }

    await Festival.destroy({ where: { id: req.params.id } });
    return res.status(200).json({
      success: true,
      message: "Festival deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};
