import { IsIn, IsOptional } from 'class-validator';

/** Body for the manual SalesPlay pull trigger. */
export class PosPullDto {
  /**
   * `reconcile` (default) pulls a recent lookback window to catch missed
   * webhooks; `backfill` walks history from the sales reporting cutoff.
   */
  @IsOptional()
  @IsIn(['reconcile', 'backfill'])
  mode?: 'reconcile' | 'backfill';
}
