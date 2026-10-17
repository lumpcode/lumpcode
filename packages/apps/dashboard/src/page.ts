import { dashboardNotices, SNAPSHOT_STALE_AFTER_MS, STATUS_POLL_INTERVAL_MS } from './snapshotTiming';
import { logoMarkDataUrl } from './logoMark';
import type { DashboardView } from './types';

const ROOT_CSS = `:root {
  --bg: #000514;
  --bg-elevated: #07101c;
  --bg-card: #0a1422;
  --teal: #38b0ab;
  --teal-bright: #4ec9c3;
  --teal-dim: #247a76;
  --teal-glow: rgb(56 176 171 / 16%);
  --text: #eef4f6;
  --text-soft: #c5d4dc;
  --text-muted: #8fa3b0;
  --border: rgb(56 176 171 / 16%);
  --border-strong: rgb(56 176 171 / 34%);
  --shadow: 0 18px 50px rgb(0 0 0 / 35%);
  --radius: 14px;
  --font: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --header-h: 4.25rem;
  --max: 68rem;
  --ease: 180ms ease;
  --space-prose: 0.75rem;
  --space-block: 1.1rem;
  --space-section: 3rem;
}`;

const PAGE_CSS = `
${ROOT_CSS}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 16px; line-height: 1.6; }
html { color-scheme: dark; }
body {
  background-image:
    radial-gradient(ellipse 80% 48% at 50% -12%, var(--teal-glow), transparent 58%),
    linear-gradient(rgb(56 176 171 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(56 176 171 / 4%) 1px, transparent 1px);
  background-size: auto, 3rem 3rem, 3rem 3rem;
}
main { width: min(var(--max), calc(100% - 2.5rem)); margin: 0 auto; padding: 2rem 0 3rem; }
.masthead { display: flex; align-items: center; gap: 0.85rem; margin: 0 0 1.25rem; }
.masthead img { width: 48px; height: 48px; border-radius: 10px; display: block; }
.masthead h1 { margin: 0; font-size: 1.6rem; line-height: 1.2; }
h2.project { font-size: 1.45rem; color: var(--text); }
h2, h3, p { margin: 0 0 0.75rem; }
h2 { font-size: 1.15rem; color: var(--text-soft); }
.lede { color: var(--text-soft); }
.note { border: 1px solid var(--border-strong); background: var(--bg-elevated); border-radius: 8px; padding: 0.75rem 1rem; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.15rem; margin: 0 0 1rem; }
dt { color: var(--text-muted); margin-top: 0.35rem; }
dd { margin: 0; font-family: var(--mono); font-size: 0.92em; }
.meta { color: var(--text-muted); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--mono); font-size: 0.86em; color: var(--text-soft); }
ul { margin: 0.25rem 0 0; padding-left: 1.2rem; }
li span { color: var(--text-muted); margin-right: 0.25rem; }
`;

const SHOWN_DAEMON_KEYS = new Set([
    'daemonId',
    'running',
    'pid',
    'cronSetup',
    'include',
    'exclude',
    'tickPhase',
    'nextTickAt',
    'inFlightRuns',
    'localConfigStale',
    'snapshotIncomplete',
]);

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function textOf(value: unknown): string {
    if (value === undefined) return '';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return value.join(', ');
    }
    const json = JSON.stringify(value);
    return json === undefined ? '' : json;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return undefined;
}

