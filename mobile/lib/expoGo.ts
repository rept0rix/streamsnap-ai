import Constants from "expo-constants";

/** True when the JS is running inside the Expo Go client, not a native build. */
export const isExpoGo = Constants.appOwnership === "expo";
