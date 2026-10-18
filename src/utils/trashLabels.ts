/** What a trashed item's badge says: "3 days left", "1 day left". */
export const daysLeftLabel = (days: number) =>
  days <= 0 ? "Deleting soon" : days === 1 ? "1 day left" : `${days} days left`;
