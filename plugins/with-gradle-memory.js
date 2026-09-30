/**
 * The release KSP worker runs out of metaspace on GitHub-hosted runners
 * and then the Gradle daemon never exits. Give it room and do not keep a daemon.
 */
const { withGradleProperties } = require("expo/config-plugins");

function upsert(items, key, value) {
  const row = items.find((item) => item.type === "property" && item.key === key);
  if (row) row.value = value;
  else items.push({ type: "property", key, value });
}

function withGradleMemory(config) {
  return withGradleProperties(config, (mod) => {
    upsert(mod.modResults, "org.gradle.jvmargs", "-Xmx2048m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8");
    upsert(mod.modResults, "kotlin.daemon.jvmargs", "-Xmx2048m -XX:MaxMetaspaceSize=1024m");
    upsert(mod.modResults, "org.gradle.daemon", "false");
    return mod;
  });
}

module.exports = withGradleMemory;
