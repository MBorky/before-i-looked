// Save one rig page as a single HTML file, for a review copy (plan § 3 and § 4, ADR 0003).
// Runs rig on a free local port, fetches the page over HTTP, writes the body as it is (one
// layout, one inline stylesheet, no client JS: the file is self-contained, ADR 0001), stops rig.
//
//   pnpm save-page /digest/2026-10-28 var/preview/digest-2026-10-28.html
//   LANE_MARKER= pnpm save-page /digest/2026-10-28 var/preview/digest-2026-10-28.html   # no marker
//
// `var/` is git-ignored: previews never go into the repo (ADR 0003).
import { mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from '../src/app.js';
import { lane } from '../src/lane.js';

const [path, out] = process.argv.slice(2);
if (!path?.startsWith('/') || !out) {
  console.error('usage: save-page <path, e.g. /digest/2026-10-28> <out.html>');
  process.exit(2);
}

const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;

try {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const html = await res.text();
  if (res.status !== 200) {
    console.error(`GET ${path} → ${res.status}; nothing saved`);
    process.exitCode = 1;
  } else {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    console.log(`saved ${path} → ${out} (${Buffer.byteLength(html)} bytes) · banner: ${lane().marker ?? 'no marker set'}`);
  }
} finally {
  server.close();
}
