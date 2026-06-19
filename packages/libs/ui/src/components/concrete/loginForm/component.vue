<script setup lang="ts">
import { VueForm } from '@/components/visual';
import { loginFormPropsObj } from './typings';
import { useVisualProps } from './composables';

const props = defineProps(loginFormPropsObj);

const visualProps = useVisualProps(props);
</script>

<template>
    <div class="login-form">
        <VueForm v-bind="visualProps"/>
    </div>
</template>

<style>
.login-form {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.login-form form {
    width: 100%;
}

.login-form .email-input, .login-form .password-input {
    min-height: 90px;
}

.login-form .submit-button {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: 0.25rem;
}

.login-form .vf-errors {
    display: none;
}
</style>