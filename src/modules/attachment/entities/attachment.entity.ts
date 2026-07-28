export class AttachmentEntity {
  id: string;
  taskId: string;
  uploaderId: string;
  fileName: string;
  fileUrl: string;
  filePublicId: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
}
