import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IAnnouncementAttributes {
  id: number;
  title: string;
  description?: string;
  color?: string;
  backgroundColor?: string;
  status: "active" | "inactive";
  createdAt?: Date;
  updatedAt?: Date;
}

export type IAnnouncementCreationAttributes = Optional<
  IAnnouncementAttributes,
  "id" | "status" | "description"
>;

class Announcement
  extends Model<IAnnouncementAttributes, IAnnouncementCreationAttributes>
  implements IAnnouncementAttributes
{
  public id!: number;
  public title!: string;
  public description?: string;
  public color?: string;
  public backgroundColor?: string;

  public status!: "active" | "inactive";
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Announcement.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    color: { type: DataTypes.STRING(255), allowNull: true },
    backgroundColor: { type: DataTypes.STRING(255), allowNull: true },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    sequelize,
    tableName: "announcements",
    timestamps: true,
    underscored: true,
  }
);

export default Announcement;
