import type { MaybePromise } from "@lumpcode/core-internals";
import type { ExtractPropTypes, ExtractPublicPropTypes, PropType } from "vue";

export const loginFormPropsObj = {
    onSubmit: {
        type: Function as PropType<(data: {
            email: string;
            password: string;
        }) => MaybePromise<void>>,
        required: false,
        default: () => null,
    },
} as const;

export type LoginFormProps = ExtractPublicPropTypes<typeof loginFormPropsObj>;

export type LoginFormPrivateProps = ExtractPropTypes<typeof loginFormPropsObj>;

