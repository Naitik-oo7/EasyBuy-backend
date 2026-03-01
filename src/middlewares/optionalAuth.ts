import jwt from "jsonwebtoken";
import User from "../models/user.model";
import RoleBasePermission from "../models/roleBasePermission.model";
import { NextFunction, Request, Response } from "express";

export default async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

      const user = await User.findByPk(decoded.id);
      if (user) {
        const rolePerm = await RoleBasePermission.findOne({
          where: { role: user.role },
        });

        // Normalize to array even if DB stores single string
        let permissions: string[] = [];
        if (rolePerm?.permissions) {
          if (Array.isArray(rolePerm.permissions)) {
            permissions = rolePerm.permissions;
          } else if (typeof rolePerm.permissions === "string") {
            // Could be JSON string, or plain string
            try {
              const parsed = JSON.parse(rolePerm.permissions);
              if (Array.isArray(parsed)) permissions = parsed;
              else if (typeof parsed === "string") permissions = [parsed];
              else permissions = [];
            } catch {
              // not JSON — treat as single permission string
              permissions = [rolePerm.permissions];
            }
          }
        }

        // Attach normalized permissions so hasPermission can read user.permissions
        // @ts-ignore
        user.permissions = permissions;
        // @ts-ignore
        req.user = user;
      }
    }
  } catch (err) {
    // ignore invalid token
  }
  next();
}
