<script setup lang="ts">
useHead({
  title: 'Lumpcode — write the loop once',
  titleTemplate: '%s',
})
</script>

<template>
  <div>
    <section class="wrap hero">
      <div class="hero-copy">
        <p class="hero-kicker">You just need git and a CLI agent.</p>
        <h1>Write the loop once.<br>Review one PR at a time.</h1>
        <p class="lede">
          One chat cannot do a 200-file migration. Lumpcode runs your agent
          through the work in slices: next file or ticket, a branch, you merge.
          Progress lives on origin.
        </p>
        <p class="lede-lump">
          A <strong>lump</strong> is that body of work, described once and
          worked through over many PRs.
        </p>
        <div class="hero-actions">
          <NuxtLink class="btn btn-primary" to="/get-started">Get started</NuxtLink>
          <a class="btn btn-ghost" :href="githubRepoUrl">View on GitHub</a>
        </div>
        <div class="use-when">
          <p class="use-when-label">Use it when</p>
          <ul class="use-when-pills">
            <li v-for="item in useWhen" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
      <div class="hero-visual">
        <img
          class="hero-fish"
          src="/logo-mark.png"
          alt=""
          width="360"
          height="360"
        >
        <CodeWindow filename=".lumpcode/lumps/normalizeUtils/config.ts" :code="exampleConfig" />
        <p class="code-caption">{{ exampleCaption }}</p>
      </div>
    </section>

    <section class="section wrap" id="usage">
      <h2 class="section-title">What you do.</h2>
      <p class="section-lead">
        Describe the work once. Lumpcode picks the next slice, runs your
        agent, and pushes a branch. You open the PR and merge. It continues
        from origin.
      </p>
      <div class="steps">
        <article v-for="(step, index) in steps" :key="step.title" class="step">
          <span class="step-index">{{ index + 1 }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
          </div>
        </article>
      </div>
      <article class="usage-case">
        <h3>{{ campaignCase.title }}</h3>
        <p>{{ campaignCase.body }}</p>
        <p>{{ campaignCase.outcome }}</p>
      </article>
    </section>

    <section class="section wrap" id="specific">
      <h2 class="section-title">Git and your agent.</h2>
      <p class="section-lead">
        The loop lives in the repo. Review stays the way you already ship
        code.
      </p>
      <div class="feature-grid">
        <article v-for="feature in features" :key="feature.title" class="feature-card">
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.body }}</p>
        </article>
      </div>
      <p class="section-follow">
        Cloud agents already give you one task, one branch, one PR.
        Lumpcode is the loop above that. What is left lives in git, not in
        a side system.
      </p>
    </section>

    <section class="section wrap" id="install">
      <h2 class="section-title">Install the CLI.</h2>
      <div class="install-panel">
        <div>
          <p class="section-lead">
            Node.js 22+, git <code>origin</code> push access, and a CLI agent
            on <code>PATH</code>.
          </p>
          <div class="agent-row" aria-label="Supported agents">
            <span v-for="agent in agents" :key="agent" class="agent-pill">{{ agent }}</span>
          </div>
        </div>
        <div class="install-commands">
          <p class="install-label">{{ installCliLabel }}</p>
          <CodeWindow filename="terminal" :code="cliInstall" />
          <p class="install-label">{{ installSkillLabel }}</p>
          <CodeWindow filename="terminal" :code="skillInstall" />
        </div>
      </div>
    </section>
  </div>
</template>
