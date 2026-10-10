// The name to greet someone by: the first word of their account name ("Sudhanshu Thakur" gives
// "Sudhanshu"). Accounts created before names were collected have none and get null; callers
// then greet without a name rather than guessing one from the email address.
export function displayName(user) {
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  return name ? name.split(/\s+/)[0] : null;
}

// One letter for an avatar.
export function initial(user) {
  return (displayName(user) ?? user?.email ?? '?').charAt(0).toUpperCase();
}
