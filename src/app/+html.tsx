import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";
import { appearanceBootstrap, appearanceCss } from "@/lib/appearance/css";
export default function Html({ children }: PropsWithChildren) {
  return <html lang="es"><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <meta name="color-scheme" content="dark" />
    <ScrollViewStyleReset />
    <style id="nlc-appearance" dangerouslySetInnerHTML={{ __html: appearanceCss }} />
    <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
  </head><body>{children}</body></html>;
}
