package com.sami.runner.mapbox

import com.mapbox.maps.MapView

/** Owns style changes and allows a bounded renderer retry after transient failures. */
internal class SaMiMapboxStyleController(
    private val diagnostics: SaMiMapboxDiagnostics,
) {
    private var requestedStyleUri: String? = null

    fun recordInitialStyle(styleUri: String) {
        requestedStyleUri = styleUri
    }

    fun applyStyle(
        mapView: MapView,
        styleUri: String,
        surface: String,
        beforeLoad: () -> Unit,
    ) {
        if (styleUri == requestedStyleUri) return
        requestedStyleUri = styleUri
        loadStyle(mapView, styleUri, surface, beforeLoad)
    }

    /** Force a retry for the currently requested style after a Mapbox load error. */
    fun retryStyle(
        mapView: MapView,
        styleUri: String,
        surface: String,
        beforeLoad: () -> Unit,
    ) {
        requestedStyleUri = null
        applyStyle(mapView, styleUri, surface, beforeLoad)
    }

    private fun loadStyle(
        mapView: MapView,
        styleUri: String,
        surface: String,
        beforeLoad: () -> Unit,
    ) {
        beforeLoad()
        diagnostics.info(
            code = "style_change_requested",
            message = "Requesting Mapbox style $styleUri",
            surface = surface,
        )

        try {
            mapView.mapboxMap.loadStyle(styleUri) {
                diagnostics.info(
                    code = "style_load_callback",
                    message = "Mapbox style callback completed for $styleUri",
                    surface = surface,
                )
            }
        } catch (error: Exception) {
            diagnostics.error(
                code = "style_change_exception",
                message = error.message ?: "Mapbox could not change the map style.",
                surface = surface,
            )
        }
    }
}
