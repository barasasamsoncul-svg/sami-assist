const {
  withProjectBuildGradle,
  withAppBuildGradle,
  withPodfile,
} = require("@expo/config-plugins");

const MAPBOX_MAVEN_URL =
  "https://api.mapbox.com/downloads/v2/releases/maven";

const PROJECT_MARKER =
  "// @generated begin SaMi Mapbox Maven configuration";

const PODFILE_MARKER =
  "# @generated begin SaMi Mapbox iOS SPM integration";

const APP_NDK_VERSION = "27.1.12297006";

const PODFILE_INTEGRATION = [
  PODFILE_MARKER,
  "",
  "# Build the SaMi Mapbox pod as a dynamic framework so its official",
  "# Swift Package Manager dependencies link correctly on React Native 0.88.1.",
  "pre_install do |installer|",
  "  mapbox_target = installer.pod_targets.find { |pod_target| pod_target.name == 'sami-mapbox' }",
  "  raise 'SaMi Mapbox pod target was not found during CocoaPods pre_install.' unless mapbox_target",
  "  mapbox_target.instance_variable_set(:@build_type, Pod::BuildType.dynamic_framework)",
  "end",
  "",
  "# React Native 0.88.1 links SPM products to the pod target but does not",
  "# embed transitive dynamic XCFrameworks. Embed the Mapbox runtime frameworks",
  "# into the app after CocoaPods has integrated the user Xcode project.",
  "post_integrate do |installer|",
  "  installer.aggregate_targets.each do |aggregate_target|",
  "    project = aggregate_target.user_project",
  "    next unless project",
  "",
  "    aggregate_target.user_targets.each do |target|",
  "      next unless target.product_type == 'com.apple.product-type.application'",
  "",
  "      phase_name = '[SaMi] Embed Mapbox SPM Frameworks'",
  "      phase = target.shell_script_build_phases.find { |item| item.name == phase_name }",
  "      phase ||= target.new_shell_script_build_phase(phase_name)",
  "      phase.shell_script = <<~'SA_MI_MAPBOX_EMBED'",
  '        set -eo pipefail',
  '        FRAMEWORKS_DIR="$TARGET_BUILD_DIR/$FRAMEWORKS_FOLDER_PATH"',
  '        mkdir -p "$FRAMEWORKS_DIR"',
  "",
  "        embed_mapbox_framework() {",
  '          FRAMEWORK_NAME="$1"',
  '          REQUIRED="$2"',
  '          SOURCE=""',
  "",
  '          for ROOT in "$BUILT_PRODUCTS_DIR/PackageFrameworks" "$OBJROOT/UninstalledProducts/$PLATFORM_NAME"; do',
  '            CANDIDATE="$ROOT/$FRAMEWORK_NAME.framework"',
  '            if [ -d "$CANDIDATE" ]; then',
  '              SOURCE="$CANDIDATE"',
  "              break",
  "            fi",
  "          done",
  "",
  '          if [ -z "$SOURCE" ]; then',
  '            SOURCE="$(find "$BUILT_PRODUCTS_DIR" "$OBJROOT/UninstalledProducts/$PLATFORM_NAME" -type d -name "$FRAMEWORK_NAME.framework" -print -quit 2>/dev/null || true)"',
  "          fi",
  "",
  '          if [ -z "$SOURCE" ]; then',
  '            if [ "$REQUIRED" = "required" ]; then',
  '              echo "error: required Mapbox runtime framework not found: $FRAMEWORK_NAME.framework" >&2',
  "              exit 1",
  "            fi",
  "            return 0",
  "          fi",
  "",
  '          BINARY="$SOURCE/$FRAMEWORK_NAME"',
  '          if [ ! -f "$BINARY" ]; then',
  '            if [ "$REQUIRED" = "required" ]; then',
  '              echo "error: Mapbox framework binary is missing: $BINARY" >&2',
  "              exit 1",
  "            fi",
  "            return 0",
  "          fi",
  "",
  '          if ! /usr/bin/file "$BINARY" | /usr/bin/grep -q "dynamically linked shared library"; then',
  "            return 0",
  "          fi",
  "",
  '          DESTINATION="$FRAMEWORKS_DIR/$FRAMEWORK_NAME.framework"',
  '          rm -rf "$DESTINATION"',
  '          /usr/bin/ditto "$SOURCE" "$DESTINATION"',
  "",
  '          if [ -n "$EXPANDED_CODE_SIGN_IDENTITY" ] && [ "$CODE_SIGNING_ALLOWED" = "YES" ]; then',
  '            /usr/bin/codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" --preserve-metadata=identifier,entitlements "$DESTINATION"',
  "          fi",
  "        }",
  "",
  "        embed_mapbox_framework MapboxCommon required",
  "        embed_mapbox_framework MapboxCoreMaps required",
  "        embed_mapbox_framework MapboxNavigationNative required",
  "        embed_mapbox_framework MapboxMaps optional",
  "        embed_mapbox_framework MapboxNavigationCore optional",
  "        embed_mapbox_framework MapboxDirections optional",
  "        embed_mapbox_framework Turf optional",
  "      SA_MI_MAPBOX_EMBED",
  "    end",
  "",
  "    project.save",
  "  end",
  "end",
  "",
  "# @generated end SaMi Mapbox iOS SPM integration",
  "",
].join(String.fromCharCode(10));

