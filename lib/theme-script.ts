// Shared by the server layout (inline script) and the client theme hook.
export const THEME_KEY = "sgw:theme";

/** The page ground (--bg) per theme, for the browser bar. Mirror any change to --bg here. */
export const THEME_BAR_COLOR = { dark: "#1e120b", light: "#f2d3b1" } as const;

/**
 * Inline in <head> to apply the stored choice before first paint. Following the
 * device ("system") is the default, so nothing stored means "system"; only an
 * explicit "light" or "dark" is kept. data-theme always holds the pick. The
 * script also keeps data-scheme (the resolved theme the CSS reads) and the
 * theme-color meta in step with data-theme and the device setting, so
 * setThemePref only has to change data-theme. Without JS (or storage) the CSS
 * stays on its dark defaults.
 */
export const THEME_BOOT_SCRIPT = `try{var d=document.documentElement,t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}d.dataset.theme=t==="light"||t==="dark"?t:"system"}catch(e){}
try{(function(){var d=document.documentElement,q=matchMedia("(prefers-color-scheme: light)"),m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m);
function s(){var a=d.dataset.theme,l=a==="light"||(a!=="dark"&&q.matches);d.dataset.scheme=l?"light":"dark";m.content=l?"${THEME_BAR_COLOR.light}":"${THEME_BAR_COLOR.dark}"}
s();q.addEventListener("change",s);new MutationObserver(s).observe(d,{attributes:true,attributeFilter:["data-theme"]})})()}catch(e){}`;
