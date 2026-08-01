import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

// Global Search (search.md #2): tìm xuyên suốt tất cả Workspace mà user đang
// là Member Active, không phân biệt role — khác với SearchController (chỉ
// tìm trong đúng 1 Workspace theo route param).
@Controller('search')
@UseGuards(JwtAuthGuard)
export class GlobalSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@CurrentUser() user: UserEntity, @Query() query: SearchQueryDto) {
    return this.searchService.searchGlobal(user.id, query);
  }
}
