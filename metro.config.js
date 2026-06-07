const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest(context, moduleName, platform) {
    if (moduleName === "tslib") {
      return {
        type: "sourceFile",
        filePath: require.resolve("tslib/tslib.es6.js")
      };
    }

    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }

    return context.resolveRequest(context, moduleName, platform);
  }
};

module.exports = config;
