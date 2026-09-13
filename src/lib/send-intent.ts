import { projectHostSession, type HostSessionState } from "./host-session-fsm";
import { t, type Locale } from "./i18n";
import { QUEUE_MAX } from "./prompt-queue";

export type SendIntentKind =
  | "send_now"
  | "steer"
  | "enqueue"
  | "blocked_permission"
  | "blocked_empty"
  | "blocked_queue_full";

export type SendIntentBannerKey = "composer.hintQueue" | "composer.hintSteer" | "toast.queueFull";

export type SendIntent = {
  kind: SendIntentKind;
  enqueue: boolean;
  bannerKey?: SendIntentBannerKey;
};

export function resolveSendIntent(opts: {
  host: HostSessionState;
  hasBody: boolean;
  steerByDefault: boolean;
  queueLength: number;
}): SendIntent {
  if (!opts.hasBody) return { kind: "blocked_empty", enqueue: false };
  if (opts.host === "awaiting_permission") return { kind: "blocked_permission", enqueue: false };
  if (opts.host === "streaming") {
    if (opts.steerByDefault) {
      return { kind: "steer", enqueue: false, bannerKey: "composer.hintSteer" };
    }
    if (opts.queueLength >= QUEUE_MAX) {
      return { kind: "blocked_queue_full", enqueue: false, bannerKey: "toast.queueFull" };
    }
    return { kind: "enqueue", enqueue: true, bannerKey: "composer.hintQueue" };
  }
  return { kind: "send_now", enqueue: false };
}

export function sendIntentBusyHint(
  opts: Parameters<typeof resolveSendIntent>[0] & { locale: Locale },
): string | undefined {
  const key = resolveSendIntent(opts).bannerKey;
  return key ? t(opts.locale, key) : undefined;
}

export function composerSendIntentHint(opts: {
  connecting: boolean;
  ready: boolean;
  busy: boolean;
  pendingPermission: boolean;
  hasBody: boolean;
  steerByDefault: boolean;
  queueLength: number;
  locale: Locale;
}): string | undefined {
  return sendIntentBusyHint({
    host: projectHostSession({
      connecting: opts.busy ? false : opts.connecting,
      ready: opts.busy ? true : opts.ready,
      busy: opts.busy,
      pendingPermission: opts.pendingPermission,
      disconnected: false,
    }),
    hasBody: opts.hasBody || opts.busy,
    steerByDefault: opts.steerByDefault,
    queueLength: opts.queueLength,
    locale: opts.locale,
  });
}
