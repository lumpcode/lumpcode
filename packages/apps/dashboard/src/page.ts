import { dashboardNotices, SNAPSHOT_STALE_AFTER_MS, STATUS_POLL_INTERVAL_MS } from './snapshotTiming';
import type { DashboardView } from './types';

const ROOT_CSS = `:root {
  --bg: #000514;
  --bg-deep: #00030d;
  --bg-elevated: #07101c;
  --surface: rgb(10 20 34 / 62%);
  --surface-solid: #0a1422;
  --surface-hover: rgb(14 28 46 / 80%);
  --header-bg: rgb(0 5 20 / 72%);
  --overlay: rgb(0 5 20 / 70%);
  --teal: #38b0ab;
  --teal-bright: #4ec9c3;
  --teal-soft: #7fe0db;
  --teal-dim: #247a76;
  --teal-glow: rgb(56 176 171 / 18%);
  --teal-wash: rgb(56 176 171 / 9%);
  --on-teal: #00110f;
  --text: #eef4f6;
  --text-soft: #c5d4dc;
  --text-muted: #8fa3b0;
  --border: rgb(56 176 171 / 16%);
  --border-strong: rgb(56 176 171 / 34%);
  --warn: #d4a054;
  --warn-text: #e6c07b;
  --warn-wash: rgb(212 160 84 / 9%);
  --shadow: 0 18px 50px rgb(0 0 0 / 38%);
  --shadow-soft: 0 10px 30px rgb(0 0 0 / 25%);
  --fish-body: #3cb4ad;
  --fish-shade: #2fa19b;
  --fish-dark: #238982;
  --fish-deep: #1a6e69;
  --fish-eye: #000514;
  --fish-opacity: 0.55;
  --radius: 14px;
  --radius-lg: 22px;
  --font: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --header-h: 4.25rem;
  --max: 72rem;
  --ease: 180ms ease;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --space-prose: 0.75rem;
  --space-block: 1.25rem;
  --space-section: 5.5rem;
  color-scheme: dark;
}`;

const LUMPFISH_CSS = `.lumpfish { display: block; overflow: visible; }
.lumpfish .lf-body,
.lumpfish .lumpfish-bumps { fill: var(--fish-body); }
.lumpfish .lf-belly { fill: var(--fish-shade); }
.lumpfish .lf-cheek { fill: var(--fish-shade); opacity: 0.55; }
.lumpfish .lf-fin { fill: var(--fish-shade); }
.lumpfish .lf-fin-dark { fill: var(--fish-dark); }
.lumpfish .lf-spots { fill: var(--fish-dark); opacity: 0.75; }
.lumpfish .lf-line { fill: none; stroke: var(--fish-dark); stroke-width: 7; stroke-linecap: round; }
.lumpfish .lumpfish-pectoral .lf-line { stroke: var(--fish-deep); }
.lumpfish .lf-eye { fill: var(--fish-eye); }
.lumpfish .lf-glint { fill: var(--fish-body); }`;

