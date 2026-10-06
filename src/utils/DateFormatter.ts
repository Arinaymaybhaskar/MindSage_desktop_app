export function formatTimeAgo(isoString: string): string {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  const pad = (n: number): string => n.toString().padStart(2, "0");

  const formatAMPM = (date: Date): string => {
    const hours = date.getHours();
    const minutes = pad(date.getMinutes());
    const suffix = hours >= 12 ? "p.m." : "a.m.";
    const hr12 = hours % 12 || 12;
    return `${hr12}:${minutes}${suffix}`;
  };

  if (diffSec < 10) {
    return "just now";
  } else if (diffSec < 60) {
    return `${diffSec} seconds ago`;
  } else if (diffHr < 24) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `${h > 0 ? `${h}h` : ""}${m}m ago`.trim();
  } else if (diffDays < 2) {
    return `yesterday at ${formatAMPM(then)}`;
  } else if (diffDays < 365) {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${monthNames[then.getMonth()]} ${then.getDate()}, ${pad(then.getHours())}:${pad(then.getMinutes())}`;
  } else {
    return `${then.getFullYear()}-${pad(then.getMonth() + 1)}-${pad(then.getDate())}, ${formatAMPM(then)}`;
  }
}
