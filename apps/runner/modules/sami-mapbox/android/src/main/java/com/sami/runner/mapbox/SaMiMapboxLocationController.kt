package com.sami.runner.mapbox

import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.PuckBearing
import com.mapbox.maps.plugin.animation.MapAnimationOptions.Companion.mapAnimationOptions
import com.mapbox.maps.plugin.animation.easeTo
import com.mapbox.maps.plugin.locationcomponent.createDefault2DPuck
import com.mapbox.maps.plugin.locationcomponent.location

/** Connects SaMi's single Expo Location stream to Mapbox's puck and follow camera. */
internal class SaMiMapboxLocationController(
    private val mapView: MapView,
    private val diagnostics: SaMiMapboxDiagnostics,
) {
    private val provider = SaMiMapboxLocationProvider()
    private var lastCameraLatitude: Double? = null
    private var lastCameraLongitude: Double? = null
    private var lastRecenterRequestId = 0

    init {
        // Register SaMi's provider before enabling the Mapbox location component.
        // This prevents the Mapbox component from creating its own GPS stream.
        mapView.location.setLocationProvider(provider)
        mapView.location.updateSettings {
            locationPuck = createDefault2DPuck(withBearing = true)
            puckBearing = PuckBearing.COURSE
            puckBearingEnabled = false
            enabled = false
        }
    }

    fun update(config: SaMiMapboxConfig) {
        val enabled = config.showUserLocation && config.hasUserLocation

        mapView.location.updateSettings {
            puckBearing = PuckBearing.COURSE
            puckBearingEnabled = config.hasUserBearing
            pulsingEnabled = config.locationPulsingEnabled
            this.enabled = enabled
        }

        if (!enabled) return

        provider.update(
            latitude = config.userLatitude,
            longitude = config.userLongitude,
            bearing = if (config.hasUserBearing) config.userBearing else null,
        )

        // Keep the native puck fresh while this screen is covered, but do not
        // move the camera underneath another route. On focus, the most recent
        // fix is still compared with the last camera fix and is followed.
        if (!config.screenActive) return

        val cameraChangedByLocation =
            lastCameraLatitude != config.userLatitude ||
                lastCameraLongitude != config.userLongitude
        val explicitRecenter = lastRecenterRequestId != config.recenterRequestId

        if (config.cameraMode == "free" && !explicitRecenter) return
        if (!cameraChangedByLocation && !explicitRecenter) return

        try {
            val current = mapView.mapboxMap.cameraState
            val bearing = if (
                config.cameraMode == "navigation" &&
                config.hasUserBearing
            ) {
                config.userBearing
            } else {
                current.bearing
            }
            val targetZoom = if (explicitRecenter) {
                current.zoom.coerceAtLeast(15.0)
            } else {
                current.zoom
            }

            mapView.mapboxMap.easeTo(
                CameraOptions.Builder()
                    .center(Point.fromLngLat(config.userLongitude, config.userLatitude))
                    .zoom(targetZoom)
                    .bearing(bearing)
                    .pitch(0.0)
                    .build(),
                mapAnimationOptions { duration(700L) },
            )
            lastCameraLatitude = config.userLatitude
            lastCameraLongitude = config.userLongitude
            lastRecenterRequestId = config.recenterRequestId
        } catch (error: Exception) {
            diagnostics.warning(
                code = "location_camera_update_failed",
                message = error.message ?: "Map camera could not follow the latest SaMi location fix.",
            )
        }
    }

    fun dispose() {
        runCatching {
            mapView.location.updateSettings { enabled = false }
        }
        provider.clear()
    }
}
