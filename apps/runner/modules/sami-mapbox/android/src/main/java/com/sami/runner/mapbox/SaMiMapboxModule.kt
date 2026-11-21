package com.sami.runner.mapbox

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Expo registration surface for SaMi's custom native Mapbox view. */
class SaMiMapboxModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("SaMiMapbox")

        View(SaMiMapboxView::class) {
            Name("SaMiMapbox")

            Events(
                "onMapReady",
                "onMapError",
                "onCameraChanged",
                "onMapTap",
                "onLocationChanged",
                "onNavigationStatusChanged",
                "onRouteChanged",
                "onVoiceInstructionChanged",
                "onMapDiagnostic",
            )

            Prop("accessToken", "") { view: SaMiMapboxView, value: String ->
                view.setAccessToken(value)
            }

            Prop("mapStyleURL", SaMiMapboxDefaults.DAY_STYLE) { view: SaMiMapboxView, value: String ->
                view.setMapStyle(value)
            }

            Prop("initialLatitude", SaMiMapboxDefaults.DEFAULT_LATITUDE) { view: SaMiMapboxView, value: Double ->
                view.setInitialLatitude(value)
            }

            Prop("initialLongitude", SaMiMapboxDefaults.DEFAULT_LONGITUDE) { view: SaMiMapboxView, value: Double ->
                view.setInitialLongitude(value)
            }

            Prop("initialZoom", 14.5) { view: SaMiMapboxView, value: Double ->
                view.setInitialZoom(value)
            }

            Prop("initialBearing", 0.0) { view: SaMiMapboxView, value: Double ->
                view.setInitialBearing(value)
            }

            Prop("renderSurface", "surface") { view: SaMiMapboxView, value: String ->
                view.setRenderSurface(value)
            }

            // The following props are retained for source compatibility while
            // location and navigation are rebuilt as separate feature layers.
            // They intentionally do not start any location or trip-session work.
            Prop("showUserLocation", false) { view: SaMiMapboxView, value: Boolean ->
                view.setShowUserLocation(value)
            }
            Prop("showCompass", true) { view: SaMiMapboxView, value: Boolean ->
                view.setShowCompass(value)
            }
            Prop("showScaleBar", false) { view: SaMiMapboxView, value: Boolean ->
                view.setShowScaleBar(value)
            }
            Prop("screenActive", true) { view: SaMiMapboxView, value: Boolean ->
                view.setScreenActive(value)
            }
            Prop("navigationActive", false) { view: SaMiMapboxView, value: Boolean ->
                view.setNavigationActive(value)
            }
            Prop("cameraMode", "free") { view: SaMiMapboxView, value: String ->
                view.setCameraMode(value)
            }
            Prop("puckBearing", "course") { view: SaMiMapboxView, value: String ->
                view.setPuckBearing(value)
            }
            Prop("locationPulsingEnabled", false) { view: SaMiMapboxView, value: Boolean ->
                view.setLocationPulsingEnabled(value)
            }
            Prop("hasRouteDestination", false) { view: SaMiMapboxView, value: Boolean ->
                view.setHasRouteDestination(value)
            }
            Prop("routeDestinationLatitude", 0.0) { view: SaMiMapboxView, value: Double ->
                view.setRouteDestinationLatitude(value)
            }
            Prop("routeDestinationLongitude", 0.0) { view: SaMiMapboxView, value: Double ->
                view.setRouteDestinationLongitude(value)
            }
            Prop("routeDestinationLabel", "") { view: SaMiMapboxView, value: String ->
                view.setRouteDestinationLabel(value)
            }
            Prop("routeProfile", "driving-traffic") { view: SaMiMapboxView, value: String ->
                view.setRouteProfile(value)
            }
            Prop("voiceGuidanceMuted", false) { view: SaMiMapboxView, value: Boolean ->
                view.setVoiceGuidanceMuted(value)
            }

            OnViewDidUpdateProps { view: SaMiMapboxView ->
                view.applyUpdatedProps()
            }

            OnViewDestroys { view: SaMiMapboxView ->
                view.dispose()
            }
        }
    }
}
