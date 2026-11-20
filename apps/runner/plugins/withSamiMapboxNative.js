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

const ANDROID_SIGNING_MARKER =
  "// @generated begin SaMi EAS-compatible Android signing";

const AUTO_VALUE_MARKER =
  "// @generated begin SaMi Mapbox AutoValue annotations dependency";
const AUTO_VALUE_DEPENDENCY =
  'implementation "com.google.auto.value:auto-value-annotations:1.11.1"';

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
/* ANDROID NDK AND EAS-COMPATIBLE LOCAL SIGNING                               */
/* -------------------------------------------------------------------------- */

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addEasCompatibleReleaseSigning(contents, newline) {
  if (!contents.includes("android {")) {
    throw new Error(
      "SaMi Runner signing: Could not find the generated android block in app/build.gradle."
    );
  }

  const buildTypesMatch = contents.match(/^([ \t]*)buildTypes[ \t]*\{[ \t]*$/m);

  if (!buildTypesMatch) {
    throw new Error(
      "SaMi Runner signing: Could not find the Android buildTypes block."
    );
  }

  const buildTypesIndent = buildTypesMatch[1];
  const signingBlockIndent = buildTypesIndent;
  const innerIndent = signingBlockIndent + "    ";
  const nestedIndent = innerIndent + "    ";

  if (!contents.includes(ANDROID_SIGNING_MARKER)) {
    const signingBlock = [
      `${signingBlockIndent}${ANDROID_SIGNING_MARKER}`,
      `${signingBlockIndent}signingConfigs {`,
      `${innerIndent}samiEas {`,
      `${nestedIndent}def samiCredentialsFile = new File(rootProject.projectDir.parentFile, "credentials.json")`,
      `${nestedIndent}if (!samiCredentialsFile.isFile()) {`,
      `${nestedIndent}    throw new GradleException("SaMi Runner: credentials.json is missing. Restore the original EAS Android credentials before building a release APK.")`,
      `${nestedIndent}}`,
      `${nestedIndent}def samiCredentials = new groovy.json.JsonSlurper().parse(samiCredentialsFile)`,
      `${nestedIndent}def samiKeystore = samiCredentials?.android?.keystore`,
      `${nestedIndent}if (samiKeystore == null || !samiKeystore.keystorePath || !samiKeystore.keystorePassword || !samiKeystore.keyAlias || !samiKeystore.keyPassword) {`,
      `${nestedIndent}    throw new GradleException("SaMi Runner: credentials.json does not contain a complete Android keystore configuration.")`,
      `${nestedIndent}}`,
      `${nestedIndent}def samiKeystoreFile = new File(samiKeystore.keystorePath.toString())`,
      `${nestedIndent}if (!samiKeystoreFile.isAbsolute()) {`,
      `${nestedIndent}    samiKeystoreFile = new File(rootProject.projectDir.parentFile, samiKeystore.keystorePath.toString())`,
      `${nestedIndent}}`,
      `${nestedIndent}if (!samiKeystoreFile.isFile()) {`,
      `${nestedIndent}    throw new GradleException("SaMi Runner: the Android keystore referenced by credentials.json was not found: " + samiKeystoreFile.absolutePath)`,
      `${nestedIndent}}`,
      `${nestedIndent}storeFile samiKeystoreFile`,
      `${nestedIndent}storePassword samiKeystore.keystorePassword.toString()`,
      `${nestedIndent}keyAlias samiKeystore.keyAlias.toString()`,
      `${nestedIndent}keyPassword samiKeystore.keyPassword.toString()`,
      `${innerIndent}}`,
      `${signingBlockIndent}}`,
      `${signingBlockIndent}// @generated end SaMi EAS-compatible Android signing`,
      "",
    ].join(newline);

    contents =
      contents.slice(0, buildTypesMatch.index) +
      signingBlock +
      contents.slice(buildTypesMatch.index);
  }

  const updatedBuildTypesMatch = contents.match(/^([ \t]*)buildTypes[ \t]*\{[ \t]*$/m);
  const afterBuildTypesIndex = updatedBuildTypesMatch.index + updatedBuildTypesMatch[0].length;
  const remainingContents = contents.slice(afterBuildTypesIndex);
  const releaseMatch = remainingContents.match(/^([ \t]*)release[ \t]*\{[ \t]*$/m);

  if (!releaseMatch) {
    throw new Error(
      "SaMi Runner signing: Could not find the release build type inside buildTypes."
    );
  }

  const releaseIndent = releaseMatch[1];
  const releaseOpeningIndex = afterBuildTypesIndex + releaseMatch.index;
  const releaseBodyStart = releaseOpeningIndex + releaseMatch[0].length;
  const releaseClosingLine = new RegExp(
    `^${escapeRegExp(releaseIndent)}\\}[\\t ]*$`,
    "m"
  );
  const afterReleaseOpening = contents.slice(releaseBodyStart);
  const releaseCloseMatch = afterReleaseOpening.match(releaseClosingLine);

  if (!releaseCloseMatch) {
    throw new Error(
      "SaMi Runner signing: Could not locate the closing brace for the release build type."
    );
  }

  const releaseBodyEnd = releaseBodyStart + releaseCloseMatch.index;
  let releaseBody = contents.slice(releaseBodyStart, releaseBodyEnd);

  // Remove any previous debug or custom signing assignment in release. The
  // SaMi EAS-compatible assignment below must be the final signing selection.
  releaseBody = releaseBody.replace(
    /^[ \t]*signingConfig[ \t]+signingConfigs\.[A-Za-z0-9_]+[ \t]*\r?\n/gm,
    ""
  );

  const signingAssignment =
    `${releaseIndent}    signingConfig signingConfigs.samiEas${newline}`;

  releaseBody = releaseBody.replace(/[\r\n]*$/, newline) + signingAssignment;

  contents =
    contents.slice(0, releaseBodyStart) +
    releaseBody +
    contents.slice(releaseBodyEnd);

  return contents;
}

function addMapboxAutoValueAnnotations(contents, newline) {
  if (contents.includes(AUTO_VALUE_DEPENDENCY)) {
    return contents;
  }

  const dependencyBlockMatch = contents.match(
    /^([ \t]*)dependencies[ \t]*\{[ \t]*$/m
  );

  if (!dependencyBlockMatch) {
    throw new Error(
      "SaMi Mapbox: Could not find the generated app dependencies block to add the AutoValue annotations required by Mapbox Directions models."
    );
  }

  const indent = dependencyBlockMatch[1];
  const innerIndent = indent + "    ";
  const dependencyLines = [
    `${innerIndent}${AUTO_VALUE_MARKER}`,
    `${innerIndent}${AUTO_VALUE_DEPENDENCY}`,
    `${innerIndent}// @generated end SaMi Mapbox AutoValue annotations dependency`,
  ].join(newline);

  const insertionIndex =
    dependencyBlockMatch.index + dependencyBlockMatch[0].length;

  return (
    contents.slice(0, insertionIndex) +
    newline +
    dependencyLines +
    contents.slice(insertionIndex)
  );
}

function withMapboxNdkAndEasSigning(config) {
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

    const newline = String.fromCharCode(10);

    contents = addEasCompatibleReleaseSigning(contents, newline);
    contents = addMapboxAutoValueAnnotations(contents, newline);

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
  config = withMapboxNdkAndEasSigning(config);
  config = withMapboxPodfile(config);

  return config;
};
