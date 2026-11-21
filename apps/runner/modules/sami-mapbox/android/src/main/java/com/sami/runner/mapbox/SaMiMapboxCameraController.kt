package com.sami.runner.mapbox

import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.gestures.gestures

/** Camera configuration for the standalone 2D SaMi Maps renderer. */
internal object SaMiMapboxCameraController {
    fun createInitialCamera(config: SaMiMapboxConfig): CameraOptions {
        return CameraOptions.Builder()
            .center(
                Point.fromLngLat(
                    config.initialLongitude,
                    config.initialLatitude,
                ),
            )
            .zoom(config.initialZoom.coerceIn(2.0, 20.0))
            .bearing(normalizeBearing(config.initialBearing))
            // SaMi's base map is deliberately 2D. Navigation camera work
            // will be introduced separately after the renderer is verified.
            .pitch(0.0)
            .build()
    }

    fun applyTwoDimensionalGesturePolicy(mapView: MapView) {
        mapView.gestures.pitchEnabled = false
    }

    fun cameraPayload(mapView: MapView): Map<String, Any> {
        val state = mapView.mapboxMap.cameraState

        return mapOf(
            "latitude" to state.center.latitude(),
            "longitude" to state.center.longitude(),
            "zoom" to state.zoom,
            "bearing" to state.bearing,
            "pitch" to state.pitch,
        )
    }

    private fun normalizeBearing(value: Double): Double {
        val normalized = value % 360.0
        return if (normalized < 0.0) normalized + 360.0 else normalized
    }
}
