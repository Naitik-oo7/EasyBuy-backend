import sequelize from "../config/database";
import RoleBasePermission from "./roleBasePermission.model";
import User from "./user.model";
import Category from "./category.model";
import Option from "./option.model";
import ProductCategory from "./productCategory.model";
import ProductImage from "./productImage.model";
import Product from "./product.model";
import Tags from "./tags.model";
import Tagged from "./tagged.model";
import BulkOrder from "./bulkOrder.model";
import ProductFaq from "./productFaq.model";
import ProductReview from "./productReview.model";
import Cart from "./cart.model";
import CartProduct from "./cartProduct.model";
import Coupon from "./coupon.model";
import CouponUsage from "./couponUsage.model";
import Address from "./address.model";
import Announcement from "./announcement.model";
import BlogComment from "./blogComment.model";
import Blog from "./blog.model";
import Client from "./client.model";
import CorporateCredit from "./corporateCredit.model";
import CorporateCreditHistory from "./corporateCreditHistory.model";
import OrderBillingAddress from "./orderBillingAddress.model";
import OrderShippingAddress from "./orderShippingAddress.model";
import OrderProduct from "./orderProduct.model";
import OrderStatusHistory from "./orderStatusHistory.model";
import Order from "./order.model";
import Page from "./page.model";
import ShippingRate from "./shippingRate.model";
import Slider from "./slider.model";
import Testimonial from "./testimonial.model";
import Wishlist from "./wishlist.model";
import Otp from "./otp.model";
import NewsletterSubscriber from "./newsletterSubscriber.model";
import Festival from "./festival.model";

const db = {
  sequelize,
  Address,
  Announcement,
  BlogComment,
  Blog,
  BulkOrder,
  Cart,
  CartProduct,
  Category,
  Client,
  CorporateCredit,
  CorporateCreditHistory,
  Coupon,
  CouponUsage,
  Option,
  OrderBillingAddress,
  OrderShippingAddress,
  OrderProduct,
  OrderStatusHistory,
  Order,
  Page,
  Product,
  ProductCategory,
  ProductFaq,
  ProductImage,
  ProductReview,
  RoleBasePermission,
  ShippingRate,
  Slider,
  Tags,
  Tagged,
  Testimonial,
  User,
  Wishlist,
  Otp,
  NewsletterSubscriber,
  Festival,
};

export default db;
