import axios from "axios";
import Otp from "../models/otp.model";
import { Op } from "sequelize";

// Generate Mobile OTP
export const generateMobileOtp = async (mobile: string | number) => {
  const mobileStr = String(mobile).trim();

  // 🔹 Generate a random 6-digit OTP
  // const otp = Math.floor(1000 + Math.random() * 9000).toString();
  const otp = "1234";
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 min

  // ✅ Remove any previous OTPs for that number
  await Otp.destroy({ where: { mobile: mobileStr } });

  // ✅ Create new OTP record
  await Otp.create({
    mobile: mobileStr,
    otp,
    expiresAt,
    verified: false,
  });

  // ✅ Send SMS via Fast2SMS
  // try {
  //   const message = `Dear Customer, your Easy Buy OTP is ${otp}. Do not share this code with anyone.`;

  //   const url = `http://nimbusit.biz/api/SmsApi/SendSingleApi`;

  //   const params = {
  //     UserID: process.env.NIMBUS_USERNAME,
  //     Password: process.env.NIMBUS_PASSWORD,
  //     SenderID: process.env.NIMBUS_SENDER_ID,
  //     Phno: `91${mobileStr}`,
  //     Msg: message,
  //     EntityID: process.env.NIMBUS_ENTITY_ID,
  //     TemplateID: process.env.NIMBUS_TEMPLATE_ID,
  //   };

  //   const { data } = await axios.get(url, { params });

  //   return otp;
  // } catch (err: any) {
  //   console.error("❌ Nimbus OTP Error:", err?.response?.data || err.message);
  //   throw new Error("Failed to send OTP");
  // }

  return otp;
};

// Verify Mobile OTP
export const verifyMobileOtp = async (mobile: string | number, otp: string) => {
  const mobileStr = String(mobile).trim();

  const record = await Otp.findOne({
    where: {
      mobile: mobileStr,
      otp,
      expiresAt: { [Op.gt]: new Date() },
      verified: false,
    },
    order: [["createdAt", "DESC"]],
  });

  if (!record) {
    console.log(`❌ OTP invalid or expired for ${mobileStr}`);
    return false;
  }

  // ✅ Mark as verified
  record.verified = true;
  await record.save();

  // ✅ Delete old OTPs after success (cleanup)
  await Otp.destroy({ where: { mobile: mobileStr, otp: { [Op.ne]: otp } } });

  return true;
};

// Check if Mobile Verified
export const isMobileVerified = async (mobile: string | number) => {
  const mobileStr = String(mobile).trim();

  // 🔹 Check if any verified OTP exists recently (within last 1 hr)
  const record = await Otp.findOne({
    where: {
      mobile: mobileStr,
      verified: true,
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [["createdAt", "DESC"]],
  });

  return !!record;
};
