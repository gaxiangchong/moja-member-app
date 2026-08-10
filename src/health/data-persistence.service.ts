import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { constants, promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

const MARKER_FILE = '.persistence-probe.json';

export type DataPersistenceSnapshot = {
  path: string;
  writable: boolean;
  status: 'verified' | 'awaiting_restart' | 'error';
  markerCreatedAt: string | null;
  markerSeenAfterRestart: boolean;
  checkedAt: string;
  error?: string;
};

@Injectable()
export class DataPersistenceService implements OnModuleInit {
  private snapshot: DataPersistenceSnapshot;

  private readonly dataPath: string;

  constructor(@Optional() @Inject('DATA_PERSISTENCE_PATH') dataPath?: string) {
    this.dataPath = dataPath ?? resolve(process.cwd(), 'data');
    this.snapshot = this.emptySnapshot();
  }

  async onModuleInit() {
    await this.check();
  }

  getSnapshot() {
    return this.snapshot;
  }

  async check() {
    const checkedAt = new Date().toISOString();
    const markerPath = join(this.dataPath, MARKER_FILE);

    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      let markerCreatedAt: string | null = null;
      let markerSeenAfterRestart = false;

      try {
        const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) as {
          createdAt?: unknown;
        };
        if (typeof marker.createdAt === 'string') {
          markerCreatedAt = marker.createdAt;
          markerSeenAfterRestart = true;
        }
      } catch (error) {
        if (!this.isMissingFile(error)) throw error;
      }

      if (!markerCreatedAt) {
        markerCreatedAt = checkedAt;
        await fs.writeFile(
          markerPath,
          `${JSON.stringify({ createdAt: markerCreatedAt })}\n`,
          { encoding: 'utf8', flag: 'wx' },
        );
      }

      await fs.access(this.dataPath, constants.W_OK);
      this.snapshot = {
        path: this.dataPath,
        writable: true,
        status: markerSeenAfterRestart ? 'verified' : 'awaiting_restart',
        markerCreatedAt,
        markerSeenAfterRestart,
        checkedAt,
      };
    } catch (error) {
      this.snapshot = {
        ...this.emptySnapshot(checkedAt),
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return this.snapshot;
  }

  private emptySnapshot(
    checkedAt = new Date().toISOString(),
  ): DataPersistenceSnapshot {
    return {
      path: this.dataPath,
      writable: false,
      status: 'error',
      markerCreatedAt: null,
      markerSeenAfterRestart: false,
      checkedAt,
    };
  }

  private isMissingFile(error: unknown): error is NodeJS.ErrnoException {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
