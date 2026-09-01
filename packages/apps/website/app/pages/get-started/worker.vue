<script setup lang="ts">
useHead({
  title: 'Leave a worker running',
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
      <h1>Leave a worker running</h1>
      <p>
        In the morning, branches are waiting. You merge, you push a new lump, the worker picks it up. Nothing to deploy.
      </p>
      <GuidePathNav current="worker" />
    </header>

    <div class="steps worker-day-steps">
      <article v-for="step in workerSteps" :key="step.title" class="step">
        <div>
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
        </div>
      </article>
    </div>

    <div class="guide">
      <section class="guide-step">
        <h2>1. First PR already done</h2>
        <p>
          If you have not run a lump by hand yet, do that first:
          <NuxtLink to="/get-started">From install to the first PR</NuxtLink>. This page is only the worker.
        </p>
      </section>

      <section class="guide-step">
        <h2>2. A second clone</h2>
        <p>
          Clone the same repo into a folder you never edit. Another directory on this laptop is enough, for example <code>~/lumpcode-worker</code>. A small always-on box is later, not required.
        </p>
      </section>

      <section class="guide-step">
        <h2>3. Start it</h2>
        <p>
          <code>.lumpcode/</code> is already in the repo, so do not run <code>project-setup</code> on the worker.
          Put the CLI on this clone, install project deps, write <code>.lumpcode/local.json</code>, then start.
          The worker also needs Node.js 22+, git <code>origin</code> fetch and push, and a CLI agent on <code>PATH</code> (already logged in).
        </p>
        <CodeWindow filename=".lumpcode/local.json" :code="workerLocal" />
        <p class="callout-warn">
          <code>mode: dedicated</code> wipes uncommitted work on this clone. Do not pick it for a checkout you also edit.
        </p>
        <CodeWindow filename="terminal" :code="workerStart" />
        <p>
          <code>lumpcode start</code> with no filters discovers every lump on a schedule. You do not restart for new lumps.
        </p>
        <p>
          Later: <code>lumpcode daemon-status</code>, <code>lumpcode daemon-log</code>, <code>lumpcode stop</code>.
        </p>
        <p>
          Writing TypeScript lumps? <a :href="docs.lumpConfig">Lump config</a>.
        </p>
      </section>

      <section class="guide-step">
        <h2>4. Back to the laptop</h2>
        <p>
          Author as in <NuxtLink to="/get-started">the first PR</NuxtLink>.
          Preview with <code>lumpcode lump-plan &lt;lumpName&gt;</code>.
          Commit, push, and merge to the primary branch. The worker fetches that branch on its next pass.
        </p>
        <ul>
          <li>
            Every finished context gets a <code>LUMP: &lt;lumpName&gt; - &lt;context&gt;</code> marker commit on a <code>lump/…</code> branch. Open a PR. If you squash, keep that line.
          </li>
          <li>
            Merge what is good. The next pass skips finished contexts and picks another.
          </li>
          <li>
            To pause a campaign, set <code>disabled: true</code> on the lump, push, and merge. The next pass soft-skips it. The worker stays up.
          </li>
        </ul>
        <p>
          Depth: <a :href="docs.localConfig">local.json</a>, <a :href="docs.concepts">run vs start</a>.
        </p>
      </section>
    </div>
  </div>
</template>
