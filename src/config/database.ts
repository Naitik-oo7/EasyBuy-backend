import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  logging: false,

  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

export default sequelize;