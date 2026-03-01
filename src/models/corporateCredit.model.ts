import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class CorporateCredit extends Model {
  public id!: number;
  public userId!: number; // corporate user
  public corporateId!: number; // parent corporate
  public totalCredit!: number;
  public usedCredit!: number;
  public availableCredit!: number;
}

CorporateCredit.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    corporateId: { type: DataTypes.INTEGER, allowNull: false },
    totalCredit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    usedCredit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    availableCredit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: "corporate_credit",
    timestamps: true,
    underscored: true,
  }
);

export default CorporateCredit;
