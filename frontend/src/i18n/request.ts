import { getRequestConfig } from "next-intl/server";
import messages from "../../messages/ar.json";

// v1 is Arabic only; French (fr.json) plugs in here later.
export const LOCALE = "ar";
export const TIME_ZONE = "Africa/Tunis";

export default getRequestConfig(async () => ({
  locale: LOCALE,
  timeZone: TIME_ZONE,
  messages,
}));
