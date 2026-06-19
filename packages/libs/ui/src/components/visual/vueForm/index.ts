import VueFormComp from './component.vue';
import { Vueform as VueFormComponent, type VueformProps } from '@vueform/vueform';

export const VueForm = VueFormComp as unknown as (typeof VueFormComponent);

export type VueFormProps = VueformProps;