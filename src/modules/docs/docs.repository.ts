import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DocsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    workspaceId: string;
    title: string;
    createdBy: string;
    content?: Record<string, unknown>;
  }) {
    const { content, ...rest } = data;
    // Ghi tường minh deletedAt/deletedBy = null (xem backend/CLAUDE.md mục 2).
    // content: bỏ hẳn key nếu không truyền (trang trắng) thay vì Prisma.JsonNull
    // — MongoDB coi field Json optional vắng mặt khác "null" tường minh, và
    // Prisma.JsonNull chỉ hợp lệ khi field không optional trong schema.
    return this.prisma.doc.create({
      data: {
        ...rest,
        ...(content !== undefined
          ? { content: content as Prisma.InputJsonValue }
          : {}),
        deletedAt: null,
        deletedBy: null,
      },
    });
  }

  findActiveById(id: string) {
    return this.prisma.doc.findFirst({ where: { id, deletedAt: null } });
  }

  // docs.md #12: danh sách không kèm content đầy đủ.
  listSummaryByWorkspace(workspaceId: string) {
    return this.prisma.doc.findMany({
      where: { workspaceId, deletedAt: null },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  update(
    id: string,
    data: { title?: string; content?: Record<string, unknown> },
  ) {
    return this.prisma.doc.update({
      where: { id },
      data: {
        ...data,
        content: data.content as Prisma.InputJsonValue | undefined,
      },
    });
  }

  softDelete(id: string, deletedBy: string) {
    return this.prisma.doc.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }
}
