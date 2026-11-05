/** A separate Expo web export; never inherited by the native build. */
export const remoteEnabled = process.env.EXPO_PUBLIC_NLC_WEB_REMOTE === "1";
export const PHONE_ONLY = "Se configura en el móvil";
export const PROTOCOL = 1;
export const phoneOnly = () => { throw new Error(PHONE_ONLY); };
