const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");
const prevBlock = config.resolver.blockList;
const prevList = Array.isArray(prevBlock) ? prevBlock.flat() : prevBlock ? [prevBlock] : [];
const flags = prevList.find((item) => item instanceof RegExp)?.flags ?? "";
config.resolver.blockList = [...prevList, new RegExp("[\\\\/]tui[\\\\/]", flags),
  // Private integration configuration and server modules never enter Expo bundles.
  /[/\\]\.env\.integrations\.[^/\\]+$/, /[/\\]\.secrets[/\\]/, /[/\\]scripts[/\\]integrations[/\\]/];

const backoffFile = path.resolve(__dirname, "node_modules/@ide/backoff/build/backoff.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@ide/backoff") {
    return { type: "sourceFile", filePath: backoffFile };
  }
  return context.resolveRequest(context, moduleName, platform);
};

const previousMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const enhanced = previousMiddleware ? previousMiddleware(middleware, server) : middleware;
  return (req, res, next) => {
    // expo-sqlite's worker needs SharedArrayBuffer on localhost.
    if (process.env.EXPO_PUBLIC_NLC_DEMO === "1") {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    }
    return enhanced(req, res, next);
  };
};

module.exports = config;
