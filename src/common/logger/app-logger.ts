import { ConsoleLogger } from '@nestjs/common';

// Nest tự log 1 dòng cho mỗi module khởi tạo (InstanceLoader) và mỗi route
// được map (RoutesResolver/RouterExplorer) — với ~50+ endpoint, mỗi lần
// restart dev server tạo ra hàng chục dòng nhiễu không cần thiết. Ẩn 3 context
// này ở mức "log" (info), vẫn giữ nguyên "error"/"warn" nếu có sự cố.
const QUIET_CONTEXTS = new Set([
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
]);

export class AppLogger extends ConsoleLogger {
  log(message: unknown, context?: string): void {
    if (context && QUIET_CONTEXTS.has(context)) return;
    super.log(message, context);
  }
}
