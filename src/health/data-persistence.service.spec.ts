import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DataPersistenceService } from './data-persistence.service';

describe('DataPersistenceService', () => {
  let dataPath: string;

  beforeEach(async () => {
    dataPath = await mkdtemp(join(process.cwd(), 'data', 'test-persistence-'));
  });

  afterEach(async () => {
    await rm(dataPath, { recursive: true, force: true });
  });

  it('creates a marker and waits for a restart before reporting persistence', async () => {
    const snapshot = await new DataPersistenceService(dataPath).check();

    expect(snapshot.error).toBeUndefined();
    expect(snapshot).toMatchObject({
      writable: true,
      status: 'awaiting_restart',
      markerSeenAfterRestart: false,
    });
    const marker = JSON.parse(
      await readFile(join(dataPath, '.persistence-probe.json'), 'utf8'),
    );
    expect(marker.createdAt).toBe(snapshot.markerCreatedAt);
  });

  it('reports verified when a later process sees the existing marker', async () => {
    const first = await new DataPersistenceService(dataPath).check();
    const second = await new DataPersistenceService(dataPath).check();

    expect(second.error).toBeUndefined();
    expect(second).toMatchObject({
      writable: true,
      status: 'verified',
      markerSeenAfterRestart: true,
      markerCreatedAt: first.markerCreatedAt,
    });
  });
});
