import Product from "./product.model";
import Category from "./category.model";
import ProductCategory from "./productCategory.model";
import ProductImage from "./productImage.model";
import User from "./user.model";
import Tagged from "./tagged.model";
import Tags from "./tags.model";
import ProductFaq from "./productFaq.model";
import ProductReview from "./productReview.model";
import BulkOrder from "./bulkOrder.model";
import Coupon from "./coupon.model";
import Cart from "./cart.model";
import CartProduct from "./cartProduct.model";
import CouponUsage from "./couponUsage.model";
import Address from "./address.model";
import OrderProduct from "./orderProduct.model";
import Order from "./order.model";
import OrderBillingAddress from "./orderBillingAddress.model";
import OrderShippingAddress from "./orderShippingAddress.model";
import CorporateCredit from "./corporateCredit.model";
import CorporateCreditHistory from "./corporateCreditHistory.model";
import OrderStatusHistory from "./orderStatusHistory.model";
import Wishlist from "./wishlist.model";
import Blog from "./blog.model";
import BlogComment from "./blogComment.model";
import Payment from "./payment.model";
import Inquiry from "./inquiry.model";
import RoleBasePermission from "./roleBasePermission.model";
import ProductReviewImage from "./productReviewImage.model";
import ProductRelated from "./productRelated.model";
import CategoryFaq from "./categoryFaq.model";

