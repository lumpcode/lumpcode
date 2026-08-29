<template>
  <header class="site-header">
    <div class="wrap site-header-inner">
      <NuxtLink class="brand" to="/" aria-label="Lumpcode">
        <img src="/logo-mark.png" alt="" width="34" height="34">
        <span>lumpcode</span>
      </NuxtLink>
      <nav class="nav" aria-label="Primary">
        <NuxtLink to="/get-started">Get started</NuxtLink>
        <a class="nav-optional" :href="docs.concepts">Docs</a>
        <a :href="githubRepoUrl">GitHub</a>
      </nav>
    </div>
  </header>
</template>
