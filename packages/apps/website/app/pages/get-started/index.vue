<script setup lang="ts">
useHead({
  title: 'Get started',
})

const createCommands = `lumpcode project-setup
lumpcode lump-create myFirstLump`

const runCommand = 'lumpcode run myFirstLump'

const starterConfig = `{
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve the code at @{FILE}.",
    "command": "cursor"
  }
}`
</script>

<template>
  <div class="wrap">
    <header class="page-intro">
      <p class="section-kicker">Tutorial</p>
      <h1>From install to the first PR.</h1>
      <p>
        Shared mode on the machine you develop on. Lumpcode never touches
        this checkout. One campaign, one PR, by hand.
      </p>
      <GuidePathNav current="run" />
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
        <h2>2. Install the skill and the CLI</h2>
        <p>
          The skill gives your coding agent current Lumpcode docs. Without it,
          the agent has no product context.
        </p>
        <CodeWindow filename="terminal" :code="`${skillInstall}\n${cliInstall}`" />
      </section>

      <section class="guide-step">
        <h2>3. Initialize a project and create a lump</h2>
        <p>
          From the repo root. <code>project-setup</code> writes
          <code>.lumpcode/project.json</code> (commit this) and
          <code>.lumpcode/local.json</code> (per machine, gitignored).
        </p>
        <CodeWindow filename="terminal" :code="createCommands" />
      </section>

      <section class="guide-step">
        <h2>4. Point the lump at real work</h2>
        <p>
          Edit <code>.lumpcode/lumps/myFirstLump/config.json</code>.
          One context source, one prompt. <code>{NAME}</code> becomes one
          context per matching file.
        </p>
        <CodeWindow filename=".lumpcode/lumps/myFirstLump/config.json" :code="starterConfig" />
      </section>

      <section class="guide-step">
        <h2>5. Run once</h2>
        <p>
          Lumpcode runs the agent on one context, writes a
          <code>LUMP: myFirstLump - …</code> marker commit, and pushes a
          <code>lump/myFirstLump/…</code> branch. Open that as a PR.
        </p>
        <CodeWindow filename="terminal" :code="runCommand" />
        <p>
          Preview without running the agent:
          <code>lumpcode lump-plan myFirstLump</code>.
        </p>
      </section>

      <section class="guide-step">
        <h2>Next: a worker that keeps ticking</h2>
        <p>
          When a one-off run works, leave a dedicated clone running the
          default daemon. You keep authoring and merging on the laptop.
        </p>
        <p>
          <NuxtLink to="/get-started/daemon">Dedicated daemon →</NuxtLink>
        </p>
      </section>
    </div>
  </div>
</template>
