import { remoteEnabled } from "@/lib/backend/profile";
import { RemoteBackupScreen } from "./remote-backup-screen";
import { ServiceBackupScreen as Local } from "./service-backup-screen.shared";
export const ServiceBackupScreen = remoteEnabled ? RemoteBackupScreen : Local;
