import Category from "../models/category.model";

/**
 * Recursively builds category breadcrumb chain
 * e.g. [Parent Category, Child Category, Subcategory]
 */
export async function buildCategoryBreadcrumb(category: any) {
  const chain: any[] = [];
  let current = category;

  while (current && current.parentId) {
    const parent = await Category.findByPk(current.parentId, {
      attributes: ["id", "title", "slug", "parentId"],
    });
    if (!parent) break;
    chain.unshift(parent.toJSON());
    current = parent;
  }

  return chain;
}
// Pick the deepest (most specific) category
export async function getDeepestCategory(categories: any[]) {
  if (!categories?.length) return null;

  let deepestCategory = null;
  let maxDepth = -1;

  for (const cat of categories) {
    let depth = 0;
    let current = cat;

    while (current?.parentId) {
      const parent = await Category.findOne({
        where: { id: current.parentId },
        attributes: ["id", "parentId"],
      });

      if (!parent) break;
      depth++;
      current = parent;
    }

    if (depth > maxDepth) {
      maxDepth = depth;
      deepestCategory = cat;
    }
  }

  return deepestCategory;
}

export function getDeepestCategoryInMemory(
  categories: any[],
  categoryMap: Map<number, any>
) {
  if (!categories?.length) return null;

  let deepest = null;
  let maxDepth = -1;

  for (const cat of categories) {
    let depth = 0;
    let current = cat;

    while (current?.parentId) {
      current = categoryMap.get(current.parentId);
      if (!current) break;
      depth++;
    }

    if (depth > maxDepth) {
      maxDepth = depth;
      deepest = cat;
    }
  }

  return deepest;
}

export function buildBreadcrumbInMemory(
  category: any,
  categoryMap: Map<number, any>
) {
  const chain: any[] = [];
  let current = category;

  while (current?.parentId) {
    const parent = categoryMap.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }

  return chain;
}
