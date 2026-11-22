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
 * Expo native view that hosts one Mapbox MapView directly. The MapView is
 * retained across temporary detach/reattach, with its Android lifecycle owned
 * by Mapbox's default lifecycle plugin, and is destroyed when Expo disposes it.
 */
class SaMiMapboxView(
    context: Context,
    appContext: AppContext,
) : ExpoView(context, appContext) {

    /**
     * This ExpoView owns a native MapView child. Yoga still controls this
     * ExpoView's outer bounds, while Android measures and lays out its child
     * after MapView is inserted or requests layout.
     */
    override val shouldUseAndroidLayout: Boolean = true

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

    fun setRenderSurface(@Suppress("UNUSED_PARAMETER") value: String) {
        updateConfig { it.copy(renderSurface = "surface") }
    }

    /**
     * Receives location fixes from SaMi Location. This view never starts its own
     * device-location provider or Navigation SDK trip session.
     */
    fun setShowUserLocation(value: Boolean) {
        updateConfig { it.copy(showUserLocation = value) }
    }

    fun setHasUserLocation(value: Boolean) {
        updateConfig { it.copy(hasUserLocation = value) }
    }

    fun setUserLatitude(value: Double) {
        updateConfig { it.copy(userLatitude = value) }
    }

    fun setUserLongitude(value: Double) {
        updateConfig { it.copy(userLongitude = value) }
    }

    fun setUserBearing(value: Double) {
        updateConfig { it.copy(userBearing = value) }
    }

    fun setHasUserBearing(value: Boolean) {
        updateConfig { it.copy(hasUserBearing = value) }
    }

    fun setRecenterRequestId(value: Int) {
        updateConfig { it.copy(recenterRequestId = value) }
    }
    fun setShowCompass(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setShowScaleBar(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setScreenActive(value: Boolean) {
        updateConfig { it.copy(screenActive = value) }
    }
    fun setNavigationActive(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit
    fun setCameraMode(value: String) {
        updateConfig { it.copy(cameraMode = value) }
    }
    fun setPuckBearing(@Suppress("UNUSED_PARAMETER") value: String) = Unit
    fun setLocationPulsingEnabled(value: Boolean) {
        updateConfig { it.copy(locationPulsingEnabled = value) }
    }
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
