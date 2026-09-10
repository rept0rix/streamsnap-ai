import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

/** True when the JS is running inside the Expo Go client, not a native build. */
export const isExpoGo = isRunningInExpoGo();

/** True in Expo Go or in a browser — no custom native modules there. */
export const isExpoGoOrWeb = isExpoGo || Platform.OS === "web";