export function setupAssociations() {
  // Product ↔ Category (Many-to-Many)
  // cascade on join table is fine (removes ProductCategory rows when product/category removed)
  Product.belongsToMany(Category, {
    through: ProductCategory,
    foreignKey: "productId",
    otherKey: "categoryId",
    as: "categories",
    onDelete: "CASCADE",
  });

  Category.belongsToMany(Product, {
    through: ProductCategory,
    foreignKey: "categoryId",
    otherKey: "productId",
    as: "products",
    onDelete: "CASCADE",
  });

  // Product → ProductImage (One-to-Many) — safe to cascade (images are auxiliary)
  Product.hasMany(ProductImage, {
    foreignKey: "productId",
    as: "images",
    onDelete: "CASCADE",
    hooks: true,
  });

  ProductImage.belongsTo(Product, {
    foreignKey: "productId",
    as: "product",
  });

  // Product → Tagged (Polymorphic)
  Product.hasMany(Tagged, {
    foreignKey: "taggableId",
    constraints: false,
    scope: {
      taggable_type: "Product",
    },
    as: "tagged",
    // tagged entries are auxiliary, cascade is acceptable in DB or handle in app
  });

  Tagged.belongsTo(Product, {
    foreignKey: "taggableId",
    constraints: false,
    as: "product",
  });

  // Tagged → Tag (Standard)
  Tagged.belongsTo(Tags, {
    foreignKey: "tagId",
    as: "tag",
  });

  Tags.hasMany(Tagged, {
    foreignKey: "tagId",
    as: "tagged",
    onDelete: "CASCADE", // ✅ when tag is deleted, tagged entries auto-delete
    hooks: true,
  });

  // FAQs, Reviews -> auxiliary data, cascade OK
  Product.hasMany(ProductFaq, {
    foreignKey: "productId",
    as: "faqs",
    onDelete: "CASCADE",
  });

  ProductFaq.belongsTo(Product, {
    foreignKey: "productId",
    as: "product",
  });

  Product.hasMany(ProductReview, {
    foreignKey: "productId",
    as: "reviews",
    onDelete: "CASCADE",
  });

  ProductReview.belongsTo(Product, {
    foreignKey: "productId",
    as: "product",
  });

  // User ↔ Review
  User.hasMany(ProductReview, { foreignKey: "userId", as: "reviews" });
  ProductReview.belongsTo(User, { foreignKey: "userId", as: "user" });

  // Product → BulkOrder (auxiliary; cascade OK or optional)
  Product.hasMany(BulkOrder, {
    foreignKey: "productId",
    as: "bulkOrders",
    onDelete: "CASCADE",
  });

  BulkOrder.belongsTo(Product, {
    foreignKey: "productId",
    as: "product",
  });

  // Coupon -> Cart and CouponUsage relationships (do NOT cascade CouponUsage; keep history)
  Coupon.hasMany(Cart, { foreignKey: "couponId", as: "carts" });
  Cart.belongsTo(Coupon, { foreignKey: "couponId", as: "coupon" });

  Coupon.hasMany(CouponUsage, { foreignKey: "couponId", as: "usages" });
  CouponUsage.belongsTo(Coupon, { foreignKey: "couponId", as: "coupon" });

  // User ↔ CouponUsage (historical) — do not cascade
  User.hasMany(CouponUsage, { foreignKey: "userId", as: "couponUsages" });
  CouponUsage.belongsTo(User, { foreignKey: "userId", as: "user" });

  // User ↔ Cart (1:Many)
  User.hasMany(Cart, { foreignKey: "userId", as: "carts" });
  Cart.belongsTo(User, { foreignKey: "userId", as: "user" });

  // Cart ↔ CartProduct (ephemeral) — cascade OK
  Cart.hasMany(CartProduct, {
    foreignKey: "cartId",
    as: "cartProducts",
    onDelete: "CASCADE",
    hooks: true,
  });
  CartProduct.belongsTo(Cart, { foreignKey: "cartId", as: "cart" });

  // CartProduct ↔ Product (optional link)
  CartProduct.belongsTo(Product, { foreignKey: "productId", as: "product" });

  // Product → Corporate (user who owns the product)
  // IMPORTANT: do NOT cascade deletion of products when corporate is deleted.
  // Use soft-delete for corporate or set corporateId to null on corporate deletion (application logic).
  Product.belongsTo(User, { foreignKey: "corporateId", as: "corporateOwner" });

  // Corporate → Products (do NOT cascade)
  User.hasMany(Product, { foreignKey: "corporateId", as: "products" });

  // Self-referential corporate-user relationship (if you keep using User as corporate)
  User.hasMany(User, { foreignKey: "corporateId", as: "corporateUsers" });
  User.belongsTo(User, { foreignKey: "corporateId", as: "parentCorporate" });

  // Addresses
  User.hasMany(Address, {
    foreignKey: "userId",
    as: "addresses",
    onDelete: "CASCADE",
  });
  Address.belongsTo(User, { foreignKey: "userId", as: "user" });

  // Orders and OrderProducts: do not cascade critical order data
  Order.hasMany(OrderProduct, { foreignKey: "order_id", as: "orderProducts" });
  OrderProduct.belongsTo(Order, { foreignKey: "order_id", as: "order" });

  // Order ↔ OrderShippingAddress (1:1)
  // Remove cascade: keep shipping address even if order row is accidentally deleted (or prefer restricting deletion).
  Order.hasOne(OrderShippingAddress, {
    foreignKey: "orderId",
    as: "shippingAddress",
  });
  OrderShippingAddress.belongsTo(Order, {
    foreignKey: "orderId",
    as: "order",
  });

  // Order ↔ OrderBillingAddress (1:1) — same as shipping
  Order.hasOne(OrderBillingAddress, {
    foreignKey: "orderId",
    as: "billingAddress",
  });
  OrderBillingAddress.belongsTo(Order, {
    foreignKey: "orderId",
    as: "order",
  });

  // Corporate credit - do not cascade history
  User.hasOne(CorporateCredit, {
    foreignKey: "userId",
    as: "credit",
    onDelete: "CASCADE",
  });
  CorporateCredit.belongsTo(User, {
    foreignKey: "userId",
    as: "corporateUser",
  });

  User.hasMany(CorporateCreditHistory, {
    foreignKey: "userId",
    as: "creditHistory",
  });
  CorporateCreditHistory.belongsTo(User, { foreignKey: "userId", as: "user" });

  // Order status history
  Order.hasMany(OrderStatusHistory, {
    foreignKey: "orderId",
    as: "statusHistory",
  });
  OrderStatusHistory.belongsTo(Order, { foreignKey: "orderId" });

  // Wishlist ↔ User (ephemeral)
  User.hasMany(Wishlist, {
    foreignKey: "userId",
    as: "wishlistItems",
    onDelete: "CASCADE",
  });
  Wishlist.belongsTo(User, { foreignKey: "userId", as: "user" });

  // Wishlist ↔ Product (ephemeral)
  Product.hasMany(Wishlist, { foreignKey: "productId", as: "wishlistedBy" });
  Wishlist.belongsTo(Product, { foreignKey: "productId", as: "product" });

  // Order ↔ User (do NOT cascade deleting user -> orders)
  Order.belongsTo(User, { foreignKey: "userId", as: "user" });
  User.hasMany(Order, {
    foreignKey: "userId",
    as: "orders",
    onDelete: "CASCADE",
  });

  // Blog → Comments (ephemeral)
  Blog.hasMany(BlogComment, {
    foreignKey: "blogId",
    as: "comments",
    onDelete: "CASCADE",
  });
  BlogComment.belongsTo(Blog, { foreignKey: "blogId", as: "blog" });

  User.hasMany(BlogComment, {
    foreignKey: "userId",
    as: "blogComments",
    onDelete: "CASCADE",
  });
  BlogComment.belongsTo(User, { foreignKey: "userId", as: "user" });

  // OrderProduct ↔ Product (N:1) — DO NOT CASCADE: we must keep orderProduct records intact
  OrderProduct.belongsTo(Product, {
    foreignKey: "productId",
    as: "product",
    // onDelete: "RESTRICT" // optional - use DB constraint if you want to prevent deleting Product that is referenced in orders
  });
  Product.hasMany(OrderProduct, {
    foreignKey: "productId",
    as: "orderProducts",
    // onDelete omitted to avoid cascade; application should handle product deletions (soft-delete recommended)
  });

  Order.hasOne(Payment, {
    foreignKey: "orderId",
    as: "payment",
    constraints: false,
  });
  Payment.belongsTo(Order, {
    foreignKey: "orderId",
    as: "order",
    constraints: false,
  });

  OrderStatusHistory.belongsTo(User, {
    foreignKey: "changedBy",
    as: "changedByUser",
  });
  User.hasMany(OrderStatusHistory, {
    foreignKey: "changedBy",
    as: "statusChanges",
  });

  // In models/index.ts or after defining both models
  Inquiry.belongsTo(Product, { foreignKey: "productId", as: "product" });
  Product.hasMany(Inquiry, { foreignKey: "productId", as: "inquiries" });

  // Category ↔ User (corporate ownership)
  Category.belongsTo(User, { foreignKey: "corporateId", as: "corporateOwner" });
  User.hasMany(Category, {
    foreignKey: "corporateId",
    as: "categories",
    onDelete: "CASCADE",
  });

  User.hasMany(Order, {
    foreignKey: "corporateId",
    as: "corporateOrders",
  });
  Order.belongsTo(User, {
    foreignKey: "corporateId",
    as: "corporate",
  });

  ProductReview.hasMany(ProductReviewImage, {
    foreignKey: "reviewId",
    as: "images",
    onDelete: "CASCADE",
  });

  ProductReviewImage.belongsTo(ProductReview, {
    foreignKey: "reviewId",
    as: "review",
  });

  Product.belongsToMany(Product, {
    through: ProductRelated,
    as: "relatedProducts",
    foreignKey: "productId",
    otherKey: "relatedProductId",
    onDelete: "CASCADE",
  });

  Product.belongsToMany(Product, {
    through: ProductRelated,
    as: "relatedToProducts",
    foreignKey: "relatedProductId",
    otherKey: "productId",
    onDelete: "CASCADE",
  });

  Category.hasMany(CategoryFaq, {
    foreignKey: "categoryId",
    as: "faqs",
  });
}
