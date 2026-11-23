// Address of the server (api/*.js). Absolute because the Android app is not served from this
// origin. VITE_API_ORIGIN points a local build at another server.
export const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? "https://korzina-peach.vercel.app";
