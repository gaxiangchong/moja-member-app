import { ReportingSettingsService } from './reporting-settings.service';

// In-memory stand-in for the settings JSON file so the test never touches disk.
// (Jest only allows mock-factory variables whose names start with "mock".)
let mockFileContent: string | null = null;

jest.mock('node:fs', () => ({
  existsSync: jest.fn(() => mockFileContent !== null),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(() => {
    if (mockFileContent === null) throw new Error('ENOENT');
    return mockFileContent;
  }),
  writeFileSync: jest.fn((_path: string, data: string) => {
    mockFileContent = data;
  }),
}));

describe('ReportingSettingsService — sales-start cutoff', () => {
  let svc: ReportingSettingsService;

  beforeEach(() => {
    mockFileContent = null;
    svc = new ReportingSettingsService();
  });

  it('returns an empty (no-op) filter when no start date is set', () => {
    expect(svc.getSalesStartDate()).toBeNull();
    expect(svc.createdAtCutoffWhere()).toEqual({});
  });

  it('returns a createdAt >= cutoff filter when a start date is set', () => {
    svc.setSettings({ salesStartDate: '2026-06-22' });

    const cutoff = new Date('2026-06-22T00:00:00.000Z');
    expect(svc.getSalesStartDate()).toEqual(cutoff);
    expect(svc.createdAtCutoffWhere()).toEqual({ createdAt: { gte: cutoff } });
  });

  it('ignores an invalid start date (stays a no-op)', () => {
    svc.setSettings({ salesStartDate: 'not-a-date' });

    expect(svc.getSalesStartDate()).toBeNull();
    expect(svc.createdAtCutoffWhere()).toEqual({});
  });
});
