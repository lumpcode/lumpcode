<script setup lang="ts">
definePageMeta({
  layout: 'docs',
})

useHead({
  title: 'Leave a worker running',
  meta: [
    {
      name: 'description',
      content:
        'A second clone with git access and an agent CLI. Prefer worktree, start once, then add lumps on the laptop. The worker picks them up.',
    },
    {
      property: 'og:title',
      content: 'Leave a worker running · Lumpcode',
    },
    {
      property: 'og:description',
      content:
        'A second clone with git access and an agent CLI. Prefer worktree, start once, then add lumps on the laptop. The worker picks them up.',
    },
  ],
})

const workerLocal = `{
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 2
}`

const workerStart = `npm install -g @lumpcode/cli
npm install
lumpcode setup`

const page = docsVuePages.find((item) => item.path === docs.worker)
</script>

<template>
  <DocsPageShell
    title="Leave a worker running"
    description="A second clone with git access and an agent CLI. Prefer worktree, start once, then add lumps on the laptop. The worker picks them up."
    :path="docs.worker"
    :headings="page?.headings ?? []"
    :source-path="page?.sourcePath"
  >
    <template #intro>
      <GuidePathNav current="worker" />
    </template>

    <div class="steps worker-day-steps">
      <article v-for="step in workerSteps" :key="step.title" class="step">
        <div>
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
        </div>
      </article>
    </div>

    <div class="guide">
      <section id="first-pr-already-done" class="guide-step">
        <h2>1. First PR already done</h2>
        <p>
          If you have not rehearsed a lump on the laptop yet, do that first:
          <NuxtLink :to="docs.firstPr">From install to the first PR</NuxtLink>.
          That run was rehearsal on your authoring branch. This clone is the campaign.
          <code>.lumpcode/</code> must already be committed and pushed. This page is only the worker.
        </p>
      </section>

      <section id="a-second-clone" class="guide-step">
        <h2>2. A second clone</h2>
        <p>
          Clone the same repo into a folder you never edit. Another directory on this laptop is enough, for example <code>~/lumpcode-worker</code>. A small always-on box is later, not required.
        </p>
        <p>
          That machine needs only the clone, git <code>origin</code> fetch and push, Node.js 22+, and a CLI agent on <code>PATH</code> (already logged in). Also set git <code>user.name</code> and <code>user.email</code>. No extra service or deploy step.
        </p>
      </section>

      <section id="start-it" class="guide-step">
        <h2>3. Start it</h2>
        <p>
          <code>.lumpcode/</code> is already in the repo, so do not run <code>project-setup</code> on the worker.
          Put the CLI on this clone, install project deps, then run <code>lumpcode setup</code>.
          Setup asks which mode this machine should use. Pick dedicated, then the workspace strategy.
          It writes this machine’s <code>local.json</code> and can start the unfiltered worker.
          If <code>local.json</code> and a lump are already there, setup does nothing; edit <code>local.json</code> if needed and run <code>lumpcode start</code> instead.
        </p>
        <CodeWindow filename=".lumpcode/local.json" :code="workerLocal" />
        <p class="callout-warn">
          <code>mode: dedicated</code> wipes uncommitted work on this clone. Do not pick it for a checkout you also edit.
        </p>
        <h3 id="worktree-or-checkout">Worktree or checkout</h3>
        <p>
          Prefer <code>worktree</code> when this repo can use linked git worktrees. The agent runs in <code>.lumpcode/worktrees/&lt;branch&gt;/</code> (slash segments become folders), so the main tree can stay on the primary branch. That is also what lets <code>maxParallelRun</code> be greater than 1.
        </p>
        <p>
          <code>checkout</code> is the default if you omit the field. This folder switches onto the lump branch, then back. One lump at a time. Use it if worktrees fail for this tree, or you only ever run one lump.
        </p>
        <p>
          <code>maxParallelRun</code> (this file, or <code>--maxParallelRun</code> on <code>start</code>) is how many lumps the worker runs at once. It applies only with <code>worktree</code>. Checkout stays sequential; passing the flag with checkout fails. Omit it or use <code>1</code> until this machine can run two agent sessions. <code>2</code> in the snippet is an example.
        </p>
        <CodeWindow filename="terminal" :code="workerStart" />
        <p>
          <code>lumpcode setup</code> offers <code>lumpcode start</code> with no filters. That daemon id is <code>global</code>. It discovers every lump on a schedule. You do not restart for new lumps.
        </p>
        <p>
          Later: <code>lumpcode daemon-status</code>, <code>lumpcode daemon-log</code>, <code>lumpcode stop</code>.
          Once the worker is running, <code>lumpcode dashboard</code> shows the live snapshot.
        </p>
        <p>
          Writing TypeScript lumps? Add <code>@lumpcode/cli-utils</code> and <code>@lumpcode/recipes</code> to this project's <code>package.json</code> on the laptop, then <code>npm install</code> here. The global CLI does not provide those packages.
        </p>
      </section>

      <section id="back-to-the-laptop" class="guide-step">
        <h2>4. Back to the laptop</h2>
        <p>
          Day to day you stay on the work repo. Add or update lumps there. Preview with <code>lumpcode lump-plan &lt;lumpName&gt;</code>.
          Commit, push, and merge to the primary branch. The worker fetches that branch on its next pass. Nothing to deploy or register.
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
          Depth: <NuxtLink :to="docs.localConfig">local.json</NuxtLink>,
          <NuxtLink :to="docs.concepts">run vs start</NuxtLink>.
        </p>
      </section>
    </div>

    <p class="guide-payoff">
      To start a daemon from a committed file, see
      <NuxtLink :to="docs.daemons">Start daemons from git</NuxtLink>.
    </p>
  </DocsPageShell>
</template>
