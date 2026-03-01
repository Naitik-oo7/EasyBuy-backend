import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class CorporateCreditHistory extends Model {
  public id!: number;
  public userId!: number;
  public corporateId!: number;
  public change!: number; // +ve when added, -ve when spent
  public reason!: string | null;
}

CorporateCreditHistory.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    corporateId: { type: DataTypes.INTEGER, allowNull: false },
    change: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING, allowNull: true },
  },
  {
    sequelize,
    tableName: "corporate_credit_history",
    timestamps: true,
    underscored: true,
  }
);

export default CorporateCreditHistory;
