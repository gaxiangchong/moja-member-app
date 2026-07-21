import { IsBoolean } from 'class-validator';

/**
 * Archive (hidden=true) or restore (hidden=false) a plan on the admin
 * pickup-progress report. Does not change the subscription itself.
 */
export class SetBentoProgressHiddenDto {
  @IsBoolean()
  hidden!: boolean;
}
