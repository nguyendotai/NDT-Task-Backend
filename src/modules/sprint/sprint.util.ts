// Chuẩn hoá 1 Date về mốc 00:00:00.000 UTC của đúng ngày đó — dùng để so
// sánh/khoá unique theo "ngày" (SprintSnapshot) mà không lệ thuộc giờ chạy
// cron thực tế trong ngày.
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
