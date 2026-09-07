import type { AgentDoctor } from "./agent-doctor";

const SECRET_KEY = /key|token|secret|password|auth|credential/i;

/** Strip userinfo from proxy URLs; mask other credential-like env values. */
export function redactSecretEnv(key: string, value: string): string {
  if (/proxy/i.test(key)) {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return "[redacted-proxy]";
    }
  }
  if (SECRET_KEY.test(key)) return "[redacted]";
  return value;
}

export type SupportBundleInput = {
  version: string;
  locale: string;
  doctors: ReadonlyArray<AgentDoctor>;
  env: Record<string, string | undefined>;
};

export function supportBundleText(input: SupportBundleInput): string {
  const envLines = Object.entries(input.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .filter(([key]) => /^(PATH|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|GROK_|http_proxy|https_proxy)$/i.test(key) || SECRET_KEY.test(key))
    .map(([key, value]) => `${key}=${redactSecretEnv(key, value)}`);
  const doctorLines = input.doctors.map((d) => {
    const bin = d.binary ?? "(missing)";
    const ver = d.version ?? "(unknown)";
    return `- ${d.agentId}: binary=${bin} version=${ver} auth=${d.authPresent ? d.authKind : "none"} home=${d.home}`;
  });
  return [
    "Grok Build Desktop support bundle",
    `version: ${input.version}`,
    `locale: ${input.locale}`,
    "",
    "doctors:",
    ...doctorLines,
    "",
    "env:",
    ...envLines,
    "",
  ].join("\n");
}
