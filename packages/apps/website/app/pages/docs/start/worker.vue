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
        'In the morning, branches are waiting. You merge, you push a new lump, the worker picks it up. Nothing to deploy.',
    },
  ],
})

const workerLocal = `{
  "mode": "dedicated"
}`

const workerStart = `npm install -g @lumpcode/cli
npm install
lumpcode start
lumpcode daemon-status`

const workerRecipe = `{
  "$schema": "https://lumpcode.com/schemas/daemonConfig.schema.json",
  "discoveryBranch": "dev",
  "include": ["backlog"]
}`

const page = docsVuePages.find((item) => item.path === docs.worker)
</script>

<template>
  <DocsPageShell
    title="Leave a worker running"
    description="In the morning, branches are waiting. You merge, you push a new lump, the worker picks it up. Nothing to deploy."
    :path="docs.worker"
    :headings="page?.headings ?? []"
    :source-path="page?.sourcePath"
  >
    <template #intro>
      <p class="page-intro-skip">
        <a href="#start-named-workers-from-git">Looking for the committed worker file shape?</a>
      </p>
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
          If you have not run a lump by hand yet, do that first:
          <NuxtLink :to="docs.firstPr">From install to the first PR</NuxtLink>.
          <code>.lumpcode/</code> must already be committed and pushed. This page is only the worker.
        </p>
      </section>

      <section id="a-second-clone" class="guide-step">
        <h2>2. A second clone</h2>
        <p>
          Clone the same repo into a folder you never edit. Another directory on this laptop is enough, for example <code>~/lumpcode-worker</code>. A small always-on box is later, not required.
        </p>
      </section>

      <section id="start-it" class="guide-step">
        <h2>3. Start it</h2>
        <p>
          <code>.lumpcode/</code> is already in the repo, so do not run <code>project-setup</code> on the worker.
          Put the CLI on this clone, install project deps, write <code>.lumpcode/local.json</code>, then start.
          The worker also needs Node.js 22+, git <code>user.name</code> and <code>user.email</code>, git <code>origin</code> fetch and push, and a CLI agent on <code>PATH</code> (already logged in).
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
          Writing TypeScript lumps? Add <code>@lumpcode/cli-utils</code> and <code>@lumpcode/recipes</code> to this project's <code>package.json</code> on the laptop, then <code>npm install</code> here. The global CLI does not provide those packages.
        </p>
      </section>

      <section id="back-to-the-laptop" class="guide-step">
        <h2>4. Back to the laptop</h2>
        <p>
          Author as in <NuxtLink :to="docs.firstPr">the first PR</NuxtLink>.
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
          Depth: <NuxtLink :to="docs.localConfig">local.json</NuxtLink>,
          <NuxtLink :to="docs.concepts">run vs start</NuxtLink>.
          Named workers as a committed file:
          <a href="#start-named-workers-from-git">shape below</a>.
        </p>
      </section>
    </div>

    <section id="start-named-workers-from-git" class="guide-step docs-prose">
      <h2>Start named workers from git</h2>
      <p>
        On a <strong>dedicated</strong> clone you can commit a recipe and let the worker start from git.
        Shared mode ignores these files. A plain <code>lumpcode start</code> still works; this is optional.
      </p>

      <h3 id="file-shape">File shape</h3>
      <p>
        Path is <code>.lumpcode/daemons/&lt;name&gt;.{json,yml,yaml}</code> (top-level only).
        The stem is the worker id. Do not put <code>daemonId</code> in the file.
        Required field is <code>discoveryBranch</code> only.
      </p>
      <CodeWindow filename=".lumpcode/daemons/backlog.json" :code="workerRecipe" />
      <div class="docs-table">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>discoveryBranch</code></td>
              <td>Required. Exact expanded primary this file applies to (no <code>*</code> / <code>?</code>). Must equal the <code>origin/&lt;branch&gt;</code> the file was read from. Push the file on that branch.</td>
            </tr>
            <tr>
              <td><code>cronSetup</code></td>
              <td>Cron for that worker. Omit for <code>*/5 * * * *</code>.</td>
            </tr>
            <tr>
              <td><code>include</code> / <code>exclude</code></td>
              <td>Lump-name filters (<code>*</code> globs allowed). Omit or <code>[]</code> for all / none.</td>
            </tr>
            <tr>
              <td><code>disabled</code></td>
              <td>When <code>true</code>, stop or do not start this id.</td>
            </tr>
            <tr>
              <td><code>maxParallelRun</code></td>
              <td>Worktree only. Same meaning as <code>lumpcode start --maxParallelRun</code>. Checkout plus this field is not started.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Editors: <code>$schema</code> <code>https://lumpcode.com/schemas/daemonConfig.schema.json</code>.
        Extra keys fail the schema.
      </p>

      <h3 id="after-you-push">After you push</h3>
      <p>
        Use <code>lumpcode start --superviseOnly</code> on the dedicated clone when you want the supervisor up and
        <em>only</em> these files to start workers. Cannot combine with <code>--include</code>, <code>--exclude</code>,
        <code>--daemonId</code>, <code>--cronSetup</code>, <code>--maxParallelRun</code>, <code>--lumpName</code>, or <code>--foreground</code>.
      </p>
      <div class="docs-table">
        <table>
          <thead>
            <tr>
              <th>Situation</th>
              <th>What happens</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Enabled file, that id not running</td>
              <td>Starts</td>
            </tr>
            <tr>
              <td>File contents changed</td>
              <td>Stops, then starts the new recipe</td>
            </tr>
            <tr>
              <td>File <code>disabled: true</code> or gone</td>
              <td>Stops</td>
            </tr>
            <tr>
              <td>A <code>lumpcode start</code> worker already has that id</td>
              <td>Leaves it alone</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Flags: <NuxtLink :to="`${docs.commands}#lumpcode-start`">commands</NuxtLink>.
        If a file never starts: <NuxtLink to="/docs/reference/troubleshooting#committed-worker-recipe-never-starts">troubleshooting</NuxtLink>.
      </p>
    </section>
  </DocsPageShell>
</template>
