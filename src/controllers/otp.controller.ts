import { Request, Response, NextFunction } from "express";
import { generateMobileOtp, verifyMobileOtp } from "../utils/otpHelper";

export const sendOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number is required" });
    }
    const otp = await generateMobileOtp(mobile);

    // TODO: integrate SMS provider like MSG91 / Twilio here

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully to mobile number",
    });
  } catch (err) {
    next(err);
  }
};

export const verifyOtpController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res
        .status(400)
        .json({ message: "Mobile number and OTP are required" });
    }

    const isValid = await verifyMobileOtp(mobile, otp);

    if (!isValid) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    return res.status(200).json({
      success: true,
      message: "Mobile number verified successfully",
    });
  } catch (err) {
    next(err);
  }
};
