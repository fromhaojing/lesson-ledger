const { expo: baseConfig } = require("./app.json");

const devClientPluginName = "expo-dev-client";
const productionEnvValues = new Set(["production", "prod", "release"]);

function isProductionBuild() {
  return [
    process.env.APP_VARIANT,
    process.env.EXPO_PUBLIC_APP_VARIANT,
    process.env.EAS_BUILD_PROFILE,
    process.env.NODE_ENV,
  ].some((value) => value && productionEnvValues.has(value));
}

module.exports = () => {
  const enableDevClient = !isProductionBuild();
  const pluginsWithoutDevClient = baseConfig.plugins.filter(
    (plugin) =>
      plugin !== devClientPluginName &&
      (!Array.isArray(plugin) || plugin[0] !== devClientPluginName),
  );

  return {
    ...baseConfig,
    plugins: enableDevClient
      ? [...pluginsWithoutDevClient, devClientPluginName]
      : pluginsWithoutDevClient,
  };
};
