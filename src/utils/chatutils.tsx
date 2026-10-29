/**
 * The profile name from the cached `userInfo`, or "User". It used to read
 * full_name, which is null for every profile made since KAN-76, and threw.
 */
export function cachedProfileName(raw: string | null): string {
  try {
    return (raw && JSON.parse(raw)?.username) || "User";
  } catch {
    return "User";
  }
}

export function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}
