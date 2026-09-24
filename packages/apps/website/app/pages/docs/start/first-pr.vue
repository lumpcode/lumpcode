<script setup lang="ts">
definePageMeta({
  layout: 'docs',
})

useHead({
  title: 'First PR: start AI loops on an existing git repo',
  meta: [
    {
      name: 'description',
      content:
        'Start AI loops for the development life cycle on an existing git repo. Run lumpcode setup, rehearse one campaign on this branch, then push yourself.',
    },
    {
      property: 'og:title',
      content: 'First PR: start AI loops on an existing git repo · Lumpcode',
    },
    {
      property: 'og:description',
      content:
        'Start AI loops for the development life cycle on an existing git repo. Run lumpcode setup, rehearse one campaign on this branch, then push yourself.',
    },
  ],
})

const setupCommand = 'lumpcode setup'

const page = docsVuePages.find((item) => item.path === docs.firstPr)
</script>

<template>
  <DocsPageShell
    title="Get started : From install to the first PR"
    description="Start AI loops on an existing git repo. Rehearse one campaign on this branch. Verify, type c for LUMP markers, then push yourself."
    :path="docs.firstPr"
    :headings="page?.headings ?? []"
    :source-path="page?.sourcePath"
  >
    <template #intro>
      <p class="page-intro-skip">
        <NuxtLink :to="docs.worker">Already ran a lump locally? Try the worker.</NuxtLink>
      </p>
    </template>

    <div class="guide">
      <section id="prerequisites" class="guide-step">
        <h2>1. Prerequisites</h2>
        <p>
          You already have a git repo. This walkthrough starts AI loops on it.
        </p>
        <ul>
          <li>Node.js 22+</li>
          <li>A git repo with <code>origin</code> you can push to, and a primary branch that already exists on that remote (usually <code>main</code>)</li>
          <li>Git <code>user.name</code> and <code>user.email</code> set. Setup commits the Lumpcode files; typing <code>c</code> after a shared run stamps LUMP markers.</li>
          <li>A CLI coding agent on <code>PATH</code> (Cursor, Copilot, Claude Code, Codex, or OpenCode). If none is installed, setup waits for a command tag.</li>
          <li>Awareness that <code>lumpcode run</code> invokes that agent (LLM cost)</li>
        </ul>
      </section>

      <section id="install-the-cli" class="guide-step">
        <h2>2. Install the CLI</h2>
        <p>
          Puts <code>lumpcode</code> on your <code>PATH</code>. This is what runs a lump.
        </p>
        <CodeWindow filename="terminal" :code="cliInstall" />
      </section>

      <section id="optional-skill" class="guide-step">
        <h2>2b. Optional: the skill</h2>
        <p>
          Helps the agent in your editor write and update lumps.
          Call the skill <code>/lumpcode</code> in your agent's session.
          Not used when a lump runs. <code>lumpcode setup</code> offers this install; you can also run it yourself.
        </p>
        <CodeWindow filename="terminal" :code="skillInstall" />
      </section>

      <section id="initialize" class="guide-step">
        <h2>3. Run setup</h2>
        <p>
          From the repo root, on the branch you want to rehearse on. Setup is interactive (a TTY, not <code>--json</code>).
          It scaffolds <code>.lumpcode/</code>, asks JSON, JavaScript, or TypeScript (JSON is the simple path; js/ts installs <code>@lumpcode/cli-utils</code> and <code>@lumpcode/recipes</code>), writes a first lump (README when that file exists), pauses so you can edit, commits and pushes the allowlisted files, plans, then runs in place on this branch.
        </p>
        <CodeWindow filename="terminal" :code="setupCommand" />
        <p>
          When it pauses, reshape the stub toward files in <em>this</em> repo.
          A first campaign is often AI coding refactoring, a migration, or a small docs pass.
          The snippet below is the same shape as the landing example; it only matches if you have <code>src/components/{NAME}/</code>.
          To confirm remotes and the agent first, use the <NuxtLink to="/docs/reference/examples#smoke-test">README smoke test</NuxtLink> instead.
        </p>
        <CodeWindow filename=".lumpcode/lumps/myFirstLump/config.json" :code="exampleConfig" />
        <p>
          CI and scripts that cannot prompt should keep using flags-only <code>lumpcode project-setup</code>.
        </p>
      </section>

      <section id="run-once" class="guide-step">
        <h2>4. Rehearse on this branch</h2>
        <p>
          Shared setup runs the agent on the branch you are on. It does not create a <code>lump/…</code> branch and does not open a pull request.
          Verify the updates. Type <code>c</code> to stamp <code>LUMP: myFirstLump - …</code> markers (still no push), or <code>e</code> to leave the tree dirty and run again.
          Then push this branch yourself.
        </p>
      </section>
    </div>

    <section id="meant-to-run" class="guide-payoff">
      <h2>This is how Lumpcode is meant to run</h2>
      <p>
        A one-off run is how you check it. A worker is how you live with it.
        Start it once on a clone you never edit; you keep authoring and merging on the laptop.
        <code>.lumpcode/</code> must already be on the remote.
      </p>
      <NuxtLink class="btn btn-primary" :to="docs.worker">Leave a worker running</NuxtLink>
      <BranchWindow
        filename="origin"
        :branches="workerBranches"
        :footer="workerBranchesFooter"
        loop
      />
    </section>
  </DocsPageShell>
</template>
