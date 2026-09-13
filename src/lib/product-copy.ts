import { onBridgeLocaleChange, tr } from "./i18n-bridge";

export const APP_VERSION = "0.6.3";

/**
 * A module-level export cannot call tr() at read time, so keep a live `let`
 * binding refreshed whenever the bridge locale flips.
 */
export let UPDATE_INSTALLATION_COPY = tr("about.updateCopy");

onBridgeLocaleChange(() => {
  UPDATE_INSTALLATION_COPY = tr("about.updateCopy");
});
