<script setup>
// 根组件：只放全局壳（将来可以是布局、导航、provider）。
// 具体页面在 views/ 下，一个文件一个页面。
import ChatView from './views/ChatView.vue';
</script>

<template>
  <ChatView />
</template>