function row(label: string, value: unknown): string {
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(textOf(value))}</dd>`;
}

function renderInFlight(runs: unknown, incomplete: boolean): string {
    const parts: string[] = [];
    if (incomplete) {
        parts.push('<p class="note">In-flight work was reported without detail.</p>');
    }
    if (Array.isArray(runs) && runs.length > 0) {
        const items = runs.map((run) => {
            const record = asRecord(run);
            if (record === undefined) {
                return `<li>${escapeHtml(textOf(run))}</li>`;
            }
            const bits: string[] = [];
            if (record.lumpName !== undefined) {
                bits.push(`<span>Lump</span> ${escapeHtml(textOf(record.lumpName))}`);
            }
            if (record.effectiveDiscoveryBranch !== undefined) {
                bits.push(`<span>Branch</span> ${escapeHtml(textOf(record.effectiveDiscoveryBranch))}`);
            }
            if (record.contextName !== undefined) {
                bits.push(`<span>Context</span> ${escapeHtml(textOf(record.contextName))}`);
            }
            return `<li>${bits.join(' ')}</li>`;
        });
        parts.push(`<ul>${items.join('')}</ul>`);
    } else if (!incomplete) {
        parts.push('<p>No lump line in flight.</p>');
    }
    return parts.join('');
}

function renderDaemon(daemon: unknown): string {
    const record = asRecord(daemon);
    if (record === undefined) {
        return `<article class="card"><pre>${escapeHtml(textOf(daemon))}</pre></article>`;
    }
    const daemonId = typeof record.daemonId === 'string' ? record.daemonId : 'daemon';
    const running = record.running === true ? 'running' : 'not running';
    const pid = typeof record.pid === 'number' ? ` (pid ${record.pid})` : '';
    const fields: string[] = [];
    for (const key of ['cronSetup', 'include', 'exclude', 'tickPhase', 'nextTickAt'] as const) {
        if (key in record && record[key] !== undefined) {
            fields.push(row(key, record[key]));
        }
    }
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
        if (!SHOWN_DAEMON_KEYS.has(key)) {
            rest[key] = value;
        }
    }
    const extra = Object.keys(rest).length > 0
        ? `<pre>${escapeHtml(JSON.stringify(rest, null, 2))}</pre>`
        : '';
    const stale = record.localConfigStale === true
        ? '<p class="note">local.json changed. A restart is required to apply it.</p>'
        : '';
    const fieldList = fields.length > 0 ? `<dl>${fields.join('')}</dl>` : '';
    return `<article class="card">
      <h3>${escapeHtml(`${daemonId}: ${running}${pid}`)}</h3>
      ${stale}
      ${fieldList}
      <h4>In flight</h4>
      ${renderInFlight(record.inFlightRuns, record.snapshotIncomplete === true)}
      ${extra}
    </article>`;
}

function renderSupervisor(supervisor: unknown): string {
    const record = asRecord(supervisor);
    if (record === undefined) {
        return `<section><h2>Supervisor</h2><p>${escapeHtml(textOf(supervisor))}</p></section>`;
    }
    const line = record.running === true
        ? `Supervisor: running${typeof record.pid === 'number' ? ` (pid ${record.pid})` : ''}.`
        : 'Supervisor: not running.';
    const rest = { ...record };
    delete rest.running;
    delete rest.pid;
    const extra = Object.keys(rest).length > 0
        ? `<pre>${escapeHtml(JSON.stringify(rest, null, 2))}</pre>`
        : '';
    return `<section class="card"><h2>Supervisor</h2><p>${escapeHtml(line)}</p>${extra}</section>`;
}

function renderNotices(view: DashboardView, nowMs: number): string {
    const notices = dashboardNotices({
        nowMs,
        fetchedAt: view.fetchedAt,
        readError: view.readError,
    });
    const blocks: string[] = [];
    if (notices.showFailureNote && view.readError !== undefined) {
        const parts = [`Status read failed: ${view.readError}.`];
        if (view.fetchedAt !== undefined) {
            parts.push(`Last success: ${view.fetchedAt}.`);
        }
        blocks.push(`<p class="note" role="status">${escapeHtml(parts.join(' '))}</p>`);
    }
    if (notices.showStaleWarning) {
        const seconds = SNAPSHOT_STALE_AFTER_MS / 1000;
        const parts = [`This snapshot is at least ${seconds} seconds old.`];
        if (view.readError !== undefined) {
            parts.push(`Latest read failed: ${view.readError}.`);
        }
        blocks.push(`<p class="note" role="status">${escapeHtml(parts.join(' '))}</p>`);
    }
    return blocks.join('');
}

export function renderDashboardView(view: DashboardView, nowMs: number): string {
    const notices = renderNotices(view, nowMs);
    const status = view.status;
    if (status === undefined) {
        return `${notices}<p>No snapshot yet.</p>`;
    }
    const daemons = Array.isArray(status.daemons) && status.daemons.length > 0
        ? status.daemons.map((daemon) => renderDaemon(daemon)).join('')
        : '<p>No daemons running.</p>';
    const updated = view.fetchedAt !== undefined
        ? `<p class="meta">Last success: ${escapeHtml(view.fetchedAt)}</p>`
        : '';
    return `${notices}
      <h2 class="project">${escapeHtml(status.projectName)}</h2>
      <p class="lede">This page only watches.</p>
      ${renderSupervisor(status.supervisor)}
      <h2>Daemons</h2>
      ${daemons}
      ${updated}`;
}

function pollScript(): string {
    return `<script>
      const pollMs = ${STATUS_POLL_INTERVAL_MS};
      async function refresh() {
        try {
          const response = await fetch('/view', { cache: 'no-store' });
          if (!response.ok) return;
          const html = await response.text();
          const view = document.getElementById('view');
          if (view) view.innerHTML = html;
        } catch {
          /* keep the last rendered view */
        }
      }
      async function loop() {
        for (;;) {
          await refresh();
          await new Promise((resolve) => setTimeout(resolve, pollMs));
        }
      }
      loop();
    </script>`;
}

export function renderDashboardDocument(view: DashboardView, nowMs: number): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lumpcode Worker Dashboard</title>
  <link rel="icon" href="${logoMarkDataUrl}">
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main>
    <header class="masthead">
      <img src="${logoMarkDataUrl}" alt="" width="48" height="48">
      <h1>Lumpcode Worker Dashboard</h1>
    </header>
    <div id="view">${renderDashboardView(view, nowMs)}</div>
  </main>
  ${pollScript()}
</body>
</html>`;
}
