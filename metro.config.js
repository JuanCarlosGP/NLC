const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");
const prevBlock = config.resolver.blockList;
const prevList = Array.isArray(prevBlock) ? prevBlock.flat() : prevBlock ? [prevBlock] : [];
const flags = prevList.find((item) => item instanceof RegExp)?.flags ?? "";
config.resolver.blockList = [...prevList, new RegExp("[\\\\/]tui[\\\\/]", flags)];

const backoffFile = path.resolve(__dirname, "node_modules/@ide/backoff/build/backoff.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@ide/backoff") {
    return { type: "sourceFile", filePath: backoffFile };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
