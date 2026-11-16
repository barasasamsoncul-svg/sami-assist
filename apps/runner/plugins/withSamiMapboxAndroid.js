const { withProjectBuildGradle } = require("@expo/config-plugins");

const MAPBOX_MAVEN_URL =
  "https://api.mapbox.com/downloads/v2/releases/maven";

module.exports = function withSamiMapboxAndroid(config) {
  return withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // Prevent duplicate repository registration.
    if (contents.includes(MAPBOX_MAVEN_URL)) {
      return config;
    }

    const repositoriesBlock =
      /allprojects\s*\{\s*repositories\s*\{/;

    if (!repositoriesBlock.test(contents)) {
      throw new Error(
        "SaMi Mapbox: Could not locate allprojects.repositories in android/build.gradle."
      );
    }

    // Add Mapbox's authenticated Maven repository.
    contents = contents.replace(
      repositoriesBlock,
      (match) => `${match}

    maven {
      url "${MAPBOX_MAVEN_URL}"

      authentication {
        basic(BasicAuthentication)
      }

      credentials {
        username = "mapbox"
        password = providers.gradleProperty("MAPBOX_DOWNLOADS_TOKEN")
          .orElse(providers.environmentVariable("MAPBOX_DOWNLOADS_TOKEN"))
          .get()
      }
    }
`
    );

    // Required by Gradle's HTTP Basic authentication configuration.
    if (!contents.includes(
      "import org.gradle.authentication.http.BasicAuthentication"
    )) {
      contents =
        "import org.gradle.authentication.http.BasicAuthentication\n\n" +
        contents;
    }

    config.modResults.contents = contents;

    return config;
  });
};
