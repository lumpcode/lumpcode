import type { ExtractPropTypes, ExtractPublicPropTypes, PropType } from "vue";

type Name = 'lumpcode';

export const iconPropsObj = {
    name: {
        type: String as PropType<Name>,
        required: true,
    },
    color: {
        type: String as PropType<string>,
        required: false,
        default: 'currentColor',
    },
    size: {
        type: Number,
        required: false,
        default: 1,
    }
} as const;

export type IconProps = ExtractPublicPropTypes<typeof iconPropsObj>;

export type IconPrivateProps = ExtractPropTypes<typeof iconPropsObj>;