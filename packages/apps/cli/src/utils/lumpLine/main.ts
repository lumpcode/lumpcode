export type LumpLine = {
    lumpName: string;
    /** Bound scan line. Omitted = shared collect (no discovery bind). */
    effectiveDiscoveryBranch?: string;
};

export type DedicatedLumpLine = LumpLine & {
    effectiveDiscoveryBranch: string;
};
