export const hasPermission = (user: any, key: string): boolean => {
  if (!user) return false;

  // permissions might be on user.permissions or user.dataValues.permissions
  const raw = user.permissions ?? user.dataValues?.permissions ?? [];

  // If it's a string (single permission), normalize to array
  const perms = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];

  return perms.includes(key);
};
