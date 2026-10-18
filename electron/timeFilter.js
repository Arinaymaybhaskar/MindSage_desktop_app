// Time filter for Ask ("what did I write last week?"). The model gives ISO 8601
// bounds; either may be null. Pure, so it is tested without a database.

const toMs = (value) => {
  if (value == null || value === "") return null;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Keeps results whose payload.created_at falls inside [from, to]. A bound that
 * is missing or not a date is ignored; with no usable bound everything stays.
 * When there is a bound, a result with no readable date is dropped, because
 * it cannot be shown to be inside the range.
 */
export function filterByTimeRange(results, range) {
  const from = toMs(range?.from);
  const to = toMs(range?.to);
  if (from === null && to === null) return results;
  return results.filter((r) => {
    const at = toMs(r?.payload?.created_at);
    if (at === null) return false;
    return (from === null || at >= from) && (to === null || at <= to);
  });
}

/** True when the range has at least one usable bound. */
export const hasTimeRange = (range) =>
  toMs(range?.from) !== null || toMs(range?.to) !== null;
