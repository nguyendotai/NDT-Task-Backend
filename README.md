<div align="center">

# 🚀 NDT Task — Backend API

**Task Management SaaS đa nền tảng** — Workspace → Board → Task, hỗ trợ cả **Kanban** lẫn **Scrum**.
Xây dựng bằng NestJS + Prisma + MongoDB, realtime bằng Socket.IO.

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[Frontend repo](https://github.com/nguyendotai/NDT-Task-Frontend) · [Báo lỗi / góp ý](../../issues)

</div>

---

## 📖 Giới thiệu

**NDT Task** là ứng dụng quản lý công việc kiểu Jira/Trello thu nhỏ: mỗi **Workspace** (nhóm/dự án) chứa 1 **Board**, Board chia thành nhiều **Column**, mỗi Column chứa nhiều **Task**. Workspace có thể chọn kiểu **Kanban** (dòng chảy liên tục) hoặc **Scrum** (chia theo Sprint, có Burndown/Velocity Chart).

Repo này là **Backend API** — nơi xử lý toàn bộ logic nghiệp vụ, xác thực, realtime và lưu trữ. Muốn dùng thử giao diện, xem [repo Frontend](https://github.com/nguyendotai/NDT-Task-Frontend).

## ✨ Tính năng nổi bật

| Nhóm | Tính năng |
| :--- | :--- |
| 🔐 **Xác thực** | Đăng ký/đăng nhập Email + Password, đăng nhập Google (OAuth), **2FA (TOTP)** tuỳ chọn, quên/đổi mật khẩu, JWT Access + Refresh Token (HTTP-Only Cookie) |
| 🏢 **Workspace** | Kanban/Scrum, mời thành viên qua email, phân quyền **Owner / Admin / Member**, Public/Private |
| 🗂️ **Board & Task** | Kéo-thả Task/Column, Priority, Task Type (Task/Bug/Story/Epic), mã Task kiểu `ABC-123`, Assignee, Due date, Story Points, Checklist, Label, Watcher, đính kèm file (Cloudinary), soft-delete + khôi phục |
| 🏃 **Scrum** | Sprint (Planned/Active/Completed), Backlog, **Burndown Chart** (snapshot theo ngày qua cron BullMQ) & **Velocity Chart** |
| ⏱️ **Time Tracking** | Ghi nhận số giờ làm việc thủ công theo từng Task |
| 💬 **Cộng tác** | Comment, Activity Log (audit trail đầy đủ theo Workspace), Notification trong app (tuỳ chỉnh theo loại), Docs (rich-text theo Workspace) |
| ⚡ **Realtime** | Socket.IO — đồng bộ Board/Task/Comment/Notification tức thời cho mọi thành viên đang mở cùng Workspace, kèm Presence (online) & Typing Indicator |
| 🔍 **Tìm kiếm** | Search toàn hệ thống (Task/Comment/Attachment/Column), Export Task ra CSV |
| 📚 **API Docs** | Swagger tự sinh tại `/api/v1/docs` |

## 🛠️ Công nghệ sử dụng

- **Framework**: [NestJS](https://nestjs.com) (TypeScript, kiến trúc Controller → Service → Repository)
- **Database**: MongoDB + [Prisma ORM](https://www.prisma.io)
- **Cache/Queue**: Redis + [BullMQ](https://docs.bullmq.io) (mail, cron chụp snapshot Sprint...)
- **Realtime**: Socket.IO
- **Auth**: JWT (`@nestjs/jwt`, `passport-jwt`), Google OAuth (`google-auth-library`), 2FA (`otplib` + `qrcode`)
- **File Storage**: Cloudinary
- **Mail**: Nodemailer (SMTP)
- **Docs**: Swagger (`@nestjs/swagger`)
- **Test**: Jest (unit test cho các Service nghiệp vụ trọng yếu)

## 📂 Cấu trúc thư mục

```
src/
├── modules/          # Mỗi domain 1 module riêng (Controller → Service → Repository)
│   ├── auth/            # Đăng ký/đăng nhập, Google OAuth, 2FA, refresh token
│   ├── workspace/        # Workspace, thành viên, lời mời, activity log cấp workspace
│   ├── board/ column/    # Board và các Column (trạng thái) trong Board
│   ├── task/             # Task — CRUD, kéo-thả, star, watcher
│   ├── sprint/           # Sprint, Burndown/Velocity, cron snapshot (BullMQ)
│   ├── comment/ checklist/ label/ attachment/  # Các thành phần con của Task
│   ├── timelog/          # Time Tracking thủ công
│   ├── notification/     # Thông báo trong app + tuỳ chỉnh theo loại
│   ├── activity/         # Activity Log dùng chung (audit trail)
│   ├── docs/             # Tài liệu rich-text theo Workspace
│   ├── search/           # Tìm kiếm toàn hệ thống
│   ├── realtime/         # Socket.IO Gateway
│   └── user/             # Hồ sơ người dùng
├── database/          # Prisma schema (schema.prisma), seed, PrismaService
├── config/            # Cấu hình theo module (jwt, cors, mail, cloudinary...)
└── common/            # Guard, Interceptor, Filter, Decorator dùng chung
```

## 🚀 Bắt đầu nhanh

### Yêu cầu

- Node.js 20+
- **MongoDB chạy dưới dạng Replica Set** (kể cả 1 node) — Prisma dùng Transaction cho nhiều thao tác quan trọng (tạo Workspace kèm Board/Column mặc định, Complete Sprint...), mà MongoDB **standalone không hỗ trợ multi-document transaction**. Nếu chưa có sẵn:
  ```bash
  # Khởi động mongod với replica set
  mongod --replSet rs0 --dbpath <đường-dẫn-data>

  # Ở terminal khác, khởi tạo replica set (chỉ cần chạy 1 lần)
  mongosh --eval "rs.initiate()"
  ```
- Redis (dùng cho BullMQ) — local hoặc cloud free-tier như [Upstash](https://upstash.com)

### Cài đặt

```bash
npm install
cp .env.example .env   # rồi điền giá trị thật (xem bảng bên dưới)
npm run db:push        # đồng bộ Prisma Schema vào MongoDB
npm run start:dev       # http://localhost:5000, Swagger tại /api/v1/docs
```

### Biến môi trường chính (`.env`)

| Biến | Mô tả |
| :--- | :--- |
| `DATABASE_URL` | Chuỗi kết nối MongoDB, **bắt buộc có `?replicaSet=rs0`** |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secret ký JWT — đổi giá trị thật khi deploy, đừng dùng giá trị mẫu |
| `JWT_ACCESS_EXPIRES_IN` | Thời gian sống Access Token (mặc định `15m`) |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_TLS` | Kết nối Redis cho BullMQ (mail queue, cron Sprint snapshot) |
| `SMTP_*` / `MAIL_FROM` | Gửi mail thật (mời thành viên, quên mật khẩu) — để trống nếu chưa cần test mail |
| `CLOUDINARY_*` | Upload avatar/attachment — để trống nếu chưa cần test upload file |
| `CORS_ORIGIN` | Domain Frontend được phép gọi API (cách nhau bằng dấu phẩy nếu nhiều domain) |
| `GOOGLE_CLIENT_ID` | Bật đăng nhập Google — để trống thì nút Google tự ẩn ở Frontend |

Xem đầy đủ trong [`.env.example`](.env.example).

### Các lệnh hay dùng

```bash
npm run start:dev     # Chạy dev, tự reload khi sửa code
npm run build          # Build production
npm run start:prod     # Chạy bản build

npm run test            # Unit test (Jest)
npm run test:cov        # Unit test kèm coverage
npm run lint             # ESLint (tự fix)

npm run db:push         # Đồng bộ Prisma Schema -> MongoDB (không tạo migration file, phù hợp MongoDB)
npm run db:studio       # Mở Prisma Studio xem/sửa dữ liệu trực quan
```

## 🧪 Kiểm thử

Unit test tập trung vào các Service nghiệp vụ quan trọng nhất (`AuthService`, `TaskService`, `SprintService`) — quyền chỉnh sửa Task, luồng đăng nhập 2FA, ràng buộc trạng thái Sprint, tính toán Burndown/Velocity...

```bash
npm run test
```

## 📚 API Docs

Sau khi chạy `npm run start:dev`, mở **http://localhost:5000/api/v1/docs** để xem toàn bộ endpoint qua Swagger UI, thử request trực tiếp trên trình duyệt.

## 🔗 Repo liên quan

- **Frontend**: [github.com/nguyendotai/NDT-Task-Frontend](https://github.com/nguyendotai/NDT-Task-Frontend)
