import { AppRegistry, Platform } from "react-native";
import { handleWebTask } from "./headless";
import { enableLocalBackend } from "./native";
if (Platform.OS === "android") { enableLocalBackend(); AppRegistry.registerHeadlessTask("NlcPhoneBackend", () => handleWebTask); }
