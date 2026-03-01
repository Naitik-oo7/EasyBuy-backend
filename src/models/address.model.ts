// models/address.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IAddressAttributes {
  id: number;
  userId: number;
  name: string;
  email: string;
  companyName?: string | null;
  mobileNumber: string;
  pinCode: string;
  address: string;
  locality: string;
  city: string;
  state: string;
  gstNumber?: string | null;
  isDefault: boolean;
  addressType: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IAddressCreationAttributes = Optional<
  IAddressAttributes,
  | "id"
  | "companyName"
  | "email"
  | "gstNumber"
  | "isDefault"
  | "status"
  | "addressType"
  | "createdAt"
  | "updatedAt"
>;

class Address
  extends Model<IAddressAttributes, IAddressCreationAttributes>
  implements IAddressAttributes
{
  public id!: number;
  public userId!: number;
  public name!: string;
  public email!: string;
  public companyName!: string | null;
  public mobileNumber!: string;
  public pinCode!: string;
  public address!: string;
  public locality!: string;
  public city!: string;
  public state!: string;
  public gstNumber!: string | null;
  public isDefault!: boolean;
  public addressType!: string;
  public status!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Address.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: true },
    companyName: { type: DataTypes.STRING(255), allowNull: true },
    mobileNumber: { type: DataTypes.STRING(20), allowNull: false },
    pinCode: { type: DataTypes.STRING(10), allowNull: false },
    address: { type: DataTypes.TEXT, allowNull: false },
    locality: { type: DataTypes.STRING(255), allowNull: true },
    city: { type: DataTypes.STRING(255), allowNull: false },
    state: { type: DataTypes.STRING(255), allowNull: false },
    gstNumber: { type: DataTypes.STRING(25), allowNull: true },
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
    addressType: {
      type: DataTypes.ENUM("shipping", "business"),
      allowNull: false,
      defaultValue: "shipping",
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    sequelize,
    tableName: "addresses",
    timestamps: true,
    underscored: true,
  }
);

export default Address;
