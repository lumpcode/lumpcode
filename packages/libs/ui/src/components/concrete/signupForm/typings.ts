import type { MaybePromise } from "@lumpcode/core-internals";
import type { ExtractPropTypes, ExtractPublicPropTypes, PropType } from "vue";

export const signupFormPropsObj = {
    onSubmit: {
        type: Function as PropType<(data: {
            email: string;
            password: string;
        }) => MaybePromise<void>>,
        required: false,
        default: () => null,
    },
} as const;

export type SignupFormProps = ExtractPublicPropTypes<typeof signupFormPropsObj>;

export type SignupFormPrivateProps = ExtractPropTypes<typeof signupFormPropsObj>;

