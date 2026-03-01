import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import Tags from "./tags.model";

export interface ITaggedAttributes {
  id: number;
  taggableType: string;
  taggableId: number;
  tagId: number;
  tag?: Tags;
}

export type ITaggedCreationAttributes = Optional<ITaggedAttributes, "id">;

class Tagged
  extends Model<ITaggedAttributes, ITaggedCreationAttributes>
  implements ITaggedAttributes
{
  public id!: number;
  public taggableType!: string;
  public taggableId!: number;
  public tagId!: number;
  // Add association property
  public tag?: Tags;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Tagged.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    taggableType: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    taggableId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tagId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "tagged",
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ["taggable_type", "taggable_id"],
      },
      {
        fields: ["tag_id"],
      },
      {
        unique: true,
        fields: ["taggable_type", "taggable_id", "tag_id"],
      },
    ],
  }
);

export default Tagged;
