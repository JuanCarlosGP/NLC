import { installWebPackage } from "./web-package";
import { webNative } from "./native-module";
export async function startWebHost() { const bundle = await installWebPackage(); const native = webNative(); if (native.webInterfaceState().running && native.webInterfaceState().bundleId !== bundle.bundleId) await native.stopWebInterface(); await native.startWebInterface(bundle.directory, bundle.bundleId); }
export async function stopWebHost() { await webNative().stopWebInterface(); }
