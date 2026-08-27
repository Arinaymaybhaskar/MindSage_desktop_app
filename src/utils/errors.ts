/**
 * Best-effort message from a value caught in a `catch` block.
 *
 * `catch (e)` binds `unknown`, and anything can be thrown, so this centralises
 * the narrowing rather than repeating `catch (e: any)` at each call site.
 */
export function errorMessage(
  caught: unknown,
  fallback = "Something went wrong"
): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === "string" && caught) return caught;
  if (
    typeof caught === "object" &&
    caught !== null &&
    typeof (caught as { message?: unknown }).message === "string"
  ) {
    return (caught as { message: string }).message;
  }
  return fallback;
}
