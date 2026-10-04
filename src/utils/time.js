// Compact relative time for notification lists ("2m", "3h", "2d", "Oct 3").
export const timeAgo = (iso) => {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';

  const diff = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'now';
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
