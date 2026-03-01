import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface OrderStatusHistoryAttributes {
  id: number;
  orderId: number;
  status: string;
  changedBy?: number | null;
  note?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OrderStatusHistoryCreation = Optional<
  OrderStatusHistoryAttributes,
  "id" | "note" | "changedBy" | "createdAt" | "updatedAt"
>;

class OrderStatusHistory
  extends Model<OrderStatusHistoryAttributes, OrderStatusHistoryCreation>
  implements OrderStatusHistoryAttributes
{
  public id!: number;
  public orderId!: number;
  public status!: string;
  public note?: string | null;
  public changedBy?: number | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

OrderStatusHistory.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(50), allowNull: false },
    changedBy: { type: DataTypes.INTEGER, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: "order_status_history",
    timestamps: true,
    underscored: true,
  }
);

export default OrderStatusHistory;
