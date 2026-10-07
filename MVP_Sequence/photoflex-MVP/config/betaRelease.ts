export interface BetaReleaseConfiguration { readonly envId: string; readonly origin: string }
type BuildEnvironment = Readonly<Record<string, string | undefined>>;

// Public development ID recorded in docs/CloudBase_Migration.md. Keep Beta isolated.
export const DEVELOPMENT_CLOUDBASE_ENV_ID = "photoflex-d0gh9kyug3b971e6d";

export function readBetaReleaseConfiguration(environment: BuildEnvironment, configuredDevelopmentEnvId?: string): BetaReleaseConfiguration {
  const envId = environment.VITE_BETA_CLOUDBASE_ENV_ID?.trim();
  if (!envId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(envId) || envId.startsWith("your-")) {
    throw new Error("Beta build requires an explicit VITE_BETA_CLOUDBASE_ENV_ID. Configure .env.beta.local or the release job.");
  }
  if (envId === DEVELOPMENT_CLOUDBASE_ENV_ID || envId === configuredDevelopmentEnvId?.trim()) {
    throw new Error("Beta build cannot target the development CloudBase environment.");
  }
  const origin = environment.VITE_BETA_ORIGIN?.trim();
  if (!origin) throw new Error("Beta build requires VITE_BETA_ORIGIN for the deployment record.");
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error("VITE_BETA_ORIGIN must be an HTTPS origin."); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost")) {
    throw new Error("VITE_BETA_ORIGIN must be an HTTPS origin without credentials, a path, query or fragment.");
  }
  return { envId, origin: url.origin };
}