/* -------------------------------------------------------------------------- */
/* MAPBOX ANDROID MAVEN REPOSITORY                                            */
/* -------------------------------------------------------------------------- */

function withMapboxMavenRepository(config) {
  return withProjectBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    const newline = String.fromCharCode(10);

    if (!contents.includes(PROJECT_MARKER)) {
      const allProjectsIndex = contents.indexOf("allprojects {");

      if (allProjectsIndex < 0) {
        throw new Error(
          "SaMi Mapbox: Could not find allprojects block in root build.gradle."
        );
      }

      const repositoriesIndex = contents.indexOf(
        "repositories {",
        allProjectsIndex
      );

      if (repositoriesIndex < 0) {
        throw new Error(
          "SaMi Mapbox: Could not find allprojects repositories block."
        );
      }

      const insertionIndex =
        repositoriesIndex + "repositories {".length;

      const repositoryBlock = [
        "",
        "      " + PROJECT_MARKER,
        "      maven {",
        '        url "' + MAPBOX_MAVEN_URL + '"',
        "",
        "        authentication {",
        "          basic(BasicAuthentication)",
        "        }",
        "",
        "        credentials {",
        '          username = "mapbox"',
        '          password = providers.gradleProperty("MAPBOX_DOWNLOADS_TOKEN")',
        '            .orElse(providers.environmentVariable("MAPBOX_DOWNLOADS_TOKEN"))',
        '            .getOrElse("")',
        "        }",
        "      }",
        "      // @generated end SaMi Mapbox Maven configuration",
        "",
      ].join(newline);

      contents =
        contents.slice(0, insertionIndex) +
        repositoryBlock +
        contents.slice(insertionIndex);
    }

    if (
      !contents.includes(
        "import org.gradle.authentication.http.BasicAuthentication"
      )
    ) {
      contents = [
        "import org.gradle.authentication.http.BasicAuthentication",
        "",
        contents,
      ].join(newline);
    }

    mod.modResults.contents = contents;

    return mod;
  });
}

/* -------------------------------------------------------------------------- */
/* ANDROID NDK                                                                */
/* -------------------------------------------------------------------------- */

function withMapboxNdkVersion(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    const generatedNdkLine =
      "ndkVersion rootProject.ext.ndkVersion";

    if (contents.includes(generatedNdkLine)) {
      contents = contents.replace(
        generatedNdkLine,
        'ndkVersion "' + APP_NDK_VERSION + '"'
      );
    } else if (
      !contents.includes('ndkVersion "' + APP_NDK_VERSION + '"')
    ) {
      throw new Error(
        "SaMi Mapbox: Could not locate the generated Android ndkVersion setting."
      );
    }

    mod.modResults.contents = contents;

    return mod;
  });
}

/* -------------------------------------------------------------------------- */
/* IOS PODFILE                                                                */
/* -------------------------------------------------------------------------- */

function withMapboxPodfile(config) {
  return withPodfile(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes(PODFILE_MARKER)) {
      contents =
        contents.trimEnd() +
        String.fromCharCode(10, 10) +
        PODFILE_INTEGRATION;
    }

    mod.modResults.contents = contents;

    return mod;
  });
}

/* -------------------------------------------------------------------------- */
/* CONFIG PLUGIN                                                              */
/* -------------------------------------------------------------------------- */

module.exports = function withSamiMapboxNative(config) {
  config = withMapboxMavenRepository(config);
  config = withMapboxNdkVersion(config);
  config = withMapboxPodfile(config);

  return config;
};