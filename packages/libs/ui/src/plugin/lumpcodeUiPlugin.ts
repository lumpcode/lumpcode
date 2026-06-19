import type { Plugin } from 'vue';
import Vueform from '@vueform/vueform';
import vueformConfig from './vueform.config';
import '@/styles/theme.css';

export const lumpcodeUiPlugin: Plugin = {
    install(app) {
        app.use(Vueform, vueformConfig);
    }
}