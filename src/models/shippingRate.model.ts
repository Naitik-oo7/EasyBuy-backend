import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface IShippingRate {
  id: number;
  state: string;
  standardRate: number;
  additional_rate: number;
  status: string;
}

type IShippingRateCreation = Optional<IShippingRate, "id">;

class ShippingRate
  extends Model<IShippingRate, IShippingRateCreation>
  implements IShippingRate
{
  public id!: number;
  public state!: string;
  public standardRate!: number;
  public additional_rate!: number;
  public status!: string;
}

ShippingRate.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    state: { type: DataTypes.STRING(100), allowNull: false },
    standardRate: { type: DataTypes.FLOAT, allowNull: false },
    additional_rate: { type: DataTypes.FLOAT, allowNull: false },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    sequelize,
    tableName: "shipping_rates",
    timestamps: true,
    underscored: true,
  }
);

export default ShippingRate;
