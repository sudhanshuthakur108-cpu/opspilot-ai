// The name to greet someone by. Accounts have no name field yet, so unless the server sends one
// this uses the first word of the email's local part ("ada.lovelace@…" gives "Ada"). It returns
// null when nothing name-like is there; the email address itself is never used as a name.
export function displayName(user) {
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  if (name) return name.split(/\s+/)[0];

  const localPart = user?.email?.split('@')[0] ?? '';
  const word = localPart.split(/[._\-+\d]+/).find((part) => /^\p{L}{2,}$/u.test(part));
  return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : null;
}

// One letter for an avatar.
export function initial(user) {
  return (displayName(user) ?? user?.email ?? '?').charAt(0).toUpperCase();
}
