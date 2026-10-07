import { hashPassword, verifyDummyPassword, verifyPassword } from './password.js';

// Returns the new user, or null if the email is already registered.
export async function registerUser(users, { email, password }) {
  const passwordHash = await hashPassword(password);
  return users.create({ email, passwordHash });
}

// Returns the user (without the password hash) when the credentials match, otherwise null.
export async function authenticateUser(users, { email, password }) {
  const user = await users.findByEmailWithPassword(email);
  if (!user) {
    await verifyDummyPassword(password);
    return null;
  }

  const { passwordHash, ...account } = user;
  return (await verifyPassword(passwordHash, password)) ? account : null;
}
