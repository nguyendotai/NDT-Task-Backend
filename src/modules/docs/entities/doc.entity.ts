export class DocEntity {
  id: string;
  workspaceId: string;
  title: string;
  content: Record<string, unknown> | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// docs.md #12: danh sách không kèm content đầy đủ (tránh response nặng).
export class DocSummaryEntity {
  id: string;
  workspaceId: string;
  title: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
