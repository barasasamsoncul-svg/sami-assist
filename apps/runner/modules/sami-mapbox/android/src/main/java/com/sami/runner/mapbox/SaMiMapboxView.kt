package com.sami.runner.mapbox

import android.content.Context
import android.graphics.Color

import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

internal object SaMiMapboxDefaults {
    const val DEFAULT_LATITUDE = -1.2921
    const val DEFAULT_LONGITUDE = 36.8219
    const val DAY_STYLE = "mapbox://styles/mapbox/navigation-day-v1"
    const val NIGHT_STYLE = "mapbox://styles/mapbox/navigation-night-v1"
}

/**
 * Thin Expo native view. It owns public native props and events; the renderer,
 * Activity lifecycle, style and camera logic live in dedicated classes.
 */
class SaMiMapboxView(
    context: Context,
    appContext: AppContext,
) : ExpoView(context, appContext) {

    val onMapReady by EventDispatcher()
    val onMapError by EventDispatcher()
    val onCameraChanged by EventDispatcher()
    val onMapTap by EventDispatcher()
    val onLocationChanged by EventDispatcher()
    val onNavigationStatusChanged by EventDispatcher()
    val onRouteChanged by EventDispatcher()
    val onVoiceInstructionChanged by EventDispatcher()
    val onMapDiagnostic by EventDispatcher()

    private var config = SaMiMapboxConfig()

    private val diagnostics = SaMiMapboxDiagnostics { payload ->
        onMapDiagnostic(payload)
    }

    private val renderer = SaMiMapboxRenderer(
        context = context,
        appContext = appContext,
        diagnostics = diagnostics,
        onReady = { payload -> onMapReady(payload) },
        onError = { message -> onMapError(mapOf("message" to message)) },
        onCameraChanged = { payload -> onCameraChanged(payload) },
        onMapTap = { payload -> onMapTap(payload) },
    )

    init {
        setBackgroundColor(Color.TRANSPARENT)
        clipChildren = false
        clipToPadding = false
    }

    fun setAccessToken(value: String) {
        updateConfig { it.copy(accessToken = value) }
    }

    fun setMapStyle(value: String) {
        updateConfig {
            it.copy(mapStyleURL = value.trim().ifBlank { SaMiMapboxDefaults.DAY_STYLE })
        }
    }

    fun setInitialLatitude(value: Double) {
        updateConfig { it.copy(initialLatitude = value) }
    }

    fun setInitialLongitude(value: Double) {
        updateConfig { it.copy(initialLongitude = value) }
    }

    fun setInitialZoom(value: Double) {
        updateConfig { it.copy(initialZoom = value) }
    }

    fun setInitialBearing(value: Double) {
        updateConfig { it.copy(initialBearing = value) }
    }

    fun setRenderSurface(value: String) {
        updateConfig {
            it.copy(renderSurface = if (value == "texture") "texture" else "surface")
        }
    }

    /**
     * Compatibility setters retained while the Runner dashboard is migrated.
     * Stage 1 deliberately does not start location or Navigation SDK services.
     */
    fun setShowUserLocation(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setShowCompass(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setShowScaleBar(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setScreenActive(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setNavigationActive(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setCameraMode(@Suppress("UNUSED_PARAMETER") value: String) = Unit
    fun setPuckBearing(@Suppress("UNUSED_PARAMETER") value: String) = Unit
    fun setLocationPulsingEnabled(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setHasRouteDestination(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setRouteDestinationLatitude(@Suppress("UNUSED_PARAMETER") value: Double) = Unit
    fun setRouteDestinationLongitude(@Suppress("UNUSED_PARAMETER") value: Double) = Unit
    fun setRouteDestinationLabel(@Suppress("UNUSED_PARAMETER") value: String) = Unit
    fun setRouteProfile(@Suppress("UNUSED_PARAMETER") value: String) = Unit
    fun setVoiceGuidanceMuted(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit

    fun applyUpdatedProps() {
        renderer.update(config)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        renderer.onHostAttached(this)
        renderer.update(config)
    }

    override fun onDetachedFromWindow() {
        renderer.onHostDetached()
        super.onDetachedFromWindow()
    }

    fun dispose() {
        renderer.dispose()
    }

    private inline fun updateConfig(
        transform: (SaMiMapboxConfig) -> SaMiMapboxConfig,
    ) {
        config = transform(config)
    }
}