const PAGE_CSS = `
${ROOT_CSS}
${LUMPFISH_CSS}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 16px; line-height: 1.6; }
html { color-scheme: dark; }
body {
  background-image:
    radial-gradient(ellipse 80% 48% at 50% -12%, var(--teal-glow), transparent 58%),
    radial-gradient(ellipse 60% 40% at 100% 100%, var(--teal-wash), transparent 70%);
  background-attachment: fixed;
}
main { width: min(var(--max), calc(100% - 2.5rem)); margin: 0 auto; padding: 2rem 0 3rem; }
.masthead { display: flex; align-items: center; gap: 0.85rem; margin: 0 0 1.25rem; }
.masthead .lumpfish { width: 2.35rem; height: auto; flex: none; }
.masthead h1 { margin: 0; font-size: 1.6rem; line-height: 1.2; }
h2.project { font-size: 1.45rem; color: var(--text); }
h2, h3, p { margin: 0 0 0.75rem; }
h2 { font-size: 1.15rem; color: var(--text-soft); }
.lede { color: var(--text-soft); }
.note { border: 1px solid var(--border-strong); background: var(--bg-elevated); border-radius: 8px; padding: 0.75rem 1rem; }
.card { background: var(--surface-solid); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.15rem; margin: 0 0 1rem; }
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

const FISH_TOKEN_NAMES = ['--fish-body', '--fish-shade', '--fish-dark', '--fish-deep', '--fish-eye'] as const;

function fishCustomProperties(): string {
    const declarations: string[] = [];
    for (const name of FISH_TOKEN_NAMES) {
        const match = new RegExp(`${name}: ([^;]+);`).exec(ROOT_CSS);
        const value = match?.[1];
        if (value === undefined) {
            throw new Error(`ROOT_CSS is missing ${name}`);
        }
        declarations.push(`${name}: ${value};`);
    }
    return declarations.join(' ');
}

const LUMPFISH_SHAPES = `<defs>
    <clipPath id="lumpfish-body">
      <path d="M298 488C306 352 432 270 566 270C708 270 806 362 826 486C846 616 758 742 612 764C470 786 334 724 302 604C296 566 296 524 298 488Z" />
    </clipPath>
  </defs>
  <g class="lumpfish-tail">
    <path class="lf-fin" d="M306 520C272 492 236 470 214 478C196 486 196 520 204 552C212 586 206 612 222 622C244 634 278 604 308 576Z" />
    <path class="lf-line" d="M218 510L276 530M220 552L280 552M222 592L276 572" />
  </g>
  <g class="lumpfish-bumps">
    <circle cx="324" cy="436" r="24" />
    <circle cx="356" cy="364" r="24" />
    <circle cx="410" cy="310" r="26" />
    <circle cx="472" cy="280" r="27" />
    <circle cx="548" cy="268" r="28" />
    <circle cx="634" cy="290" r="24" />
  </g>
  <path class="lf-body" d="M298 488C306 352 432 270 566 270C708 270 806 362 826 486C846 616 758 742 612 764C470 786 334 724 302 604C296 566 296 524 298 488Z" />
  <g clip-path="url(#lumpfish-body)">
    <path class="lf-belly" d="M280 600C340 690 460 712 560 708C660 704 760 660 860 560L860 800L280 800Z" />
    <path class="lf-cheek" d="M540 560C590 600 660 616 720 604C770 594 812 566 840 530L860 800L520 800C556 720 560 640 540 560Z" />
  </g>
  <g class="lf-spots">
    <ellipse cx="442" cy="342" rx="15" ry="13" />
    <ellipse cx="382" cy="400" rx="14" ry="15" />
    <ellipse cx="346" cy="472" rx="12" ry="14" />
    <circle cx="410" cy="458" r="9" />
    <circle cx="476" cy="370" r="7" />
    <circle cx="516" cy="332" r="7" />
    <circle cx="524" cy="394" r="7" />
    <circle cx="392" cy="562" r="8" />
  </g>
  <g class="lumpfish-pectoral">
    <path class="lf-fin-dark" d="M470 600C462 566 494 552 530 558C562 564 578 586 570 614C562 640 528 648 500 640C482 634 474 620 470 600Z" />
    <path class="lf-line" d="M482 576L534 586M478 602L536 604M484 626L530 620" />
  </g>
  <g class="lumpfish-eyes">
    <circle class="lf-eye" cx="658" cy="528" r="33" />
    <circle class="lf-glint" cx="670" cy="514" r="10" />
    <ellipse class="lf-eye" cx="800" cy="504" rx="22" ry="31" />
    <circle class="lf-glint" cx="806" cy="492" r="7" />
  </g>`;

function lumpfishSvg({ embedTokens }: { embedTokens: boolean }): string {
    const style = embedTokens
        ? `<style>.lumpfish { ${fishCustomProperties()} } ${LUMPFISH_CSS}</style>`
        : '';
    return `<svg class="lumpfish" viewBox="190 240 650 540" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${style}${LUMPFISH_SHAPES}</svg>`;
}

function lumpfishFaviconHref(): string {
    return `data:image/svg+xml,${encodeURIComponent(lumpfishSvg({ embedTokens: true }))}`;
}

export function renderDashboardDocument(view: DashboardView, nowMs: number): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lumpcode Worker Dashboard</title>
  <link rel="icon" type="image/svg+xml" href="${lumpfishFaviconHref()}">
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main>
    <header class="masthead">
      ${lumpfishSvg({ embedTokens: false })}
      <h1>Lumpcode Worker Dashboard</h1>
    </header>
    <div id="view">${renderDashboardView(view, nowMs)}</div>
  </main>
  ${pollScript()}
</body>
</html>`;
}
