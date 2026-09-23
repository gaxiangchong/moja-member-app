import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';
import { OpsCreateMemberDto, OpsMemberLookupDto } from './dto/ops-member.dto';
import { OpsMembersService } from './ops-members.service';

/**
 * Counter member desk: look a member up by phone, or register a walk-in who
 * cannot sign up on the app themselves.
 *
 * POST (not GET) for the lookup so the phone number stays out of URLs, access
 * logs and browser history.
 */
@Controller('ops/members')
@UseGuards(OpsApiKeyGuard)
export class OpsMembersController {
  constructor(private readonly members: OpsMembersService) {}

  @Post('lookup')
  lookup(@Body() dto: OpsMemberLookupDto, @Ip() ip: string) {
    return this.members.lookup(dto, ip);
  }

  @Post()
  create(@Body() dto: OpsCreateMemberDto, @Ip() ip: string) {
    return this.members.createMember(dto, ip);
  }
}
