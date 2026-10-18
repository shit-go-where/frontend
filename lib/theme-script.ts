// Shared by the server layout (inline script) and the client theme hook.
export const THEME_KEY = "sgw:theme";

/**
 * Inline in <head> to apply the stored choice before first paint. Dark is the
 * default, so only "light" and "system" (match device) need an attribute.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="system")document.documentElement.dataset.theme=t}catch(e){}`;
