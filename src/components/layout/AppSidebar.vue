<script setup lang="ts">
import FileTree from '../FileTree.vue'
import GitPanel from '../GitPanel.vue'
</script>

<template>
  <aside class="sidebar">
    <div class="tree-wrap">
      <div class="section-label">Workspace</div>
      <FileTree />
    </div>
    <div class="panel git-wrap">
      <div class="section-label">Version Control</div>
      <GitPanel />
    </div>
  </aside>
</template>

<style scoped>
.tree-wrap {
  flex: 1.4;
  min-height: 0;
  overflow: auto;
  padding: 0.65rem 0.6rem 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.git-wrap {
  flex: 1;
  min-height: 180px;
  max-height: 48%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: color-mix(in srgb, var(--bg) 35%, transparent);
}
.git-wrap :deep(h3) {
  display: none;
}
.section-label {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  padding: 0 0.15rem 0.15rem;
  border-bottom: 1px dashed color-mix(in srgb, var(--accent) 35%, transparent);
  margin-bottom: 0.15rem;
}
</style>
