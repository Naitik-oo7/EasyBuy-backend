import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IBulkOrderAttributes {
  id: number;
  productId?: number;
  name: string;
  percentage: number;
  quantity: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IBulkOrderCreationAttributes = Optional<
  IBulkOrderAttributes,
  "id" | "productId"
>;

class BulkOrder
  extends Model<IBulkOrderAttributes, IBulkOrderCreationAttributes>
  implements IBulkOrderAttributes
{
  public id!: number;
  public productId?: number;
  public name!: string;
  public percentage!: number;
  public quantity!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

BulkOrder.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    percentage: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "bulk_orders",
    timestamps: true,
    underscored: true,
  }
);

export default BulkOrder;
