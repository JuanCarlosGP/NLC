import { desktopCss } from "./desktop-css";
import { APPEARANCE_KEY, appearanceVariables } from "./themes";
const declarations = (id: "classic" | "geist-pixel") => Object.entries(appearanceVariables(id)).map(([key, value]) => `${key}:${value}`).join(";");
export const appearanceCss = `
:root { ${declarations("classic")}; color-scheme:dark; --nlc-page-max:100%; --nlc-media-cell:33.333%; --nlc-shortcut-basis:47%; --nlc-shortcut-max:49%; }
html[data-nlc-theme="geist-pixel"] { ${declarations("geist-pixel")}; --nlc-page-max:1120px; }
html, body, #root { background:var(--nlc-color-void); }
body { margin:0; }
html[data-nlc-theme="geist-pixel"] { font-synthesis:none; }
html[data-nlc-theme="geist-pixel"] :where(div,button,input,textarea,select,label,img) {
  border-radius:0 !important; box-shadow:none !important;
  backdrop-filter:none !important; -webkit-backdrop-filter:none !important;
}
html[data-nlc-theme="geist-pixel"] :where([dir="auto"],input,textarea,select) {
  font-weight:400 !important; letter-spacing:0 !important;
}
.nlc-appearance-select:focus-visible { outline:1px solid var(--nlc-color-accent); outline-offset:4px; }
html[data-nlc-theme="geist-pixel"] :where([role="button"],input,textarea,select):focus-visible {
  outline:1px solid var(--nlc-color-accent) !important; outline-offset:3px;
}

/* Explicit layout roles keep density changes away from image/graph geometry. */
html[data-nlc-theme="geist-pixel"] [data-nlc-ui="sheet"] { height:auto !important; max-width:680px; align-self:center; }
html[data-nlc-theme="geist-pixel"] [data-nlc-ui="health-actions"] {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr)); gap:8px;
}
html[data-nlc-theme="geist-pixel"] [data-nlc-ui="stats"] {
  display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px;
}
html[data-nlc-theme="geist-pixel"] [data-nlc-ui="record-cards"] {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr)); gap:8px;
}
html[data-nlc-theme="geist-pixel"] [data-nlc-ui="backup-counts"] {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); column-gap:24px !important; row-gap:6px;
}
html[data-nlc-theme="geist-pixel"] [data-nlc-ui="photo-frame"] {
  width:min(100%,315px) !important; align-self:center;
}
html[data-nlc-theme="geist-pixel"] :where(input:not([type="radio"]):not([type="checkbox"])) { min-height:44px; }
html[data-nlc-theme="geist-pixel"] :where(textarea) { min-height:96px; }
@media (min-width:760px) {
  html[data-nlc-theme="geist-pixel"] [data-nlc-ui="stats"] { grid-template-columns:repeat(4,minmax(0,1fr)); }
  html[data-nlc-theme="geist-pixel"] {
    --nlc-shortcut-basis:calc(25% - 6px); --nlc-shortcut-max:none; --nlc-media-cell:25%;
  }
}
@media (min-width:1100px) {
  html[data-nlc-theme="geist-pixel"] { --nlc-media-cell:16.6667%; }
}
${desktopCss}
`;
export const appearanceBootstrap = `try{document.documentElement.dataset.nlcTheme=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})==="geist-pixel"?"geist-pixel":"classic"}catch(e){}`;
