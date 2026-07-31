import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const SEARCH_ENTITY_TYPES = [
  'task',
  'comment',
  'attachment',
  'member',
  'sprint',
  'column',
] as const;
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

const SORT_FIELDS = ['createdAt', 'updatedAt', 'priority', 'dueDate'] as const;

export class SearchQueryDto {
  // search.md #6: query không rỗng, tối đa 255 ký tự.
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  q: string;

  // search.md #7: bỏ trống = Global Search (mọi entity); có type = chỉ tìm
  // đúng loại đó (Task Search).
  @IsOptional()
  @IsIn(SEARCH_ENTITY_TYPES)
  type?: SearchEntityType;

  // Các filter dưới đây (search.md #4.3) chỉ áp dụng ý nghĩa cho Task.
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  status?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  reporterId?: string;

  // done=true/false lọc theo Column.isDoneColumn — cùng convention với
  // ListTasksQueryDto (task module), không phải enum status cố định.
  @IsOptional()
  @IsBooleanString()
  done?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @IsOptional()
  @IsUUID()
  columnId?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  // Lọc theo Task.updatedAt — khác dateFrom/dateTo (đang lọc dueDate). Dùng
  // cho panel filter "Last updated" (Any time/Today/Yesterday/7 ngày/...).
  @IsOptional()
  @IsISO8601()
  updatedFrom?: string;

  @IsOptional()
  @IsISO8601()
  updatedTo?: string;

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: (typeof SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  // search.md #4.5: pagination — limit/offset áp dụng riêng cho từng loại
  // entity trong kết quả (không dồn chung 1 trang cho nhiều loại khác nhau).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
