<div align="center">

# 🚀 NDT Task — Backend API

**A multi-platform Task Management SaaS** — Workspace → Board → Task, supporting both **Kanban** and **Scrum**.
Built with NestJS + Prisma + MongoDB, realtime via Socket.IO.

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[Frontend repo](https://github.com/nguyendotai/NDT-Task-Frontend) · [Issues / feedback](../../issues)

</div>

---

## 📖 Overview

**NDT Task** is a lightweight Jira/Trello-style work management app: each **Workspace** (a team/project) has one **Board**, a Board is split into **Columns**, and each Column holds **Tasks**. A Workspace can be either **Kanban** (a continuous flow) or **Scrum** (organized into Sprints, with a Burndown/Velocity chart).

This repo is the **Backend API** — it owns all business logic, authentication, realtime, and persistence. Looking for the UI? See the [Frontend repo](https://github.com/nguyendotai/NDT-Task-Frontend).

## ✨ Highlights

| Area | Features |
| :--- | :--- |
| 🔐 **Auth** | Email + password sign-up/sign-in, **Google Sign-In** (OAuth), optional **2FA (TOTP)**, forgot/change password, JWT Access + Refresh Token (HTTP-Only cookie) |
| 🏢 **Workspace** | Kanban/Scrum, invite members by email, **Owner / Admin / Member** roles, Public/Private |
| 🗂️ **Board & Task** | Drag-and-drop Task/Column, Priority, Task Type (Task/Bug/Story/Epic), Jira-style Task keys (`ABC-123`), Assignee, due date, story points, checklist, labels, watchers, file attachments (Cloudinary), soft-delete + restore |
| 🏃 **Scrum** | Sprints (Planned/Active/Completed), Backlog, **Burndown chart** (daily snapshots via a BullMQ cron job) & **Velocity chart** |
| ⏱️ **Time Tracking** | Manual work-hour logging per Task |
| 💬 **Collaboration** | Comments, Activity Log (a full audit trail per Workspace), in-app Notifications (configurable per type), Docs (rich text per Workspace) |
| ⚡ **Realtime** | Socket.IO — instantly syncs Board/Task/Comment/Notification for everyone with the same Workspace open, plus online Presence & Typing indicators |
| 🔍 **Search** | Search across the whole system (Task/Comment/Attachment/Column), export a Task list to CSV |
| 📚 **API Docs** | Auto-generated Swagger UI at `/api/v1/docs` |

## 🛠️ Tech Stack

- **Framework**: [NestJS](https://nestjs.com) (TypeScript, Controller → Service → Repository architecture)
- **Database**: MongoDB + [Prisma ORM](https://www.prisma.io)
- **Cache/Queue**: Redis + [BullMQ](https://docs.bullmq.io) (mail, the Sprint-snapshot cron job...)
- **Realtime**: Socket.IO
- **Auth**: JWT (`@nestjs/jwt`, `passport-jwt`), Google OAuth (`google-auth-library`), 2FA (`otplib` + `qrcode`)
- **File storage**: Cloudinary
- **Mail**: Nodemailer (SMTP)
- **Docs**: Swagger (`@nestjs/swagger`)
- **Testing**: Jest (unit tests for the core business-logic Services)

## 📂 Project Structure

```
src/
├── modules/          # One module per domain (Controller → Service → Repository)
│   ├── auth/             # Sign-up/sign-in, Google OAuth, 2FA, refresh token
│   ├── workspace/        # Workspace, members, invitations, workspace-level activity log
│   ├── board/ column/    # Board and the Columns (statuses) inside it
│   ├── task/             # Task — CRUD, drag-and-drop, star, watchers
│   ├── sprint/           # Sprint, Burndown/Velocity, cron snapshots (BullMQ)
│   ├── comment/ checklist/ label/ attachment/  # Task sub-resources
│   ├── timelog/          # Manual Time Tracking
│   ├── notification/     # In-app notifications + per-type preferences
│   ├── activity/         # Shared Activity Log (audit trail)
│   ├── docs/             # Rich-text docs per Workspace
│   ├── search/           # System-wide search
│   ├── realtime/         # Socket.IO gateway
│   └── user/             # User profile
├── database/          # Prisma schema (schema.prisma), seed script, PrismaService
├── config/            # Per-module configuration (jwt, cors, mail, cloudinary...)
└── common/            # Shared guards, interceptors, filters, decorators
```

## 🚀 Getting Started

### Requirements

- Node.js 20+
- **MongoDB running as a Replica Set** (even a single node) — Prisma relies on Transactions for several important operations (creating a Workspace with its default Board/Columns, completing a Sprint...), and **standalone MongoDB doesn't support multi-document transactions**. If you don't have one set up yet:
  ```bash
  # Start mongod with a replica set
  mongod --replSet rs0 --dbpath <your-data-path>

  # In another terminal, initialize the replica set (only needs to run once)
  mongosh --eval "rs.initiate()"
  ```
- Redis (used by BullMQ) — local or a free cloud tier like [Upstash](https://upstash.com)

### Installation

```bash
npm install
cp .env.example .env   # then fill in real values (see the table below)
npm run db:push        # sync the Prisma schema into MongoDB
npm run start:dev       # http://localhost:5000, Swagger at /api/v1/docs
```

### Key environment variables (`.env`)

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | MongoDB connection string — **must include `?replicaSet=rs0`** |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT signing secrets — replace with real values in production, don't keep the sample ones |
| `JWT_ACCESS_EXPIRES_IN` | Access Token lifetime (default `15m`) |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_TLS` | Redis connection for BullMQ (mail queue, Sprint-snapshot cron) |
| `SMTP_*` / `MAIL_FROM` | Real email sending (invitations, forgot-password) — leave blank if you don't need to test email |
| `CLOUDINARY_*` | Avatar/attachment uploads — leave blank if you don't need to test file upload |
| `CORS_ORIGIN` | Frontend domain(s) allowed to call the API (comma-separated for multiple) |
| `GOOGLE_CLIENT_ID` | Enables Google Sign-In — leave blank and the Google button hides itself on the Frontend |

See the full list in [`.env.example`](.env.example).

### Handy scripts

```bash
npm run start:dev     # Run in dev mode, hot-reload on save
npm run build           # Production build
npm run start:prod      # Run the built app

npm run test             # Unit tests (Jest)
npm run test:cov         # Unit tests with coverage
npm run lint              # ESLint (auto-fix)

npm run db:push          # Sync the Prisma schema -> MongoDB (no migration files, fits MongoDB)
npm run db:studio        # Open Prisma Studio to browse/edit data visually
```

## 🧪 Testing

Unit tests focus on the most business-critical Services (`AuthService`, `TaskService`, `SprintService`) — Task edit permissions, the 2FA login flow, Sprint state constraints, Burndown/Velocity calculations...

```bash
npm run test
```

## 📚 API Docs

After running `npm run start:dev`, open **http://localhost:5000/api/v1/docs** to browse every endpoint through Swagger UI and try requests right from the browser.

## 🔗 Related repos

- **Frontend**: [github.com/nguyendotai/NDT-Task-Frontend](https://github.com/nguyendotai/NDT-Task-Frontend)
