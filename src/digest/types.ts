// The digest contract (plan.md § 1). The reader (#2) fills these types; the page, the JSON,
// the board link and the route tests (§ 2) build against them. Pure data: rendering a missing
// value as `—` is a view concern, never done here.

/** A run's outcome, as written in the log's `status` field. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** All statuses, in the order the board and the counts show them. */
export const RUN_STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

/** One parsed line of `runs/<night>.jsonl`. Lines that don't parse never become one. */
export type RunLine = {
  /** Time exactly as written in the log, offset kept, e.g. `2026-10-29T01:30:00+01:00`. */
  at: string;
  /** Job name, e.g. `lane/sync`. */
  job: string;
  status: RunStatus;
  /** Who owns the job; `null` when the log says `null` or leaves it out. */
  owner: string | null;
  /** Error message of this run; `null` when the line has none. */
  error: string | null;
};

/** One row per job for the night. */
export type DigestRow = {
  /** Job name; the rows are sorted by it. */
  job: string;
  /** Owner from the job's newest line; `null` when unknown (the view shows `—`). */
  owner: string | null;
  /** Number of the job's lines that night (every status counts). */
  runs: number;
  /** Number of the job's lines with status `retry`. */
  retries: number;
  /** Number of the job's lines with status `fail`; `> 0` marks the row (§ 2a). */
  fails: number;
  /** Status of the job's newest line. */
  lastStatus: RunStatus;
  /** Newest error message of the night, even when the last run was `ok`; `null` if none. */
  lastError: string | null;
  /** `at` of the job's first line, exactly as written (offset kept, never UTC). */
  firstAt: string;
  /** `at` of the job's last line, exactly as written (offset kept, never UTC). */
  lastAt: string;
};

/** Line counts per status for the whole night; bad lines are not in it. */
export type StatusCounts = Record<RunStatus, number>;

/** What the reader returns for a night that has a file. */
export type NightDigest = {
  /** The night id, `YYYY-MM-DD`, as in `runs/<night>.jsonl`. */
  night: string;
  /** One row per job, sorted by `job` (plain string order): the one order page and JSON share. Empty for an empty file ("nothing ran"). */
  rows: DigestRow[];
  /** Number of lines that don't parse (cut off, not JSON, missing fields). Counted, never thrown. Blank lines are not counted. */
  badLines: number;
  /** Good lines per status, for the status board (§ 2c). */
  counts: StatusCounts;
};

/**
 * Read `<runsDir>/<night>.jsonl` into a digest.
 * Returns `null` when there is no file for that night (the page answers 404).
 * Never throws on bad lines; they go into `badLines`.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
