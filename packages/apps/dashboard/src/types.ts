export type DashboardStatus = {
    projectName: string;
    daemons: unknown[];
    supervisor: unknown;
};

export type DashboardView = {
    /** ISO-8601 UTC of the last successful list-all read. Absent until then. */
    fetchedAt?: string;
    /** Message of the latest failed read. Absent when the latest read succeeded. */
    readError?: string;
    /** Last successful list-all `data`. Absent until the first success. */
    status?: DashboardStatus;
};

export type DashboardReadResult =
    | { ok: true; status: DashboardStatus }
    | { ok: false; message: string };

export type StartDashboardServerInput = {
    port: number;
    bind: string;
    readStatus: () => Promise<DashboardReadResult>;
};
