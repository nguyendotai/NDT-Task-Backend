import { Injectable } from '@nestjs/common';
import { WorkspaceService } from '../workspace/workspace.service';
import { SearchRepository, TaskSearchFilters } from './search.repository';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  AttachmentSearchResult,
  ColumnSearchResult,
  CommentSearchResult,
  MemberSearchResult,
  SearchResults,
  SprintSearchResult,
  TaskSearchResult,
} from './entities/search-result.entity';

const DEFAULT_LIMIT = 20;
// search.md #4.6: khi cần xếp hạng theo relevance (không có sortBy tường
// minh), phải lấy đủ 1 pool ứng viên lớn từ DB rồi mới rank+cắt trang ở tầng
// app — nếu để DB tự take/skip theo limit/offset của user TRƯỚC khi rank, kết
// quả liên quan nhất có thể đã bị cắt mất trước khi kịp so điểm (bug đã phát
// hiện lúc test thật: limit=1 trả nhầm bản ghi mới nhất thay vì liên quan nhất).
const RANKING_CANDIDATE_POOL_SIZE = 200;

@Injectable()
export class SearchService {
  constructor(
    private readonly searchRepository: SearchRepository,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async search(
    workspaceId: string,
    userId: string,
    dto: SearchQueryDto,
  ): Promise<SearchResults> {
    // search.md #5/#6: chỉ Member Active mới search được, và chỉ trong đúng
    // phạm vi Workspace đó.
    await this.workspaceService.assertMembership(workspaceId, userId);

    const query = dto.q.trim();
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const offset = dto.offset ?? 0;
    const wantsAll = !dto.type;
    // Task là loại duy nhất cho phép sortBy tường minh (bỏ qua ranking) — các
    // loại còn lại luôn rank theo relevance.
    const taskSkipsRanking = !!dto.sortBy;

    const results: SearchResults = {
      tasks: [],
      comments: [],
      attachments: [],
      members: [],
      sprints: [],
      columns: [],
    };

    const columns =
      await this.searchRepository.getWorkspaceColumns(workspaceId);
    const columnIds = columns.map((column) => column.id);

    if (wantsAll || dto.type === 'task') {
      const filters: TaskSearchFilters = {
        priority: dto.priority,
        status: dto.status,
        assigneeId: dto.assigneeId,
        label: dto.label,
        sprintId: dto.sprintId,
        columnId: dto.columnId,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        sortBy: dto.sortBy,
        order: dto.order,
      };
      const tasks = await this.searchRepository.searchTasks(
        columnIds,
        query,
        filters,
        taskSkipsRanking ? limit : RANKING_CANDIDATE_POOL_SIZE,
        taskSkipsRanking ? offset : 0,
      );
      const ranked = this.rank(tasks, taskSkipsRanking, (task) => ({
        entity: this.toTaskEntity(task),
        score:
          this.scoreMatch(task.title, query) * 10 +
          this.scoreMatch(task.description, query),
      }));
      results.tasks = taskSkipsRanking
        ? ranked
        : ranked.slice(offset, offset + limit);
    }

    if (wantsAll || dto.type === 'comment' || dto.type === 'attachment') {
      const taskIds =
        await this.searchRepository.getTaskIdsForColumns(columnIds);

      if (wantsAll || dto.type === 'comment') {
        const comments = await this.searchRepository.searchComments(
          taskIds,
          query,
          RANKING_CANDIDATE_POOL_SIZE,
          0,
        );
        const ranked = this.rank(comments, false, (comment) => ({
          entity: this.toCommentEntity(comment),
          score: this.scoreMatch(comment.content, query),
        }));
        results.comments = ranked.slice(offset, offset + limit);
      }

      if (wantsAll || dto.type === 'attachment') {
        const attachments = await this.searchRepository.searchAttachments(
          taskIds,
          query,
          RANKING_CANDIDATE_POOL_SIZE,
          0,
        );
        const ranked = this.rank(attachments, false, (attachment) => ({
          entity: this.toAttachmentEntity(attachment),
          score:
            this.scoreMatch(attachment.fileName, query) * 10 +
            this.scoreMatch(attachment.mimeType, query),
        }));
        results.attachments = ranked.slice(offset, offset + limit);
      }
    }

    if (wantsAll || dto.type === 'member') {
      const members = await this.searchRepository.searchMembers(
        workspaceId,
        query,
        RANKING_CANDIDATE_POOL_SIZE,
        0,
      );
      const ranked = this.rank(members, false, (member) => ({
        entity: this.toMemberEntity(member),
        score:
          this.scoreMatch(member.user.name, query) * 10 +
          this.scoreMatch(member.user.email, query),
      }));
      results.members = ranked.slice(offset, offset + limit);
    }

    if (wantsAll || dto.type === 'sprint') {
      const sprints = await this.searchRepository.searchSprints(
        workspaceId,
        query,
        RANKING_CANDIDATE_POOL_SIZE,
        0,
      );
      const ranked = this.rank(sprints, false, (sprint) => ({
        entity: this.toSprintEntity(sprint),
        score: this.scoreMatch(sprint.name, query) * 10,
      }));
      results.sprints = ranked.slice(offset, offset + limit);
    }

    if (wantsAll || dto.type === 'column') {
      const matchedColumns = columns.filter((column) =>
        column.name.toLowerCase().includes(query.toLowerCase()),
      );
      const ranked = this.rank(matchedColumns, false, (column) => ({
        entity: this.toColumnEntity(column),
        score: this.scoreMatch(column.name, query),
      }));
      results.columns = ranked.slice(offset, offset + limit);
    }

    return results;
  }

  // search.md #4.6: ưu tiên match đúng title/tên > match 1 phần > match
  // description/content > metadata khác — chỉ bỏ qua khi user tự chọn sortBy
  // tường minh (hiện chỉ Task hỗ trợ) để tôn trọng lựa chọn sort của họ.
  private rank<TRecord, TEntity>(
    records: TRecord[],
    skipRanking: boolean,
    scorer: (record: TRecord) => { entity: TEntity; score: number },
  ): TEntity[] {
    const scored = records.map(scorer);
    if (skipRanking) return scored.map((row) => row.entity);
    return scored.sort((a, b) => b.score - a.score).map((row) => row.entity);
  }

  private scoreMatch(text: string | null | undefined, query: string): number {
    if (!text) return 0;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    if (lowerText === lowerQuery) return 3;
    if (lowerText.startsWith(lowerQuery)) return 2;
    if (lowerText.includes(lowerQuery)) return 1;
    return 0;
  }

  private toTaskEntity(task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: TaskSearchResult['priority'];
    columnId: string;
    sprintId: string | null;
    dueDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): TaskSearchResult {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      columnId: task.columnId,
      sprintId: task.sprintId,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private toCommentEntity(comment: {
    id: string;
    taskId: string;
    authorId: string;
    content: string;
    createdAt: Date;
  }): CommentSearchResult {
    return {
      id: comment.id,
      taskId: comment.taskId,
      authorId: comment.authorId,
      content: comment.content,
      createdAt: comment.createdAt,
    };
  }

  private toAttachmentEntity(attachment: {
    id: string;
    taskId: string;
    fileName: string;
    mimeType: string;
    createdAt: Date;
  }): AttachmentSearchResult {
    return {
      id: attachment.id,
      taskId: attachment.taskId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      createdAt: attachment.createdAt,
    };
  }

  private toMemberEntity(member: {
    id: string;
    userId: string;
    role: string;
    user: { name: string; email: string };
  }): MemberSearchResult {
    return {
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
    };
  }

  private toSprintEntity(sprint: {
    id: string;
    name: string;
    status: string;
    startDate: Date;
    endDate: Date;
  }): SprintSearchResult {
    return {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
    };
  }

  private toColumnEntity(column: {
    id: string;
    name: string;
    boardId: string;
  }): ColumnSearchResult {
    return column;
  }
}
