<script setup lang="ts">
import { navbarPropsObj } from './typings';
import { Icon } from '../icon';

const props = defineProps(navbarPropsObj);
</script>

<template>
    <nav class="navbar">
        <div class="navbar__left">
            <Icon v-bind="props.mainIcon" />
        </div>
        <div class="navbar__right">
            <slot name="right" />
        </div>
    </nav>
</template>

<style>
.navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 70px;
    padding: 0.25rem 1rem;
    box-sizing: border-box;
    background-color: var(--color-primary);
    color: white;
}

.navbar__left {
    display: flex;
    align-items: center;
}

.navbar__right {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.navbar .icon {
    width: auto;
    height: auto;
    max-height: 100%;
}
</style>