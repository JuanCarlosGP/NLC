const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!--
      Android no admite rangos CIDR en <domain>.
      NLC es un reproductor personal contra un NAS en LAN (HTTP en claro).
      Se permite cleartext a nivel de app; el dominio del NAS queda explícito.
    -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
        <domain includeSubdomains="true">192.168.1.106</domain>
    </domain-config>
</network-security-config>
`;

function withLanCleartext(config) {
  config = withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "network_security_config.xml"), NETWORK_SECURITY_CONFIG);
      return modConfig;
    },
  ]);

  config = withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.$["android:usesCleartextTraffic"] = "true";
    application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return modConfig;
  });

  return config;
}

module.exports = withLanCleartext;
