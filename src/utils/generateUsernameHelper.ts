import User from "../models/user.model";

export async function generateUniqueUsername(name: string): Promise<string> {
  let base = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!base) base = "user";

  let username = base;
  let counter = 1;

  while (
    await User.findOne({
      where: { username },
      paranoid: false, // 🔥 include deleted users
    })
  ) {
    username = `${base}${counter}`;
    counter++;
  }

  return username;
}
