import { remoteEnabled } from "@/lib/backend/profile";
import { mediaUrl } from "@/lib/backend/remote";
import { md5Hex } from "@/lib/crypto/md5";
export function coverUri(uri?: string | null) { return remoteEnabled && uri && /^(file:|content:)/.test(uri) ? mediaUrl("artwork",md5Hex(uri)) : uri; }
