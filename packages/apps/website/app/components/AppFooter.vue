<template>
  <footer class="site-footer">
    <div class="wrap">
      <div class="footer-grid">
        <div class="footer-brand">
          <NuxtLink class="brand" to="/" aria-label="Lumpcode">
            <img src="/logo-mark.png" alt="" width="34" height="34">
            <span>lumpcode</span>
          </NuxtLink>
          <p>A git-first loop manager. Named after the lumpfish.</p>
        </div>
        <div class="footer-col">
          <h2>Product</h2>
          <ul>
            <li><NuxtLink to="/get-started">Get started</NuxtLink></li>
            <li><NuxtLink to="/get-started/daemon">Dedicated daemon</NuxtLink></li>
            <li><a :href="docs.concepts">Concepts</a></li>
            <li><a :href="docs.examples">Examples</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h2>Docs</h2>
          <ul>
            <li><a :href="docs.getStarted">Tutorial</a></li>
            <li><a :href="docs.lumpConfig">Lump config</a></li>
            <li><a :href="docs.commands">Commands</a></li>
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
