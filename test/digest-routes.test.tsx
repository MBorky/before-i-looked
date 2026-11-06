import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const NORMAL = '2026-10-29';
const EMPTY = '2026-10-30';
const BAD = '2026-10-31';
const MISSING = '2026-11-01';

let runsDir: string;

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));
  // Lines are written out of job order on purpose: the page and the JSON must sort them.
  fs.writeFileSync(
    path.join(runsDir, `${NORMAL}.jsonl`),
    [
      line('2026-10-29T01:30:00+01:00', 'lane/sync', 'ok', 'rook'),
      line('2026-10-29T02:00:00+01:00', 'lane/report', 'fail', null, 'disk full'),
      line('2026-10-29T02:10:00+01:00', 'lane/backup', 'retry', 'mira'),
      line('2026-10-29T03:00:00+01:00', 'lane/sync', 'ok', 'rook'),
    ].join('\n') + '\n',
  );
  fs.writeFileSync(path.join(runsDir, `${EMPTY}.jsonl`), '');
  fs.writeFileSync(
    path.join(runsDir, `${BAD}.jsonl`),
    [
      line('2026-10-31T01:30:00+01:00', 'lane/sync', 'ok', 'rook'),
      '{"at":"2026-10-31T02:00:00+01:00","job":"lane/backup","sta',
    ].join('\n') + '\n',
  );
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

const app = () =>
  createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });

describe('GET /digest/:night (page)', () => {
  it('renders every job of a night with a file', async () => {
    const res = await app().request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('lane/backup');
    expect(html).toContain('lane/report');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app().request(`/digest/${MISSING}`);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain(`no run log for ${MISSING}`);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await app().request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the good jobs of a night with a bad line and counts the bad line', async () => {
    const res = await app().request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('1 line(s) could not be read');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns the rows of a night with a file', async () => {
    const res = await app().request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.night).toBe(NORMAL);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual([
      'lane/backup',
      'lane/report',
      'lane/sync',
    ]);
    expect(body.badLines).toBe(0);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });

  it('returns no rows for an empty night', async () => {
    const res = await app().request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toEqual([]);
  });

  it('counts the bad line and keeps the good jobs', async () => {
    const res = await app().request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('lists the jobs in the same order', async () => {
    const page = await (await app().request(`/digest/${NORMAL}`)).text();
    const json = await (await app().request(`/api/digest/${NORMAL}`)).json();
    const positions = json.rows.map((r: { job: string }) => page.indexOf(r.job));
    expect(positions.every((p: number) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a: number, b: number) => a - b));
  });
});
