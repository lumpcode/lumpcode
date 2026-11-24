<script setup lang="ts">
useHead({
  title: siteTitle,
  titleTemplate: '%s',
  script: [homeStructuredData()],
})

useReveal()

// Decided once per page view so both hero layers agree; server markup assumes it plays.
const schoolPlays = import.meta.client ? claimSchoolPass() : true

const ocean = ref<HTMLElement | null>(null)
useOceanStir(ocean)

const positioningSplit = positioningLine.indexOf('A software factory')
const positioningLead = positioningLine.slice(0, positioningSplit).trim()
const positioningPunch = positioningLine.slice(positioningSplit)
</script>

<template>
  <div class="landing">
    <section class="hero-stage">
      <Aquarium :school-plays="schoolPlays" />
      <Aquarium layer="school" :school-plays="schoolPlays" />
      <div class="wrap hero">
        <div class="hero-copy">
          <p class="hero-kicker enter" style="--i: 0">
            <span class="hero-kicker-dot" aria-hidden="true" />
            Open source. You just need git and a CLI agent.
          </p>
          <h1>
            <span class="hero-line enter" style="--i: 1">The simplest software factory</span>
            <span class="hero-line hero-line-accent enter" style="--i: 2">lives in your repo.</span>
          </h1>
          <p class="lede enter" style="--i: 3">
            A <strong>lump</strong> is a software factory as code: a folder in your repo that says what to work on, what to prompt, which agent to run, and how to check the result.
            Make it specific to one migration or general enough to take a spec backlog that never stops growing.
          </p>
          <p class="lede enter" style="--i: 4">
            Lumpcode runs your coding agent through it, inside your repo with your skills and docs already there, and pushes a branch for each piece of work. You review each branch as a pull request, or let your CI merge it.
          </p>
          <p class="lede-lump enter" style="--i: 5">
            No account, no database, no backend: git is the only state.
          </p>
          <div class="hero-actions enter" style="--i: 6">
            <NuxtLink class="btn btn-ghost" :to="docs.firstPr">
              Get started
              <span class="btn-arrow" aria-hidden="true">→</span>
            </NuxtLink>
            <a class="btn btn-ghost" :href="githubRepoUrl">View on GitHub</a>
          </div>
          <div class="hero-prompt enter" style="--i: 7">
            <CopySetupPrompt />
            <p class="hero-prompt-caption">
              Paste it into your coding agent. It installs Lumpcode, sets up a dedicated worker, and runs a first lump.
            </p>
          </div>
          <p class="hero-install enter" style="--i: 8">
            <code><span class="prompt" aria-hidden="true">$</span> {{ cliInstall }}</code>
            <span>Apache 2.0. No account needed.</span>
          </p>
        </div>

        <div class="hero-visual">
          <ol class="flow">
            <li class="flow-step enter" style="--i: 2">
              <p class="flow-label"><span class="flow-node" aria-hidden="true" />Your codebase</p>
              <pre class="repo-tree">{{ codebaseTree }}</pre>
            </li>
            <li class="flow-step enter" style="--i: 4">
              <p class="flow-label"><span class="flow-node" aria-hidden="true" />The lump</p>
              <CodeWindow filename=".lumpcode/lumps/portToVue/config.ts" :code="exampleConfig" lines />
              <p class="code-caption">
                <code>{NAME}</code> is the component name, so each component becomes one <strong>context</strong> holding both files.
              </p>
            </li>
            <li class="flow-step enter" style="--i: 6">
              <p class="flow-label"><span class="flow-node" aria-hidden="true" />What you review</p>
              <BranchWindow
                filename="origin"
                :branches="exampleBranches"
                :footer="exampleBranchesFooter"
              />
            </li>
          </ol>
        </div>
      </div>
    </section>

    <section class="wrap statement" data-reveal>
      <p class="statement-line">
        {{ positioningLead }}
        <span class="statement-punch">{{ positioningPunch }}</span>
      </p>
      <p class="statement-sub">{{ sdlcLine }}</p>
    </section>

    <section class="section wrap" id="usage">
      <h2 class="section-title" data-reveal>What you do.</h2>
      <ol class="track">
        <li
          v-for="(step, index) in steps"
          :key="step.title"
          class="track-step"
          data-reveal
          :style="{ '--i': index }"
        >
          <span class="track-index" aria-hidden="true">{{ index + 1 }}</span>
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
          <CodeWindow
            v-if="index === 0"
            class="step-visual"
            :filename="stepConfigFile"
            :code="stepConfig"
          />
          <StepTerminal v-else-if="index === 1" :lines="stepTerminal" />
          <StepPullRequest v-else :pr="stepPullRequest" />
        </li>
      </ol>
    </section>

    <section class="section wrap" id="factories">
      <div class="kinds-head" data-reveal>
        <h2 class="section-title">{{ factoryKindsTitle }}</h2>
        <p class="section-lead">{{ factoryKindsLead }}</p>
      </div>
      <p class="eyebrow kinds-label" data-reveal>{{ factoryKindsLabel }}</p>
      <ul class="kinds-grid">
        <li
          v-for="(item, index) in factoryKinds"
          :key="item.title"
          class="kind-tile"
          data-reveal
          :style="{ '--i': index }"
        >
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </li>
        <li class="kind-tile kind-tile-own" data-reveal :style="{ '--i': factoryKinds.length }">
          <h3>{{ factoryKindsOwn.title }}</h3>
          <p>{{ factoryKindsOwn.body }}</p>
          <NuxtLink :to="docs.examples">See the examples →</NuxtLink>
        </li>
      </ul>
      <div class="fleet" data-reveal>
        <div class="fleet-copy">
          <h3 class="fleet-title">{{ fleetTitle }}</h3>
          <p>{{ fleetBody }}</p>
          <a :href="repoLumpsUrl">Read its lumps on GitHub →</a>
        </div>
        <CodeWindow filename="lumpcode/lumpcode" :code="lumpsTree" />
      </div>
    </section>

    <section class="section wrap" id="as-code">
      <div class="kinds-head" data-reveal>
        <h2 class="section-title">{{ asCodeTitle }}</h2>
        <p class="section-lead">{{ asCodeLead }}</p>
      </div>
      <ul class="feature-list">
        <li
          v-for="(feature, index) in features"
          :key="feature.title"
          class="feature-item"
          data-reveal
          :style="{ '--i': index }"
        >
          <h3>{{ feature.title }}</h3>
          <p v-html="inlineCode(feature.body)" />
        </li>
      </ul>
      <div class="safety" data-reveal>
        <p class="eyebrow">{{ safetyLabel }}</p>
        <ul class="trust-row" aria-label="Safety defaults">
          <li v-for="point in trustPoints" :key="point">
            <svg class="trust-check" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
            {{ point }}
          </li>
        </ul>
      </div>
    </section>

    <section class="section wrap objection" id="why">
      <div class="objection-head" data-reveal>
        <h2 class="section-title">{{ objectionTitle }}</h2>
        <p class="section-lead">{{ objectionLead }}</p>
      </div>
      <div class="objection-grid">
        <article
          v-for="(item, index) in objectionCases"
          :key="item.title"
          class="objection-card"
          data-reveal
          :style="{ '--i': index }"
        >
          <span class="tile-index" aria-hidden="true">0{{ index + 1 }}</span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </article>
      </div>
    </section>

    <section class="section wrap" id="worker">
      <div ref="ocean" class="ocean" data-reveal>
        <div class="ocean-light" aria-hidden="true" />
        <Aquarium :school-plays="schoolPlays" />
        <div class="ocean-inner">
          <div class="ocean-copy">
            <h2 class="worker-title">{{ workerTitle }}</h2>
            <p class="worker-line">{{ workerLine }}</p>
            <p class="worker-lead">{{ workerLead }}</p>
            <div class="hero-actions">
              <NuxtLink class="btn btn-primary" :to="docs.worker">
                Set up a worker
                <span class="btn-arrow" aria-hidden="true">→</span>
              </NuxtLink>
            </div>
          </div>
          <div class="ocean-panel">
            <BranchWindow
              filename="origin"
              :branches="workerBranches"
              :footer="workerBranchesFooter"
              loop
            />
            <p class="code-caption">One worker, several lumps.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section wrap" id="install">
      <div class="install-panel" data-reveal>
        <div class="install-peek" aria-hidden="true">
          <Lumpfish animated />
        </div>
        <div>
          <h2 class="section-title">Install the CLI.</h2>
          <p class="section-lead">
            Node.js 22+, push access to your git remote, and a CLI agent on <code>PATH</code>.
          </p>
          <div class="agent-row" aria-label="Supported agents">
            <span v-for="agent in agents" :key="agent" class="agent-pill">{{ agent }}</span>
            <NuxtLink class="agent-pill agent-pill-own" :to="docs.customAgent">+ your own</NuxtLink>
          </div>
          <p class="install-cost">
            Every run calls your agent, so a lump costs whatever your agent costs.
            Preview what a run would do without calling the agent with <code>lumpcode lump-plan</code>.
          </p>
        </div>
        <div class="install-commands">
          <div class="install-copy">
            <CopySetupPrompt />
            <p class="install-copy-caption">
              Paste it into your coding agent. It installs the skill, sets up this repo and a dedicated worker clone, then proposes and runs a first lump.
            </p>
          </div>
          <p class="install-divider">Or do it yourself</p>
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
