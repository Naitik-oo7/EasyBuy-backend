import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import bcrypt from "bcrypt";
import { generateUniqueUsername } from "../utils/generateUsernameHelper";

interface UserAttributes {
  id: number;
  name?: string;
  email: string;
  username?: string;
  password?: string;
  mobile?: string;
  companyName?: string | null;
  slug?: string;
  dealerCode?: string | null;
  image?: string | null;
  designation?: string | null;
  description?: string | null;
  role?: string;
  type?: "default" | "google" | "facebook";
  status?: string;
  creditSystem: boolean;
  fcmToken?: string;
  socialId?: string;
  corporateId?: number | null;
  gstNumber?: string | null;
  permissions?: string[];

  // 🧩 Added for legacy import compatibility
  birthday?: Date | null;
  gender?: "1" | "2" | "3" | null; // 1=Male, 2=Female, 3=Other

  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null; // for paranoid soft delete
}

interface UserCreationAttributes
  extends Optional<
    UserAttributes,
    | "id"
    | "password"
    | "mobile"
    | "username"
    | "name"
    | "image"
    | "companyName"
    | "slug"
    | "gstNumber"
    | "dealerCode"
    | "designation"
    | "description"
    | "role"
    | "creditSystem"
    | "type"
    | "fcmToken"
    | "socialId"
    | "status"
    | "corporateId"
    | "birthday"
    | "gender"
    | "deletedAt"
  > {}

class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  public id!: number;
  public name!: string;
  public email!: string;
  public username?: string;
  public password?: string;
  public mobile?: string;
  public role?: string;
  public image?: string | null;
  public type!: "default" | "google" | "facebook";
  public companyName!: string | null;
  public slug!: string;
  public dealerCode!: string | null;
  public description!: string | null;
  public gstNumber!: string | null;
  public designation!: string | null;
  public fcmToken?: string;
  public socialId?: string;
  public status?: string;
  public corporateId?: number | null;
  public creditSystem!: boolean;

  // Legacy fields
  public birthday?: Date | null;
  public gender?: "1" | "2" | "3" | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt!: Date | null;

  // Validate password
  public static async validatePassword(
    storedPassword: string,
    enteredPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(enteredPassword, storedPassword);
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    mobile: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING,
      defaultValue: "user",
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM("default", "google", "facebook"),
      defaultValue: "default",
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    companyName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    dealerCode: { type: DataTypes.STRING, allowNull: true },
    gstNumber: { type: DataTypes.STRING, allowNull: true },
    designation: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.STRING, allowNull: true },
    status: {
      type: DataTypes.STRING,
      defaultValue: "active",
    },
    creditSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    fcmToken: { type: DataTypes.STRING, allowNull: true },
    socialId: { type: DataTypes.STRING, allowNull: true },
    corporateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    // 🧩 Added legacy fields
    birthday: { type: DataTypes.DATE, allowNull: true },
    gender: {
      type: DataTypes.ENUM("1", "2", "3"),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
    underscored: true,
    paranoid: true, // adds deleted_at automatically
    hooks: {
      beforeCreate: async (user) => {
        if (!user.username) {
          // Generate username from name if available, otherwise use companyName
          const nameToUse = user.name || user.companyName;
          if (nameToUse) {
            user.username = await generateUniqueUsername(nameToUse);
          }
        }
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
      beforeUpdate: async (user) => {
        if (user.password && user.changed("password")) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
    },
  }
);

export default User;
