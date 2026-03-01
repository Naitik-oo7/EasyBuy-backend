// src/models/chefWear.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IChefWearAttributes {
  id: number;
  title: string | null;
  description: string | null;
  link: string | null;
  backgroundImage: string | null;
  images: any[];
  updatedAt?: Date;
}

export type IChefWearCreationAttributes = Optional<
  IChefWearAttributes,
  "id" | "title" | "description" | "link" | "backgroundImage" | "images"
>;

class ChefWear
  extends Model<IChefWearAttributes, IChefWearCreationAttributes>
  implements IChefWearAttributes
{
  public id!: number;
  public title!: string | null;
  public description!: string | null;
  public link!: string | null;
  public backgroundImage!: string | null;
  public images!: any[];
  public readonly updatedAt!: Date;
}

ChefWear.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    title: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    link: { type: DataTypes.STRING, allowNull: true },
    backgroundImage: { type: DataTypes.STRING, allowNull: true },
    images: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
  },
  {
    tableName: "chef_wear",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default ChefWear;
