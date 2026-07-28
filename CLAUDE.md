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

## 3. CƠ CHẾ BỔ TRỢ & BẢO MẬT
- **Authentication**: JWT Access Token (sống ngắn) + Refresh Token (HTTP Only Cookie, thu hồi được, cấm trả trong body).
- **Queue (BullMQ)**: Xử lý background job (email, notification, file, cron job). Cấm chạy tác vụ nặng trực tiếp trong request.
- **Socket.IO (Realtime)**: Chỉ dùng cho Task Update, Comment, Notification, Online Status, Board Sync. Cấm dùng Socket cho nghiệp vụ REST API.
- **Cloudinary (Storage)**: Lưu ảnh/file. DB chỉ lưu URL, Public ID và Metadata. Cấm lưu file trên server.
- **Transaction**: Bắt buộc khi ghi/sửa trên nhiều collection (Tạo Workspace kèm Board/Column mặc định, Complete Sprint...). Cấm dùng cho GET.
- **Logging**: Chỉ ghi log Startup, Error, Warning, Audit. Cấm log password, token, OTP, cookie, secret.

## 4. DEFINITION OF DONE (DOD)
Build OK; không lỗi TS; Prisma Schema hợp lệ; Migration/Seed OK; API & DB đúng chuẩn `api-contract.md` & `database.md`; đúng Dependency Rule; cập nhật CHANGELOG.md và PROJECT_STATUS.md.