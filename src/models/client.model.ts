import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IClientAttributes {
  id: number;
  title: string;
  image: string | null;
  orderBy: number;
  status: "active" | "inactive";
  createdAt?: Date;
  updatedAt?: Date;
}

export type IClientCreationAttributes = Optional<
  IClientAttributes,
  "id" | "image" | "status"
>;

class Client
  extends Model<IClientAttributes, IClientCreationAttributes>
  implements IClientAttributes
{
  public id!: number;
  public title!: string;
  public image!: string | null;
  public orderBy!: number;
  public status!: "active" | "inactive";
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Client.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    image: { type: DataTypes.STRING(255), allowNull: true },
    orderBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1,
      },
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    sequelize,
    tableName: "clients",
    timestamps: true,
    underscored: true,
    hooks: {
      // After saving, ensure orderBy is unique and sequential
      afterSave: async (client) => {
        // Get all clients ordered by current orderBy value, then by id for consistency
        const allClients = await Client.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        // Renumber all clients sequentially
        for (let i = 0; i < allClients.length; i++) {
          const item = allClients[i];
         const newOrder = i + 1;
        if (item &&item.orderBy !== newOrder) {
            item.orderBy = newOrder;
            await item.save({ fields: ["orderBy"], hooks: false });
          }

        }
      },
      // Also renumber after deletion
      afterDestroy: async () => {
        // Get all clients ordered by current orderBy value, then by id for consistency
        const allClients = await Client.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        // Renumber all clients sequentially
        for (let i = 0; i < allClients.length; i++) {
          const item = allClients[i];
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

export default Client;
