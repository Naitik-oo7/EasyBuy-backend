import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ITagAttributes {
  id: number;
  namespace: string;
  slug: string;
  name: string;
}

export type ITagCreationAttributes = Optional<ITagAttributes, "id">;

class Tags
  extends Model<ITagAttributes, ITagCreationAttributes>
  implements ITagAttributes
{
  public id!: number;
  public namespace!: string;
  public slug!: string;
  public name!: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Tags.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    namespace: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "tags",
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["slug", "namespace"],
      },
    ],
  }
);

export default Tags;
