export class CommentEntity {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  mentions: string[];
  createdAt: Date;
  updatedAt: Date;
}
