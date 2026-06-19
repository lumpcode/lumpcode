<script setup lang="ts">
import { iconPropsObj, type IconProps } from './typings';
import LumpcodeIcon from './lumpcode.vue';
import type { Component } from 'vue';

const props = defineProps(iconPropsObj);

const iconRecord: Record<IconProps['name'], Component> = {
    lumpcode: LumpcodeIcon,
};
</script>

<template>
    <div 
        v-for="[key, icon] in Object.entries(iconRecord)" 
        class="icon" 
        :key="key" 
        :style="{ color: props.color, fontSize: `${props.size}rem` }"
    >
        <component v-if="key === props.name" :is="icon"/>
    </div>
</template>

<style>
    .icon {
        width: auto;
        height: auto;
        display: flex;
        align-items: center;
        justify-content: center;
    }
</style>