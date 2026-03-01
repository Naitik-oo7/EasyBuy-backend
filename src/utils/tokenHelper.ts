import { Response } from "express";
import jwt from "jsonwebtoken";

// ============ TOKEN HELPERS ============
const JWT_SECRET = process.env.JWT_SECRET as string;
// const REFRESH_SECRET = process.env.REFRESH_SECRET || JWT_SECRET + "_r";

export const signAccess = (payload: object) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
// export const signRefresh = (payload: object) =>
//   jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });

export const issueTokens = (res: Response, payload: object) => {
  const accessToken = signAccess(payload);
  // const refreshToken = signRefresh(payload);
  // res.cookie("refresh_token", refreshToken, {
  //   httpOnly: true,
  //   secure: process.env.NODE_ENV === "production",
  //   sameSite: "none",
  //   maxAge: 7 * 24 * 60 * 60 * 1000,
  // });
  return accessToken;
};
