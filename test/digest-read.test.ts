import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const temps: string[] = [];
function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  temps.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('has 5 jobs, sorted by job, and 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest!.night).toBe('2026-10-28');
    expect(digest!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(digest!.badLines).toBe(1);
  });

  it('counts good lines per status', () => {
    expect(digest!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('builds each row from the log, offsets kept', () => {
    expect(digest!.rows).toEqual([
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0, fails: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, fails: 0,
        lastStatus: 'ok', lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, fails: 0,
        lastStatus: 'ok', lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, fails: 1,
        lastStatus: 'fail', lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, fails: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
  });

  it('returns null for a bad night id', () => {
    expect(readNight('runs', '../x')).toBeNull();
    expect(readNight('runs', '2026-10-28/../2026-10-28')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    const dir = tempRuns({ '2026-11-01.jsonl': '' });
    expect(readNight(dir, '2026-11-01')).toEqual({
      night: '2026-11-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('skips blank lines and counts invalid ones', () => {
    const lines = [
      '{"at":"2026-11-02T23:00:00+01:00","job":"a","status":"ok"}',
      '',
      '   ',
      '{"at":"2026-11-02T23:01:00+01:00","job":"a","status":"done"}',
      '{"at":"2026-11-02T23:02:00+01:00","job":"","status":"ok"}',
      '{"job":"a","status":"ok"}',
      '{"at":"2026-11-02T23:03:00+01:00","job":"a","status":"ok","owner":7}',
      '[1,2]',
      'null',
      '',
    ];
    const dir = tempRuns({ '2026-11-02.jsonl': lines.join('\r\n') });
    const digest = readNight(dir, '2026-11-02');
    expect(digest!.badLines).toBe(6);
    expect(digest!.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(digest!.rows).toHaveLength(1);
    expect(digest!.rows[0]).toMatchObject({ job: 'a', owner: null, runs: 1, lastError: null });
  });
});
