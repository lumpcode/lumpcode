<script setup lang="ts">
useHead({
  title: siteTitle,
  titleTemplate: '%s',
})
</script>

<template>
  <div>
    <section class="wrap hero">
      <div class="hero-copy">
        <p class="hero-kicker">You just need git and a CLI agent.</p>
        <h1>
          <span class="hero-line">The simplest software factory</span>
          <span class="hero-line">lives in your repo.</span>
        </h1>
        <p class="lede">
          A <strong>lump</strong> is a software factory defined in a folder of your repo: what to work on, what to prompt, which agent, how to check the result.
          Make it specific to one migration or general enough to take a spec backlog that never stops growing.
        </p>
        <p class="lede">
          Lumpcode runs your coding agent through it and pushes a branch for each piece of work. You review each branch as a pull request, or let your CI merge it.
        </p>
        <p class="lede-lump">
          No account, no database, nothing to deploy. Changing the factory is a pull request your team reviews, like the rest of your code.
        </p>
        <div class="hero-actions">
          <NuxtLink class="btn btn-primary" :to="docs.firstPr">Get started</NuxtLink>
          <a class="btn btn-ghost" :href="githubRepoUrl">View on GitHub</a>
        </div>
        <p class="hero-install">
          <code>{{ cliInstall }}</code>
          <span>Apache 2.0. No account needed.</span>
        </p>
      </div>
      <div class="hero-visual">
        <img
          class="hero-fish"
          src="/logo-mark.png"
          alt=""
          width="360"
          height="360"
        >
        <p class="visual-step">Your codebase</p>
        <pre class="repo-tree">{{ codebaseTree }}</pre>
        <p class="visual-step">The lump</p>
        <CodeWindow filename=".lumpcode/lumps/portToVue/config.json" :code="exampleConfig" />
        <p class="code-caption">
          <code>{NAME}</code> is the component name, so each component becomes one <strong>context</strong> holding both files.
        </p>
        <p class="visual-step">What you review</p>
        <BranchWindow
          filename="origin"
          :branches="exampleBranches"
          :footer="exampleBranchesFooter"
        />
      </div>
    </section>

    <section class="wrap band">
      <div>
        <p class="band-line">{{ positioningLine }}</p>
        <p class="band-line band-line-sub">{{ sdlcLine }}</p>
      </div>
      <div class="use-when">
        <p class="use-when-label">Use it when</p>
        <ul class="use-when-pills">
          <li v-for="item in useWhen" :key="item">{{ item }}</li>
        </ul>
        <p class="use-when-more">
          {{ useWhenMore }}
          <NuxtLink :to="docs.examples">See the examples.</NuxtLink>
        </p>
      </div>
    </section>

    <section class="wrap safety">
      <p class="use-when-label">{{ safetyLabel }}</p>
      <ul class="trust-row" aria-label="Safety defaults">
        <li v-for="point in trustPoints" :key="point">{{ point }}</li>
      </ul>
    </section>

    <section class="section wrap" id="usage">
      <h2 class="section-title">What you do.</h2>
      <div class="steps">
        <article v-for="(step, index) in steps" :key="step.title" class="step">
          <span class="step-index">{{ index + 1 }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
          </div>
        </article>
      </div>
      <p class="range-lead">
        {{ rangeLead }}
        <NuxtLink :to="docs.firstPr">Start here.</NuxtLink>
      </p>
    </section>

    <section class="section wrap" id="specific">
      <h2 class="section-title">One folder per factory.</h2>
      <p class="section-lead">
        Add another lump folder and you have another factory, running through the same CLI.
        Lumpcode stores nothing of its own, so pushing a commit is the only way you ever control any of them.
      </p>
      <CodeWindow filename="your-repo" :code="lumpsTree" />
      <div class="feature-grid">
        <article v-for="feature in features" :key="feature.title" class="feature-card">
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.body }}</p>
        </article>
      </div>
    </section>

    <section class="section wrap" id="why">
      <h2 class="section-title">{{ objectionTitle }}</h2>
      <p class="section-lead">{{ objectionLead }}</p>
      <div class="range-grid">
        <article v-for="item in objectionCases" :key="item.title" class="range-card">
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </article>
      </div>
    </section>

    <section class="section wrap worker" id="worker">
      <h2 class="section-title worker-title">{{ workerTitle }}</h2>
      <p class="worker-line">{{ workerLine }}</p>
      <p class="section-lead">{{ workerLead }}</p>
      <div class="hero-actions worker-actions">
        <NuxtLink class="btn btn-primary" :to="docs.worker">Set up a worker</NuxtLink>
      </div>
      <div class="worker-panel">
        <div class="steps">
          <article v-for="(step, index) in workerSteps" :key="step.title" class="step">
            <span class="step-index">{{ index + 1 }}</span>
            <div>
              <h3>{{ step.title }}</h3>
              <p>{{ step.body }}</p>
            </div>
          </article>
        </div>
        <div>
          <BranchWindow
            filename="origin"
            :branches="workerBranches"
            :footer="workerBranchesFooter"
            loop
          />
          <p class="code-caption">
            One worker, several lumps.
          </p>
        </div>
      </div>
    </section>

    <section class="section wrap" id="install">
      <h2 class="section-title">Install the CLI.</h2>
      <div class="install-panel">
        <div>
          <p class="section-lead">
            Node.js 22+, git <code>origin</code> push access, and a CLI agent on <code>PATH</code>.
          </p>
          <div class="agent-row" aria-label="Supported agents">
            <span v-for="agent in agents" :key="agent" class="agent-pill">{{ agent }}</span>
          </div>
          <p class="install-cost">
            Every run calls your agent, so a lump costs whatever your agent costs.
            Preview what a run would do without calling the agent with <code>lumpcode lump-plan</code>.
          </p>
        </div>
        <div class="install-commands">
          <p class="install-label">{{ installCliLabel }}</p>
          <CodeWindow filename="terminal" :code="cliInstall" />
          <p class="install-label">{{ installSkillLabel }}</p>
          <CodeWindow filename="terminal" :code="skillInstall" />
          <p class="install-label">
            Then call the skill with <code>/lumpcode</code>.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
