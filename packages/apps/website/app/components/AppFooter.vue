<template>
  <footer class="site-footer">
    <div class="wrap">
      <div class="footer-grid">
        <div class="footer-brand">
          <NuxtLink class="brand" to="/" aria-label="Lumpcode">
            <img
              class="brand-lockup"
              src="/logo-lockup.png"
              alt=""
              width="142"
              height="38"
            >
          </NuxtLink>
          <p>Named after the lumpfish.</p>
        </div>
        <div class="footer-col">
          <h2>Product</h2>
          <ul>
            <li><NuxtLink :to="docs.firstPr">Get started</NuxtLink></li>
            <li><NuxtLink :to="docs.worker">Worker</NuxtLink></li>
            <li><NuxtLink :to="docs.concepts">How a run works</NuxtLink></li>
            <li><NuxtLink :to="docs.examples">Examples</NuxtLink></li>
          </ul>
        </div>
        <div class="footer-col">
          <h2>Docs</h2>
          <ul>
            <li><NuxtLink :to="docs.overview">Overview</NuxtLink></li>
            <li><NuxtLink :to="docs.lumpConfig">Lump config</NuxtLink></li>
            <li><NuxtLink :to="docs.commands">Commands</NuxtLink></li>
          </ul>
        </div>
        <div class="footer-col">
          <h2>Community</h2>
          <ul>
            <li><a :href="githubRepoUrl">GitHub</a></li>
            <li><a :href="npmCliUrl">npm</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-meta">
        <span>Apache 2.0. Early development.</span>
        <span>LUMP: Loop Using Multiple Prompts</span>
      </div>
    </div>
  </footer>
</template>
