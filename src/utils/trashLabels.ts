/** The chip on a trashed item: "Gone for good in 3 days". */
export const goneForGoodLabel = (days: number) =>
  days <= 0
    ? "Gone for good today"
    : days === 1
      ? "Gone for good in 1 day"
      : `Gone for good in ${days} days`;

/** How long ago it was deleted: "deleted today", "deleted 12 days ago". */
export const deletedAgoLabel = (deletedAt: string, now = new Date()) => {
  const days = Math.max(
    0,
    Math.floor((now.getTime() - new Date(deletedAt).getTime()) / 86_400_000),
  );
  return days === 0
    ? "deleted today"
    : days === 1
      ? "deleted yesterday"
      : `deleted ${days} days ago`;
};

/** Items in this many days or fewer are marked as going soon. */
export const GOING_SOON_DAYS = 3;
