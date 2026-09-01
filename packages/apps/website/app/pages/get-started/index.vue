<script setup lang="ts">
useHead({
  title: 'Get started',
})

const createCommands = `lumpcode project-setup
lumpcode lump-create myFirstLump`

const runCommand = 'lumpcode run myFirstLump'
</script>

<template>
  <div class="wrap">
    <header class="page-intro">
      <p class="section-kicker">Tutorial</p>
      <h1>From install to the first PR.</h1>
      <p>
        First PR on the machine you develop on. One campaign, by hand. Lumpcode never touches this checkout.
      </p>
      <p class="page-intro-skip">
        <NuxtLink to="/get-started/worker">Already ran a lump locally? Try the worker.</NuxtLink>
      </p>
    </header>

    <div class="guide">
      <section class="guide-step">
        <h2>1. Prerequisites</h2>
        <ul>
          <li>Node.js 22+</li>
          <li>A git repo with <code>origin</code> you can push to, and a primary branch that already exists on that remote (usually <code>main</code>)</li>
          <li>A CLI coding agent on <code>PATH</code> (Cursor, Copilot, Claude Code, Codex, or OpenCode)</li>
          <li>Awareness that <code>lumpcode run</code> invokes that agent (LLM cost)</li>
        </ul>
      </section>

      <section class="guide-step">
        <h2>2. Install the CLI</h2>
        <p>
          Puts <code>lumpcode</code> on your <code>PATH</code>. This is what runs a lump.
        </p>
        <CodeWindow filename="terminal" :code="cliInstall" />
      </section>

      <section class="guide-step">
        <h2>2b. Optional: install the skill</h2>
        <p>
          Helps the agent in your editor write and update lumps.
          Call the skill <code>/lumpcode</code> in your agent's session to help it write and update lumps.
          Not used when a lump runs.
        </p>
        <CodeWindow filename="terminal" :code="skillInstall" />
      </section>

      <section class="guide-step">
        <h2>3. Initialize a project and create a lump</h2>
        <p>
          From the repo root. <code>project-setup</code> writes <code>.lumpcode/project.json</code> (commit this) and <code>.lumpcode/local.json</code> (per machine, gitignored).
        </p>
        <CodeWindow filename="terminal" :code="createCommands" />
      </section>

      <section class="guide-step">
        <h2>4. Point the lump at real work</h2>
        <p>
          Edit <code>.lumpcode/lumps/myFirstLump/config.json</code>. This replaces the stub <code>lump-create</code> wrote.
        </p>
        <CodeWindow filename=".lumpcode/lumps/myFirstLump/config.json" :code="exampleConfig" />
      </section>

      <section class="guide-step">
        <h2>5. Run once</h2>
        <p>
          Lumpcode runs the agent on one context, writes a <code>LUMP: myFirstLump - …</code> marker commit, and pushes a <code>lump/myFirstLump/…</code> branch. Open that as a PR.
        </p>
        <CodeWindow filename="terminal" :code="runCommand" />
        <p>
          Preview without running the agent:
          <code>lumpcode lump-plan myFirstLump</code>.
        </p>
      </section>

    </div>

    <section class="guide-payoff">
      <h2>This is how Lumpcode is meant to run</h2>
      <p>
        A one-off run is how you check it. A worker is how you live with it.
        Start it once on a clone you never edit; you keep authoring and merging on the laptop.
      </p>
      <NuxtLink class="btn btn-primary" to="/get-started/worker">Leave a worker running</NuxtLink>
      <BranchWindow
        filename="origin"
        :branches="workerBranches"
        :footer="workerBranchesFooter"
        loop
      />
    </section>
  </div>
</template>
