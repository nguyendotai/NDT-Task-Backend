import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@Controller('workspaces/:workspaceId/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
    @Query() query: SearchQueryDto,
  ) {
    return this.searchService.search(workspaceId, user.id, query);
  }
}
