// The one rule for a profile name (KAN-67), used by sign-up and rename.
// Pure, so it is unit-tested without the database.

export const MAX_PROFILE_NAME = 40;

// Letters, marks and digits in any script, emoji with their joiners, skin
// tones and variation selectors, spaces and a few separators.
const ALLOWED =
  /^[\p{L}\p{M}\p{N}\p{Extended_Pictographic}\p{Emoji_Component} _.'-]+$/u;

/** NFC, trimmed, inner whitespace collapsed: how sign-up stores a name and sign-in looks it up. */
export const normalizeProfileName = (raw) =>
  typeof raw === "string"
    ? raw.normalize("NFC").trim().replace(/\s+/g, " ")
    : "";

/** The name as stored; throws a user-facing message when it is not allowed. */
export function cleanProfileName(raw) {
  const name = normalizeProfileName(raw);
  if (!name) throw new Error("Enter a profile name");
  if ([...name].length > MAX_PROFILE_NAME) {
    throw new Error(
      `Profile name must be ${MAX_PROFILE_NAME} characters or fewer`,
    );
  }
  if (!ALLOWED.test(name)) {
    throw new Error(
      "Profile name can use letters, numbers, emoji, spaces and _ . ' -",
    );
  }
  return name;
}

export const DUPLICATE_PROFILE_NAME =
  "A profile with that name already exists on this computer";
