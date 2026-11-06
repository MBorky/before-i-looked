import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RUN_STATUSES,
  type DigestRow,
  type ReadNight,
  type RunLine,
  type RunStatus,
  type StatusCounts,
} from './types.js';

// The night id comes from a URL: only `YYYY-MM-DD`, so it can never leave runsDir.
const NIGHT_ID = /^\d{4}-\d{2}-\d{2}$/;

function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (RUN_STATUSES as readonly string[]).includes(value);
}

// Parse one line at the edge. Anything that is not a valid run line returns null.
function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isRunStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, job, status, owner: owner ?? null, error: error ?? null };
}

// The file's text, or null when there is no file for that night.
function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT_ID.test(night)) return null;
  const text = readLog(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  // The log is in time order: a later line in the file is the newer one.
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        fails: line.status === 'fail' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    if (line.status === 'fail') row.fails++;
    row.lastStatus = line.status;
    if (line.error !== null) row.lastError = line.error;
    row.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
};
