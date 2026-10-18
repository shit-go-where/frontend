// Shared by the server layout (inline script) and the client theme hook.
export const THEME_KEY = "sgw:theme";

/** The page ground (--bg) per theme, for the browser bar. Mirror any change to --bg here. */
export const THEME_BAR_COLOR = { dark: "#1e120b", light: "#f2d3b1" } as const;

/**
 * Inline in <head> to apply the stored choice before first paint. Dark is the
 * default, so only "light" and "system" (match device) need data-theme. The
 * script also keeps data-scheme (the resolved theme the CSS reads) and the
 * theme-color meta in step with data-theme and the device setting, so
 * setThemePref only has to change data-theme.
 */
export const THEME_BOOT_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="system")d.dataset.theme=t}catch(e){}
try{(function(){var d=document.documentElement,q=matchMedia("(prefers-color-scheme: light)"),m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m);
function s(){var a=d.dataset.theme,l=a==="light"||(a==="system"&&q.matches);d.dataset.scheme=l?"light":"dark";m.content=l?"${THEME_BAR_COLOR.light}":"${THEME_BAR_COLOR.dark}"}
s();q.addEventListener("change",s);new MutationObserver(s).observe(d,{attributes:true,attributeFilter:["data-theme"]})})()}catch(e){}`;
