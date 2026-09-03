<script setup lang="ts">
definePageMeta({
  layout: 'docs',
})

useHead({
  title: 'First PR',
  meta: [
    {
      name: 'description',
      content: 'First PR on the machine you develop on. One campaign, by hand. Lumpcode never touches this checkout.',
    },
  ],
})

const createCommands = `lumpcode project-setup
lumpcode lump-create myFirstLump`

const previewThenRun = `lumpcode lump-plan myFirstLump --contexts
lumpcode run myFirstLump`

const page = docsVuePages.find((item) => item.path === docs.firstPr)
</script>

<template>
  <DocsPageShell
    title="Get started : From install to the first PR"
    description="First PR on the machine you develop on. One campaign, by hand. Lumpcode never touches this checkout."
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
        <ul>
          <li>Node.js 22+</li>
          <li>A git repo with <code>origin</code> you can push to, and a primary branch that already exists on that remote (usually <code>main</code>)</li>
          <li>Git <code>user.name</code> and <code>user.email</code> set. Lumpcode writes commits.</li>
          <li>A CLI coding agent on <code>PATH</code> (Cursor, Copilot, Claude Code, Codex, or OpenCode)</li>
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
        <h2>2b. Optional: install the skill</h2>
        <p>
          Helps the agent in your editor write and update lumps.
          Call the skill <code>/lumpcode</code> in your agent's session to help it write and update lumps.
          Not used when a lump runs.
        </p>
        <CodeWindow filename="terminal" :code="skillInstall" />
      </section>

      <section id="initialize" class="guide-step">
        <h2>3. Initialize a project and create a lump</h2>
        <p>
          From the repo root. <code>project-setup</code> writes <code>.lumpcode/project.json</code> (commit this) and <code>.lumpcode/local.json</code> (per machine, gitignored).
          Default primary branch is <code>main</code>. If this repo merges on something else, pass it:
          <code>lumpcode project-setup --primaryBranch dev</code>.
        </p>
        <CodeWindow filename="terminal" :code="createCommands" />
      </section>

      <section id="point-at-work" class="guide-step">
        <h2>4. Point the lump at real work</h2>
        <p>
          Edit <code>.lumpcode/lumps/myFirstLump/config.json</code>. This replaces the stub <code>lump-create</code> wrote.
          Change the path templates to files that exist in <em>this</em> repo. The snippet below is the same shape as the landing example; it only matches if you have <code>src/components/{NAME}/</code>.
          To confirm remotes and the agent first, use the <NuxtLink to="/docs/reference/examples#smoke-test">README smoke test</NuxtLink> instead.
        </p>
        <CodeWindow filename=".lumpcode/lumps/myFirstLump/config.json" :code="exampleConfig" />
        <p>
          Commit <code>.lumpcode/project.json</code> and the lump folder. Push before you set up a <NuxtLink :to="docs.worker">worker</NuxtLink>: that clone only sees what is on the remote.
        </p>
      </section>

      <section id="run-once" class="guide-step">
        <h2>5. Preview, then run</h2>
        <p>
          Preview without calling the agent. If the context list is empty, the path templates do not match this repo. Fix them before you run.
        </p>
        <CodeWindow filename="terminal" :code="previewThenRun" />
        <p>
          <code>run</code> invokes the agent on one context, writes a <code>LUMP: myFirstLump - …</code> marker commit, and pushes a <code>lump/myFirstLump/…</code> branch. Open that as a PR.
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
