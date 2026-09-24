/** Shared by the server layout and the client theme toggle. */

export const THEME_KEY = "drip:theme";

/** Page background per theme, used for the browser and status bar colour. */
export const THEME_COLORS = { light: "#EEF2F0", dark: "#0D1412" } as const;

/**
 * Runs in <head> before the first paint so a saved theme never flashes the
 * wrong colours. Keep it tiny and dependency-free.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
