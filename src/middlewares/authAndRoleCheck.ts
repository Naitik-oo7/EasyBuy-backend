import { Request, Response, NextFunction } from "express";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import User from "../models/user.model";
import RoleBasePermission from "../models/roleBasePermission.model";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

type RequiredCheck = string | string[] | undefined;

const authAndRoleCheck =
  (required?: RequiredCheck) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Please provide authorization token" });
    }

    const token = authHeader.slice(7).trim();
    let payload: any;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      payload = typeof decoded === "string" ? JSON.parse(decoded) : decoded;
    } catch (err: any) {
      const msg =
        err instanceof TokenExpiredError
          ? "Token has expired"
          : "Invalid token";
      return res.status(401).json({ message: msg });
    }

    const user = await User.findByPk(payload.id);
    if (!user) return res.status(401).json({ message: "User not found" });

    // ✅ Superadmin always allowed
    if (user.role === "superadmin") {
      req.user = user;
      return next();
    }

    // ✅ Admin also always allowed (for backward compatibility)
    if (user.role === "admin") {
      req.user = user;
      return next();
    }

    if (!required) {
      req.user = user;
      return next();
    }

    const rolePerm = await RoleBasePermission.findOne({
      where: { role: user.role },
    });

    if (!rolePerm || !Array.isArray(rolePerm.permissions)) {
      return res
        .status(403)
        .json({ message: "No permissions assigned to this role" });
    }

    const userPerms = rolePerm.permissions;

    const requiredPerms = Array.isArray(required) ? required : [required];
    const hasPermission = requiredPerms.some((perm) =>
      userPerms.includes(perm)
    );

    if (!hasPermission) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    req.user = user;
    next();
  };

export default authAndRoleCheck;
