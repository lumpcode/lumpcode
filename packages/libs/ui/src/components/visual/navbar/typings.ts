import type { ExtractPropTypes, ExtractPublicPropTypes, PropType } from "vue";
import type { IconProps } from "../icon";

export const navbarPropsObj = {
    mainIcon: {
        type: Object as PropType<IconProps>,
        required: true,
    }
} as const;

export type NavbarProps = ExtractPropTypes<typeof navbarPropsObj>;

export type NavbarPublicProps = ExtractPublicPropTypes<typeof navbarPropsObj>;