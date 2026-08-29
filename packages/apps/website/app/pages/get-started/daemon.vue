<script setup lang="ts">
useHead({
  title: 'Dedicated daemon',
})

const workerLocal = `{
  "mode": "dedicated"
}`

const workerStart = `npm install -g @lumpcode/cli
npm install
lumpcode start
lumpcode daemon-status`
</script>

<template>
  <div class="wrap">
    <header class="page-intro">
      <p class="section-kicker">Tutorial</p>
      <h1>A worker that ticks while you review.</h1>
      <p>
        A second clone, that you do not develop in, runs the default
        <code>global</code> daemon. Push a lump to the primary branch; the
        next tick picks it up. Nothing to deploy.
      </p>
      <GuidePathNav current="daemon" />
    </header>

    <div class="guide">
      <section class="guide-step">
        <h2>Before you start</h2>
        <p>
          Lumpcode must already be in the repo: committed
          <code>.lumpcode/project.json</code>, and at least one lump you can
          plan or run. Do that on your laptop first:
          <NuxtLink to="/get-started">one run</NuxtLink>.
        </p>
        <p>
          This page is only the worker. The laptop stays on
          <code>mode: shared</code>.
        </p>
      </section>

      <section class="guide-step">
        <h2>1. Two machines</h2>
        <div class="machine-grid">
          <div class="machine-card">
            <h3>Laptop</h3>
            <p>
              Day-to-day repo. You write lumps, plan, optionally
              <code>run</code>, and merge. Lumpcode never touches this
              checkout.
            </p>
          </div>
          <div class="machine-card">
            <h3>Worker</h3>
            <p>
              A clone you never edit. <code>mode: dedicated</code> runs in
              place. Pre-flight hard-resets that tree. Typical: a small
              always-on box.
            </p>
          </div>
        </div>
        <p class="callout-warn">
          Dedicated wipes uncommitted work on the worker. Do not pick it for a
          clone you also edit.
        </p>
      </section>

      <section class="guide-step">
        <h2>2. Worker: dedicated, then start</h2>
        <p>
          Clone (or pull) the same repo. <code>.lumpcode/</code> is already
          there, so do not run <code>project-setup</code>. Put the CLI on
          this machine, install project deps, write
          <code>.lumpcode/local.json</code>, then start the default daemon.
          The worker also needs Node.js 22+, git <code>origin</code> fetch
          and push, and a CLI agent on <code>PATH</code> (already logged in).
        </p>
        <CodeWindow filename=".lumpcode/local.json" :code="workerLocal" />
        <CodeWindow filename="terminal" :code="workerStart" />
        <p>
          TypeScript lumps resolve <code>@lumpcode/cli-utils</code> and
          <code>@lumpcode/recipes</code> from the project's
          <code>node_modules</code>. Add them on the laptop and push before
          the worker's <code>npm install</code> if those lumps need them.
        </p>
        <p>
          No new lumps since the one-run is fine.
          <code>lumpcode start</code> with no filters is the
          <code>global</code> daemon: it discovers every lump on a cron
          (default every five minutes). When a lump appears on the primary
          branch, the next tick runs it. You do not restart for new lumps.
        </p>
        <p>
          Later: <code>lumpcode daemon-status</code>,
          <code>lumpcode daemon-log</code>, <code>lumpcode stop</code>.
        </p>
      </section>

      <section class="guide-step">
        <h2>3. Laptop: ship the next lump</h2>
        <p>
          Author as in
          <NuxtLink to="/get-started">one run</NuxtLink>.
          Preview with <code>lumpcode lump-plan &lt;lumpName&gt;</code>.
          Commit, push, and merge to the primary branch. The worker fetches
          that branch on the next tick.
        </p>
      </section>

      <section class="guide-step">
        <h2>4. Merge work, then keep going</h2>
        <ul>
          <li>
            Each finished context is a <code>lump/…</code> branch with
            subject <code>LUMP: &lt;lumpName&gt; - &lt;context&gt;</code>.
            Open a PR. If you squash, keep that line.
          </li>
          <li>
            Merge what is good. The next tick skips finished contexts and
            picks another.
          </li>
          <li>
            To pause a campaign, set <code>disabled: true</code> on the lump,
            push, and merge. The next tick soft-skips it. The daemon stays
            up.
          </li>
        </ul>
        <p>
          Depth:
          <a :href="docs.localConfig">local.json</a>,
          <a :href="docs.concepts">run vs start</a>.
        </p>
      </section>
    </div>
  </div>
</template>
