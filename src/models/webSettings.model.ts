import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface WebSettingsAttributes {
  id: number;
  websiteTitle: string;
  tagline?: string | null;
  logo?: string | null;
  favicon?: string | null;
  email?: string | null;
  primaryPhone?: string | null;
  secondaryPhone?: string | null;
  whatsappNumber?: string | null;
  address?: string | null;
  marketingOffice?: string | null;
  factoryAddress?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  linkedinUrl?: string | null;
  youtubeUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  ogImage?: string | null;
  footerText?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  audio?: string | null;
  maintenanceMode: boolean;
}
type WebSettingsCreation = Optional<
  WebSettingsAttributes,
  "id" | "maintenanceMode"
>;

class WebSettings
  extends Model<WebSettingsAttributes, WebSettingsCreation>
  implements WebSettingsAttributes
{
  public id!: number;
  public websiteTitle!: string;
  public tagline?: string;
  public logo?: string;
  public favicon?: string;
  public email?: string;
  public primaryPhone?: string;
  public secondaryPhone?: string;
  public whatsappNumber?: string;
  public address?: string;
  public marketingOffice?: string;
  public factoryAddress?: string;
  public facebookUrl?: string;
  public instagramUrl?: string;
  public twitterUrl?: string;
  public linkedinUrl?: string;
  public youtubeUrl?: string;
  public metaTitle?: string;
  public metaDescription?: string;
  public metaKeywords?: string;
  public ogImage?: string;
  public footerText?: string;
  public primaryColor?: string;
  public secondaryColor?: string;
  public audio?: string;
  public maintenanceMode!: boolean;
}

WebSettings.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    websiteTitle: { type: DataTypes.STRING, allowNull: false },
    tagline: DataTypes.STRING,
    logo: DataTypes.STRING,
    favicon: DataTypes.STRING,
    email: DataTypes.STRING,
    primaryPhone: DataTypes.STRING,
    secondaryPhone: DataTypes.STRING,
    whatsappNumber: DataTypes.STRING,
    address: DataTypes.STRING,
    marketingOffice: DataTypes.STRING,
    factoryAddress: DataTypes.STRING,
    facebookUrl: DataTypes.STRING,
    instagramUrl: DataTypes.STRING,
    twitterUrl: DataTypes.STRING,
    linkedinUrl: DataTypes.STRING,
    youtubeUrl: DataTypes.STRING,
    metaTitle: DataTypes.STRING,
    metaDescription: DataTypes.TEXT,
    metaKeywords: DataTypes.TEXT,
    ogImage: DataTypes.STRING,
    footerText: DataTypes.STRING,
    primaryColor: DataTypes.STRING,
    secondaryColor: DataTypes.STRING,
    audio: DataTypes.STRING,
    maintenanceMode: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    tableName: "web_settings",
    modelName: "WebSettings",
    underscored: true,
  }
);

export default WebSettings;
