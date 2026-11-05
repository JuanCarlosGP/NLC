import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
if(!existsSync(new URL("../assets/generated/phone-web.zip",import.meta.url))) {
 const result=spawnSync(process.execPath,[new URL("./build-phone-web.mjs",import.meta.url).pathname],{stdio:"inherit"});process.exit(result.status??1);
}
