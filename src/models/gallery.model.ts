import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IGalleryAttributes {
  id: number;
  type: "image" | "video";
  title: string;
  description?: string | null;
  image?: string | null;
  videoUrl?: string | null;
  status: "active" | "inactive";
  orderBy: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IGalleryCreationAttributes = Optional<
  IGalleryAttributes,
  "id" | "image" | "videoUrl" | "status" | "orderBy" | "description"
>;

class Gallery
  extends Model<IGalleryAttributes, IGalleryCreationAttributes>
  implements IGalleryAttributes
{
  public id!: number;
  public type!: "image" | "video";
  public title!: string;
  public description!: string | null;
  public image!: string | null;
  public videoUrl!: string | null;
  public status!: "active" | "inactive";
  public orderBy!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Gallery.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    type: { type: DataTypes.ENUM("image", "video"), allowNull: false },

    title: { type: DataTypes.STRING(255), allowNull: false },

    description: { type: DataTypes.TEXT, allowNull: true },

    image: { type: DataTypes.STRING(255), allowNull: true },

    videoUrl: { type: DataTypes.TEXT, allowNull: true },

    status: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },

    orderBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 0 },
    },
  },
  {
    sequelize,
    tableName: "gallery",
    timestamps: true,
    underscored: true,

    hooks: {
      afterSave: async () => {
        const items = await Gallery.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const newOrder = i + 1;

          if (item && item.orderBy !== newOrder) {
            item.orderBy = newOrder;
            await item.save({ fields: ["orderBy"], hooks: false });
          }
        }
      },

      afterDestroy: async () => {
        const items = await Gallery.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const newOrder = i + 1;

          if (item && item.orderBy !== newOrder) {
            item.orderBy = newOrder;
            await item.save({ fields: ["orderBy"], hooks: false });
          }
        }
      },
    },
  }
);

export default Gallery;
