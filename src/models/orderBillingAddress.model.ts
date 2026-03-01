import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface OrderBillingAddressAttributes {
  id: number;
  order_id: number;
  name: string;
  email?: string | null;
  companyName?: string | null;
  mobileNumber: string;
  pinCode: string;
  address: string;
  locality: string;
  city: string;
  state: string;
  gstNumber?: string | null;
}

interface OrderBillingAddressCreationAttributes
  extends Optional<OrderBillingAddressAttributes, "id"> {}

class OrderBillingAddress
  extends Model<
    OrderBillingAddressAttributes,
    OrderBillingAddressCreationAttributes
  >
  implements OrderBillingAddressAttributes
{
  public id!: number;
  public order_id!: number;
  public name!: string;
  public email?: string | null;
  public companyName?: string | null;
  public mobileNumber!: string;
  public pinCode!: string;
  public address!: string;
  public locality!: string;
  public city!: string;
  public state!: string;
  public gstNumber?: string | null;
}

OrderBillingAddress.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    order_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: true },
    companyName: { type: DataTypes.STRING(255), allowNull: true },
    mobileNumber: { type: DataTypes.STRING(20), allowNull: false },
    pinCode: { type: DataTypes.STRING(20), allowNull: false },
    address: { type: DataTypes.TEXT, allowNull: false },
    locality: { type: DataTypes.STRING(255), allowNull: false },
    city: { type: DataTypes.STRING(255), allowNull: false },
    state: { type: DataTypes.STRING(255), allowNull: false },
    gstNumber: { type: DataTypes.STRING(55), allowNull: true },
  },
  {
    tableName: "order_billing_address",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default OrderBillingAddress;
