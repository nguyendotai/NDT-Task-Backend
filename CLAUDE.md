# Backend Claude Instructions
> Version: 2.0 (Optimized)

Tài liệu quy định toàn bộ tiêu chuẩn phát triển Backend của dự án **NDT Task** (`backend/`). AI tuân thủ cả tài liệu `.claude/` (thứ tự ưu tiên: Business Rules -> Architecture -> backend/CLAUDE.md -> Coding Style -> Folder Structure -> API Contract -> Database).

## 1. TECH STACK & ARCHITECTURE LAYERS
- NestJS, TypeScript, Prisma ORM, MongoDB, JWT (Access/Refresh), class-validator/class-transformer, Redis, BullMQ, Socket.IO, Cloudinary, SMTP (Mail), Swagger (API Docs).
- **Phân tầng bắt buộc (Dependency Rule)**: Controller -> Service -> Repository -> Prisma -> MongoDB.
  - *Cấm*: Controller gọi thẳng Repository/Prisma/Redis; Guard/Interceptor gọi thẳng Repository/Prisma.
- **NestJS Modules**: Mỗi module quản lý 1 domain duy nhất (auth, workspace, board, sprint, column, task, comment, attachment, activity, notification, user).

## 2. CHỨC NĂNG & GIỚI HẠN CỦA TỪNG LAYER
- **Controller (Cực mỏng)**: Chỉ nhận request, validate qua DTO, gọi Service, trả response, áp dụng Guard/Decorator/Interceptor. ❌ Cấm: logic nghiệp vụ, query DB, gọi Prisma/Repository, xử lý Transaction, gửi email/socket, upload file.
- **Service (Nơi chứa logic nghiệp vụ)**: Được phép gọi Repository, Redis, BullMQ, Cloudinary, gửi socket, chạy Transaction, check Business Rules. ❌ Cấm: Trả HTTP Response, đọc req/res trực tiếp.
- **Repository (Lớp duy nhất làm việc với Prisma)**: CRUD, query, phân trang, lọc, sắp xếp, aggregate. ❌ Cấm: logic nghiệp vụ, Auth/Permission.
- **⚠️ Prisma + MongoDB — null field**: Mọi field nullable dùng để filter (`deletedAt`, `revokedAt`, `usedAt`...) **BẮT BUỘC ghi tường minh `null` lúc `create()`**. MongoDB không tự có field rỗng như SQL — nếu field bị bỏ qua lúc tạo, nó **không tồn tại** trong document, và filter kiểu `where: { deletedAt: null }` (kết hợp thêm điều kiện khác) sẽ **không khớp** document đó (Prisma dịch sang `$expr` yêu cầu field phải tồn tại). Luôn viết `data: { ...input, deletedAt: null, deletedBy: null }` (tương tự cho các field nullable khác dùng để filter) trong mọi Repository `.create()`.
- **⚠️ Prisma + MongoDB — thêm field mới vào model đã có data**: `@default(...)` chỉ áp dụng cho document **tạo mới sau khi generate lại Client**, KHÔNG tự thêm vào document cũ đã tồn tại trong MongoDB. Nếu field mới là **required** (không có `?`) và được dùng để `orderBy`/`select`/trả về response, các document cũ thiếu field này sẽ khiến Prisma lỗi runtime (thường là `500`) ngay khi đọc/sắp xếp — không phải lỗi biên dịch nên dễ bỏ sót. Sau mỗi lần `prisma db push` thêm field mới vào model đã có dữ liệu, **BẮT BUỘC chạy backfill** (`$runCommandRaw` update toàn bộ document thiếu field đó) trước khi coi module hoàn tất — không chỉ test bằng user/data tạo mới trong cùng phiên.

## 3. CƠ CHẾ BỔ TRỢ & BẢO MẬT
- **Authentication**: JWT Access Token (sống ngắn) + Refresh Token (HTTP Only Cookie, thu hồi được, cấm trả trong body).
- **Queue (BullMQ)**: Xử lý background job (email, notification, file, cron job). Cấm chạy tác vụ nặng trực tiếp trong request.
- **Socket.IO (Realtime)**: Chỉ dùng cho Task Update, Comment, Notification, Online Status, Board Sync. Cấm dùng Socket cho nghiệp vụ REST API.
- **Cloudinary (Storage)**: Lưu ảnh/file. DB chỉ lưu URL, Public ID và Metadata. Cấm lưu file trên server.
- **Transaction**: Bắt buộc khi ghi/sửa trên nhiều collection (Tạo Workspace kèm Board/Column mặc định, Complete Sprint...). Cấm dùng cho GET.
- **Logging**: Chỉ ghi log Startup, Error, Warning, Audit. Cấm log password, token, OTP, cookie, secret.

## 4. DEFINITION OF DONE (DOD)
Build OK; không lỗi TS; Prisma Schema hợp lệ; Migration/Seed OK; API & DB đúng chuẩn `api-contract.md` & `database.md`; đúng Dependency Rule; cập nhật CHANGELOG.md, PROJECT_STATUS.md và **Postman Collection** (mục 5) nếu có đổi API.

## 5. POSTMAN COLLECTION (API TESTING)
- File: `postman/ndt-task-api.postman_collection.json` (+ `postman/ndt-task-api.postman_environment.json`). Collection chỉ chứa endpoint đã có trong `api-spec.md` — không tự thêm endpoint chưa được document.
- **Bắt buộc cập nhật đồng thời** với `api-spec.md` mỗi khi Thêm/Sửa/Xóa bất kỳ Endpoint nào: request mới/sửa/xóa tương ứng trong collection phải khớp field, method, status code theo `api-contract.md`/`api-spec.md`.
- Mỗi Request nhóm theo folder trùng tên Module (Auth, Workspace, Task...). Có `description` ngắn gọn nêu mục đích + lưu ý (nếu phụ thuộc endpoint khác chưa có).
- Dùng biến collection (`{{baseUrl}}`, `{{accessToken}}`, `{{workspaceId}}`...) — cấm hardcode giá trị thật/secret. Request nào trả về id cần dùng lại (login, create...) phải có Test script `pm.collectionVariables.set(...)` để tự chain sang request sau.
- **Checklist khi đổi Endpoint**: Sửa Controller -> Cập nhật `api-spec.md` -> Cập nhật Postman Collection (thêm/sửa/xóa request + biến liên quan) -> Test lại request bị ảnh hưởng.