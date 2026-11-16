const {
  withAppBuildGradle,
  withSettingsGradle,
} = require("@expo/config-plugins");

const MAPBOX_MAVEN_URL =
  "https://api.mapbox.com/downloads/v2/releases/maven";

const SETTINGS_MARKER =
  "// @generated begin SaMi Mapbox Maven configuration";

const APP_NDK_VERSION = "27.1.12297006";

function withMapboxMavenRepository(config) {
  return withSettingsGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    const newline = String.fromCharCode(10);

    if (!contents.includes(SETTINGS_MARKER)) {
      if (contents.includes("dependencyResolutionManagement {")) {
        throw new Error(
          "SaMi Mapbox: settings.gradle already declares dependencyResolutionManagement. Merge the Mapbox repository into its repositories block instead of creating a second block."
        );
      }

      const anchor = "rootProject.name =";
      const anchorIndex = contents.indexOf(anchor);

      if (anchorIndex < 0) {
        throw new Error(
          "SaMi Mapbox: Could not find rootProject.name in settings.gradle."
        );
      }

      const repositoryBlock = [
        "",
        SETTINGS_MARKER,
        "dependencyResolutionManagement {",
        "  repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)",
        "",
        "  repositories {",
        "    google()",
        "    mavenCentral()",
        '    maven { url = uri("https://www.jitpack.io") }',
        "",
        "    maven {",
        `      url = uri("${MAPBOX_MAVEN_URL}")`,
        "",
        "      authentication {",
        "        basic(BasicAuthentication)",
        "      }",
        "",
        "      credentials {",
        '        username = "mapbox"',
        '        password = providers.gradleProperty("MAPBOX_DOWNLOADS_TOKEN")',
        '          .orElse(providers.environmentVariable("MAPBOX_DOWNLOADS_TOKEN"))',
        '          .getOrElse("")',
        "      }",
        "    }",
        "  }",
        "}",
        "// @generated end SaMi Mapbox Maven configuration",
        "",
        ""
      ].join(newline);

      contents =
        contents.slice(0, anchorIndex) +
        repositoryBlock +
        contents.slice(anchorIndex);
    }

    if (
      !contents.includes(
        "import org.gradle.authentication.http.BasicAuthentication"
      )
    ) {
      contents = [
        "import org.gradle.authentication.http.BasicAuthentication",
        "",
        contents
      ].join(newline);
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

function withMapboxNdkVersion(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    const generatedNdkLine =
      "ndkVersion rootProject.ext.ndkVersion";

    if (contents.includes(generatedNdkLine)) {
      contents = contents.replace(
        generatedNdkLine,
        `ndkVersion "${APP_NDK_VERSION}"`
      );
    } else if (
      !contents.includes(`ndkVersion "${APP_NDK_VERSION}"`)
    ) {
      throw new Error(
        "SaMi Mapbox: Could not locate the generated Android ndkVersion setting."
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = function withSamiMapboxNative(config) {
  config = withMapboxMavenRepository(config);
  config = withMapboxNdkVersion(config);
  return config;
};
