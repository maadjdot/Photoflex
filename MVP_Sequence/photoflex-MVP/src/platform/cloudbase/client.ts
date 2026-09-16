import cloudbase from "@cloudbase/js-sdk";

export interface CloudBaseConfiguration {
  readonly envId: string;
}

type CloudBaseEnvironment = Readonly<Record<string, string | boolean | undefined>>;

export function readCloudBaseConfiguration(environment: CloudBaseEnvironment): CloudBaseConfiguration | undefined {
  const envId = environment.VITE_CLOUDBASE_ENV_ID;
  return typeof envId === "string" && envId.trim() ? { envId: envId.trim() } : undefined;
}

export function createCloudBaseClient(configuration: CloudBaseConfiguration) {
  return cloudbase.init({ env: configuration.envId, region: "ap-shanghai" });
}

export type CloudBaseClient = ReturnType<typeof createCloudBaseClient>;
