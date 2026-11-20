$ErrorActionPreference = "Stop"

$runnerRoot = Join-Path (Get-Location).Path "apps\runner"
if (-not (Test-Path $runnerRoot)) {
    throw "Run this script from the SaMi repository root. Could not find apps\runner."
}

$indexPath = Join-Path $runnerRoot "app\(app)\index.tsx"
$kotlinPath = Join-Path $runnerRoot "modules\sami-mapbox\android\src\main\java\com\sami\runner\mapbox\SaMiMapboxModule.kt"
$swiftPath = Join-Path $runnerRoot "modules\sami-mapbox\ios\SaMiMapboxModule.swift"
$chromePath = Join-Path $runnerRoot "src\components\RunnerDashboardChrome.tsx"
$sectionPath = Join-Path $runnerRoot "app\(app)\runner-section.tsx"

foreach ($path in @($indexPath, $kotlinPath, $swiftPath, $chromePath, $sectionPath)) {
    if (-not (Test-Path $path)) { throw "Required file is missing: $path" }
}

function Read-Normalized([string]$Path) {
    return [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
}

function Write-Normalized([string]$Path, [string]$Content) {
    $windowsContent = $Content.Replace("`n", "`r`n")
    [System.IO.File]::WriteAllText(
        $Path,
        $windowsContent,
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Replace-Once([string]$Content, [string]$Old, [string]$New, [string]$Description) {
    $count = ([regex]::Matches($Content, [regex]::Escape($Old))).Count
    if ($count -ne 1) {
        throw "Expected exactly one match for '$Description'; found $count. No files have been written."
    }
    return $Content.Replace($Old, $New)
}

function Replace-Between([string]$Content, [string]$StartMarker, [string]$EndMarker, [string]$Replacement, [string]$Description) {
    $start = $Content.IndexOf($StartMarker, [System.StringComparison]::Ordinal)
    if ($start -lt 0) { throw "Could not find start marker for $Description. No files have been written." }
    $end = $Content.IndexOf($EndMarker, $start + $StartMarker.Length, [System.StringComparison]::Ordinal)
    if ($end -lt 0) { throw "Could not find end marker for $Description. No files have been written." }
    return $Content.Substring(0, $start) + $Replacement + $Content.Substring($end)
}

# Read every target first. All transformations are kept in memory until all checks pass.
$index = Read-Normalized $indexPath
$kotlin = Read-Normalized $kotlinPath
$swift = Read-Normalized $swiftPath

# -----------------------------------------------------------------------------
# Dashboard screen: preserve all existing account, errand and navigation logic.
# Replace only the old visual chrome and keep the old workspace hidden rather
# than deleting its handlers. This keeps existing job/navigation behaviour
# available while the new dashboard UI is introduced.
# -----------------------------------------------------------------------------
$newThemeImport = 'import { useRunnerTheme } from "@/theme";' + "`n" + 'import { SaMiRunnerDashboardChrome } from "@/components/RunnerDashboardChrome";'
$index = Replace-Once $index 'import { useRunnerTheme } from "@/theme";' $newThemeImport "Runner dashboard chrome import"
$index = Replace-Once $index 'const { colors, mode } = useRunnerTheme();' 'const { colors } = useRunnerTheme();' "remove unused appearance mode"

$oldStyleConstants = @'
const MAPBOX_DAY_STYLE =
  "mapbox://styles/mapbox/navigation-day-v1";

const MAPBOX_NIGHT_STYLE =
  "mapbox://styles/mapbox/navigation-night-v1";
'@
$oldStyleConstants = $oldStyleConstants.TrimEnd()
$newStyleConstants = 'const MAPBOX_STANDARD_STYLE = "mapbox://styles/mapbox/standard";'
$index = Replace-Once $index $oldStyleConstants $newStyleConstants "Mapbox style constants"

$oldStyleSelection = @'
  const mapStyleURL =
    mode === "dark"
      ? MAPBOX_NIGHT_STYLE
      : MAPBOX_DAY_STYLE;
'@
$oldStyleSelection = $oldStyleSelection.TrimEnd()
$index = Replace-Once $index $oldStyleSelection '  const mapStyleURL = MAPBOX_STANDARD_STYLE;' "Mapbox style selection"

$index = Replace-Once $index '<StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />' `
    '<StatusBar barStyle="light-content" />' "dark navy status bar"

# Reverse-geocode the live GPS position so the right-hand location chip reflects
# the Runner's current locality rather than only the saved service area.
$locationState = '  const [location, setLocation] = useState<MapLocation | null>(null);'
$locationStateReplacement = @'
  const [location, setLocation] = useState<MapLocation | null>(null);
  const [currentLocationName, setCurrentLocationName] = useState("");
  const lastReverseGeocodeAtRef = useRef(0);
  const reverseGeocodeInFlightRef = useRef(false);
'@
$locationStateReplacement = $locationStateReplacement.TrimEnd()
$index = Replace-Once $index $locationState $locationStateReplacement "live locality state"

$locationCallbackAnchor = '  const requestCurrentLocation = useCallback(async () => {'
$locationCallback = @'
  const updateCurrentLocationName = useCallback(async (coordinates: Coordinates) => {
    const now = Date.now();
    if (
      reverseGeocodeInFlightRef.current ||
      now - lastReverseGeocodeAtRef.current < 60000
    ) {
      return;
    }

    lastReverseGeocodeAtRef.current = now;
    reverseGeocodeInFlightRef.current = true;

    try {
      const results = await Location.reverseGeocodeAsync(coordinates);
      const address = results[0];
      const locality = [
        address?.district,
        address?.subregion,
        address?.city,
        address?.name,
      ].find((value) => typeof value === "string" && value.trim().length > 0);

      if (locality && mountedRef.current) {
        setCurrentLocationName(locality.trim());
      }
    } catch {
      // Keep the saved service area as a fallback if reverse geocoding fails.
    } finally {
      reverseGeocodeInFlightRef.current = false;
    }
  }, []);

'@
$locationCallback = $locationCallback.TrimEnd() + "`n`n" + $locationCallbackAnchor
$index = Replace-Once $index $locationCallbackAnchor $locationCallback "live locality reverse geocoder"

# The same camera-follow call also exists in the map's locate button. Match the
# surrounding GPS-result block so only the fresh-fix path receives reverse geocoding.
$cameraFollowBlock = @'
      setCameraFollowing(true);
    }

    return {
      coords,
      position,
    };
  }, []);
'@
$cameraFollowBlock = $cameraFollowBlock.TrimEnd()
$cameraFollowReplacement = @'
      setCameraFollowing(true);
      void updateCurrentLocationName(coords);
    }

    return {
      coords,
      position,
    };
  }, []);
'@
$cameraFollowReplacement = $cameraFollowReplacement.TrimEnd()
$index = Replace-Once $index $cameraFollowBlock $cameraFollowReplacement "reverse geocode after fresh GPS fix"

$requestStart = $index.IndexOf('  const requestCurrentLocation = useCallback(async () => {')
$requestEnd = $index.IndexOf('  }, []);', $requestStart)
if ($requestStart -lt 0 -or $requestEnd -lt 0) { throw "Could not locate requestCurrentLocation dependencies. No files have been written." }
$oldDependencyClause = '  }, []);'
$newDependencyClause = '  }, [updateCurrentLocationName]);'
$index = $index.Substring(0, $requestEnd) + $newDependencyClause + $index.Substring($requestEnd + $oldDependencyClause.Length)

$locationSetBlock = @'
      if (mountedRef.current) {
        setLocation(nextLocation);
      }
'@
$locationSetBlock = $locationSetBlock.TrimEnd()
$locationSetReplacement = @'
      if (mountedRef.current) {
        setLocation(nextLocation);
      }
      void updateCurrentLocationName({
        latitude: next.latitude,
        longitude: next.longitude,
      });
'@
$locationSetReplacement = $locationSetReplacement.TrimEnd()
$index = Replace-Once $index $locationSetBlock $locationSetReplacement "reverse geocode Mapbox location updates"

$handleDeps = @'
      activeJobIsTrackable,
      signingOut,
    ],
  );
'@
$handleDeps = $handleDeps.TrimEnd()
$handleDepsReplacement = @'
      activeJobIsTrackable,
      signingOut,
      updateCurrentLocationName,
    ],
  );
'@
$handleDepsReplacement = $handleDepsReplacement.TrimEnd()
$index = Replace-Once $index $handleDeps $handleDepsReplacement "location callback dependency"

# Remove the branded generic header. Its three cards are now rendered by the new chrome.
$headerReplacement = ""
$index = Replace-Between $index '      {/* MAP HEADER */}' '      {/* TURN-BY-TURN MANEUVER CARD */}' $headerReplacement "old dashboard header"

# Keep the old GPS quality widget mounted but hidden so its state and helper
# references remain intact during this first visual implementation.
$oldLocationStyle = @'
            top: insets.top + (activeRouteTarget ? 218 : 72),
            backgroundColor: colors.surface,
            borderColor: colors.border,
'@
$oldLocationStyle = $oldLocationStyle.TrimEnd()
$newLocationStyle = @'
            top: insets.top + (activeRouteTarget ? 218 : 72),
            backgroundColor: colors.surface,
            borderColor: colors.border,
            display: "none",
'@
$newLocationStyle = $newLocationStyle.TrimEnd()
$index = Replace-Once $index $oldLocationStyle $newLocationStyle "hide legacy GPS quality chip"

# Hide the old generic 36%-height workspace. Its handlers remain in the file;
# the new compact/expanded sheet is drawn above it and owns expansion state.
$oldWorkspaceHeight = @'
            height: workspaceExpanded ? "82%" : "36%",
            maxHeight: workspaceExpanded ? "84%" : "42%",
'@
$oldWorkspaceHeight = $oldWorkspaceHeight.TrimEnd()
$newWorkspaceHeight = @'
            height: workspaceExpanded ? "82%" : "36%",
            maxHeight: workspaceExpanded ? "84%" : "42%",
            display: authorized && !activeJob ? "none" : "flex",
'@
$newWorkspaceHeight = $newWorkspaceHeight.TrimEnd()
$index = Replace-Once $index $oldWorkspaceHeight $newWorkspaceHeight "hide legacy generic workspace"

$index = Replace-Once $index '            bottom: insets.bottom + 300,' `
    '            bottom: insets.bottom + (workspaceExpanded ? 410 : 134),' `
    "reposition Mapbox controls around compact sheet"

# Add the new chrome as the last absolute child so it sits above the retained
# map, route guidance and hidden legacy dashboard workspace.
$rootClose = @'
    </View>
  );
}

const styles = StyleSheet.create({
'@
$rootClose = $rootClose.TrimEnd()
$chromeMount = @'
      {authorized && !activeJob ? (
        <SaMiRunnerDashboardChrome
          topInset={insets.top}
          bottomInset={insets.bottom}
          isOnline={isOnline}
          statusLabel={onlineLabel}
          authorized={Boolean(authorized)}
          canChangeAvailability={canChangeAvailability}
          availabilityBusy={availabilityBusy}
          locationLabel={currentLocationName || runner?.serviceArea || locationQualityLabel}
          expanded={workspaceExpanded}
          onExpandedChange={setWorkspaceExpanded}
          onToggleAvailability={() => void toggleAvailability()}
          onOpenSection={(section) => {
            router.push({
              pathname: "/(app)/runner-section",
              params: { section },
            } as never);
          }}
          offersCount={jobs.offers.length}
          activeErrand={Boolean(activeJob)}
          hasActiveRoute={Boolean(activeRouteTarget)}
          error={error}
          mapError={mapError}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
'@
$chromeMount = $chromeMount.TrimEnd()
$index = Replace-Once $index $rootClose $chromeMount "mount new runner dashboard chrome"

# -----------------------------------------------------------------------------
# Mapbox Standard: enable neighbourhood/place labels, shop/business POIs,
# landmarks, pedestrian paths and night lighting. Keep POI/category colours
# natural and subdued so the basemap blends with the SaMi navy overlays.
# -----------------------------------------------------------------------------
$kotlinImport = 'import com.mapbox.common.MapboxOptions'
if (-not $kotlin.Contains('import com.mapbox.bindgen.Value')) {
    $newKotlinImport = $kotlinImport + "`n" + 'import com.mapbox.bindgen.Value'
    $kotlin = Replace-Once $kotlin $kotlinImport $newKotlinImport "Mapbox Value import"
}

$kotlin = $kotlin.Replace(
    '                mapLoaded = true' + "`n",
    '                mapLoaded = true' + "`n" + '                applyStandardStyleConfiguration(nativeMapView)' + "`n"
)

$kotlinHelper = @'
    private fun applyStandardStyleConfiguration(nativeMapView: MapView) {
        if (mapStyleURL != "mapbox://styles/mapbox/standard") return

        nativeMapView.mapboxMap.getStyle { style ->
            val settings = listOf(
                "lightPreset" to Value.valueOf("night"),
                "theme" to Value.valueOf("default"),
                "showPlaceLabels" to Value.valueOf(true),
                "showRoadLabels" to Value.valueOf(true),
                "showPointOfInterestLabels" to Value.valueOf(true),
                "showTransitLabels" to Value.valueOf(true),
                "showPedestrianRoads" to Value.valueOf(true),
                "showHdRoads" to Value.valueOf(true),
                "show3dObjects" to Value.valueOf(true),
                "show3dBuildings" to Value.valueOf(true),
                "show3dLandmarks" to Value.valueOf(true),
                "show3dTrees" to Value.valueOf(true),
                "showLandmarkIcons" to Value.valueOf(true),
                "showLandmarkIconLabels" to Value.valueOf(true),
                "showAdminBoundaries" to Value.valueOf(true),
                "densityPointOfInterestLabels" to Value.valueOf(4.0),
                "colorLand" to Value.valueOf("#111C28"),
                "colorWater" to Value.valueOf("#071827"),
                "colorGreenspace" to Value.valueOf("#1F342C"),
                "colorRoads" to Value.valueOf("#344A62"),
                "colorTrunks" to Value.valueOf("#586F89"),
                "colorMotorways" to Value.valueOf("#748AA4"),
                "colorPlaceLabels" to Value.valueOf("#F0F4F8"),
                "colorRoadLabels" to Value.valueOf("#C7D3E2"),
                "colorPointOfInterestLabels" to Value.valueOf("#DDE6F1")
            )

            settings.forEach { (key, value) ->
                runCatching {
                    style.setStyleImportConfigProperty("basemap", key, value)
                }
            }
        }
    }

'@
$kotlinHelper = $kotlinHelper.TrimEnd()
$kotlinHelperBlock = $kotlinHelper + "`n" + '    private fun applyMapControls() {'
$kotlin = Replace-Once $kotlin '    private fun applyMapControls() {' $kotlinHelperBlock "Android Standard style configuration"

$swiftLoaded = @'
            self.mapIsReady = true

            self.configureMapControls()
'@
$swiftLoaded = $swiftLoaded.TrimEnd()
$swiftLoadedReplacement = @'
            self.mapIsReady = true

            self.configureStandardStyleConfiguration()
            self.configureMapControls()
'@
$swiftLoadedReplacement = $swiftLoadedReplacement.TrimEnd()
$swift = Replace-Once $swift $swiftLoaded $swiftLoadedReplacement "iOS Standard style on map load"

$swiftHelper = @'
    private func configureStandardStyleConfiguration() {
        guard mapStyleURL == StyleURI.standard.rawValue,
              let mapboxMap = mapView?.mapboxMap else {
            return
        }

        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "lightPreset", value: "night"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "theme", value: "default"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showPlaceLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showRoadLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showPointOfInterestLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showTransitLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showPedestrianRoads", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showHdRoads", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "show3dObjects", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "show3dBuildings", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "show3dLandmarks", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "show3dTrees", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showLandmarkIcons", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showLandmarkIconLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showAdminBoundaries", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "densityPointOfInterestLabels", value: 4.0
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorLand", value: "#111C28"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorWater", value: "#071827"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorGreenspace", value: "#1F342C"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorRoads", value: "#344A62"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorTrunks", value: "#586F89"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorMotorways", value: "#748AA4"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorPlaceLabels", value: "#F0F4F8"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorRoadLabels", value: "#C7D3E2"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "colorPointOfInterestLabels", value: "#DDE6F1"
        )
    }

'@
$swiftHelper = $swiftHelper.TrimEnd()
$swiftHelperBlock = $swiftHelper + "`n" + '    private func configureMapControls() {'
$swift = Replace-Once $swift '    private func configureMapControls() {' $swiftHelperBlock "iOS Standard style configuration"

# Verify the new dashboard screen was patched and native style helpers are present.
foreach ($needle in @(
    'SaMiRunnerDashboardChrome',
    'MAPBOX_STANDARD_STYLE',
    'updateCurrentLocationName',
    'runner-section'
)) {
    if (-not $index.Contains($needle)) { throw "Dashboard patch verification failed: missing $needle. No files have been written." }
}
if (-not $kotlin.Contains('applyStandardStyleConfiguration(nativeMapView)')) { throw "Android POI style patch verification failed. No files have been written." }
if (-not $swift.Contains('configureStandardStyleConfiguration()')) { throw "iOS POI style patch verification failed. No files have been written." }

# Make safety backups before writing any replacement source.
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
foreach ($path in @($indexPath, $kotlinPath, $swiftPath)) {
    Copy-Item $path "$path.before-dashboard-$timestamp.bak" -Force
}

Write-Normalized $indexPath $index
Write-Normalized $kotlinPath $kotlin
Write-Normalized $swiftPath $swift

Write-Host "SaMi Runner dashboard files patched successfully." -ForegroundColor Green
Write-Host "Backups created beside the three edited source files with suffix .before-dashboard-$timestamp.bak"
Write-Host "The EAS signing plugin, credentials, eas.json, build profiles and project IDs were not changed."
Write-Host "New UI files are already placed under apps/runner; run typecheck before building."
