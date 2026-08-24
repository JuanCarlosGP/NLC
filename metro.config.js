const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");

const backoffFile = path.resolve(__dirname, "node_modules/@ide/backoff/build/backoff.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@ide/backoff") {
    return { type: "sourceFile", filePath: backoffFile };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
