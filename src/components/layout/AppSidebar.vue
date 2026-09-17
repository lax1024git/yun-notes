<script setup lang="ts">
import FileTree from '../FileTree.vue'
import GitPanel from '../GitPanel.vue'
</script>

<template>
  <aside class="sidebar">
    <div class="tree-wrap">
      <FileTree />
    </div>
    <div class="panel git-wrap">
      <GitPanel />
    </div>
  </aside>
</template>

<style scoped>
.tree-wrap {
  flex: 1.4;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem;
}
.git-wrap {
  flex: 1;
  min-height: 180px;
  max-height: 48%;
}
</style>
