import type cloudbase from "@cloudbase/js-sdk";

// SDK 3.9.4's app entry declares its kernel class as the fully registered App,
// which fails its own implements check. Keep that SDK declaration defect at
// this JS boundary while exposing only the capabilities registered at runtime.
export function createModularCloudBaseClient(envId: string): Pick<ReturnType<typeof cloudbase.init>, "auth" | "rdb">;
