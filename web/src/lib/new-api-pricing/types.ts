// Display metadata supplied by New API's existing /api/pricing response.
export type BillingUsageSchema = Record<
    string,
    {
        type?: "number" | "boolean";
        unit?: "second" | "count" | "token" | "credit";
        unitLabel?: string | Record<string, string>;
        enum?: string[];
        enumLabels?: Record<string, string | Record<string, string>>;
        description?: string | Record<string, string>;
    }
>;
