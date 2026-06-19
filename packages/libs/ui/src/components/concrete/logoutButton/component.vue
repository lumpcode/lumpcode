<script setup lang="ts">
import { ref } from 'vue';
import { logoutButtonPropsObj } from './typings';

const props = defineProps(logoutButtonPropsObj);

const isLoading = ref(false);

async function handleLogout() {
    if (isLoading.value) return;
    
    isLoading.value = true;
    try {
        await props.onLogout?.();
    } finally {
        isLoading.value = false;
    }
}
</script>

<template>
    <button 
        class="logout-button" 
        :class="{ 'logout-button--loading': isLoading }"
        @click="handleLogout"
        :disabled="isLoading"
    >
        <span class="logout-button__label">{{ label }}</span>
        <svg 
            class="logout-button__icon" 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
        >
            <path 
                d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" 
                stroke="currentColor" 
                stroke-width="2" 
                stroke-linecap="round" 
                stroke-linejoin="round"
            />
            <path 
                d="M16 17L21 12L16 7" 
                stroke="currentColor" 
                stroke-width="2" 
                stroke-linecap="round" 
                stroke-linejoin="round"
            />
            <path 
                d="M21 12H9" 
                stroke="currentColor" 
                stroke-width="2" 
                stroke-linecap="round" 
                stroke-linejoin="round"
            />
        </svg>
    </button>
</template>

<style>
.logout-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background-color: transparent;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.logout-button:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.5);
}

.logout-button:active:not(:disabled) {
    transform: scale(0.98);
}

.logout-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.logout-button--loading .logout-button__icon {
    animation: spin 1s linear infinite;
}

.logout-button__icon {
    width: 1rem;
    height: 1rem;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}
</style>

