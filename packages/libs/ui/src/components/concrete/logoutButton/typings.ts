import type { MaybePromise } from "@lumpcode/core-internals";
import type { ExtractPropTypes, ExtractPublicPropTypes, PropType } from "vue";

export const logoutButtonPropsObj = {
    onLogout: {
        type: Function as PropType<() => MaybePromise<void>>,
        required: false,
        default: () => null,
    },
    label: {
        type: String,
        required: false,
        default: 'Logout',
    },
} as const;

export type LogoutButtonProps = ExtractPublicPropTypes<typeof logoutButtonPropsObj>;

export type LogoutButtonPrivateProps = ExtractPropTypes<typeof logoutButtonPropsObj>;

