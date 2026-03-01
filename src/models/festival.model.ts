import { DataTypes, Model, Optional, Op } from "sequelize";
import sequelize from "../config/database";

export interface IFestivalAttributes {
  id: number;
  type: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date | null;
}

export type IFestivalCreationAttributes = Optional<
  IFestivalAttributes,
  "id" | "createdAt" | "updatedAt"
>;

class Festival
  extends Model<IFestivalAttributes, IFestivalCreationAttributes>
  implements IFestivalAttributes
{
  public id!: number;
  public type!: string;
  public status!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date | null;
}

Festival.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "inactive",
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "festivals",
    sequelize,
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: async (festival) => {
        // If trying to create an active festival, deactivate any existing active festival
        if (festival.status === "active") {
          await Festival.update(
            { status: "inactive" },
            { where: { status: "active" } }
          );
        }
      },
      beforeUpdate: async (festival) => {
        // If trying to activate this festival, deactivate any existing active festival
        if (festival.changed("status") && festival.status === "active") {
          await Festival.update(
            { status: "inactive" },
            { where: { status: "active", id: { [Op.ne]: festival.id } } }
          );
        }
      },
    },
  }
);

export default Festival;
