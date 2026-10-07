import cloudbase from "@cloudbase/js-sdk/app";
import { registerAuth } from "@cloudbase/js-sdk/auth";
import { registerMySQL } from "@cloudbase/js-sdk/mysql";

registerAuth(cloudbase);
registerMySQL(cloudbase);

export function createModularCloudBaseClient(envId) {
  return cloudbase.init({ env: envId, region: "ap-shanghai" });
}
