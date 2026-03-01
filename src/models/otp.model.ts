import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface OtpAttributes {
  id: number;
  userId?: number | null;
  mobile?: string | null;
  email?: string | null;
  otp: string;
  expiresAt: Date;
  verified: boolean;
}

type OtpCreation = Optional<OtpAttributes, "id" | "userId" | "verified">;

class Otp extends Model<OtpAttributes, OtpCreation> implements OtpAttributes {
  public id!: number;
  public userId!: number | null;
  public mobile!: string | null;
  public email!: string | null;
  public otp!: string;
  public expiresAt!: Date;
  public verified!: boolean;
}

Otp.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    mobile: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    otp: { type: DataTypes.STRING(10), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, tableName: "otps", timestamps: true, underscored: true }
);

export default Otp;
