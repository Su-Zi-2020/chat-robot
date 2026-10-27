<script setup>
// 根组件：只放全局壳（将来可以是布局、导航、provider）。
// 具体页面在 views/ 下，一个文件一个页面。
import ChatView from './views/ChatView.vue';
</script>

<template>
    <ChatView />
</template>

<!-- 全局样式：不加 scoped，所以对所有页面生效。只放 reset 和 body 这类东西。 -->
<style>
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    background: #0f1115;
    color: #e6e8ee;
    font: 15px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
</style>
