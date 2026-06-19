<script setup lang="ts">
import { VueForm } from '@/components/visual';
import { signupFormPropsObj } from './typings';
import { useVisualProps } from './composables';

const props = defineProps(signupFormPropsObj);

const visualProps = useVisualProps(props);
</script>

<template>
    <div class="signup-form">
        <VueForm v-bind="visualProps"/>
    </div>
</template>

<style>
.signup-form {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.signup-form form {
    width: 100%;
}

.signup-form .email-input, .signup-form .password-input {
    min-height: 90px;
}

.signup-form .submit-button {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: 0.25rem;
}

.signup-form .vf-errors {
    display: none;
}
</style>

