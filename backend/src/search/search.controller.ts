import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private service: SearchService) {}

  @Get()
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    const lim = limit ? Math.max(1, Math.min(500, parseInt(limit, 10) || 200)) : 200;
    return this.service.search(q ?? '', lim);
  }
}
