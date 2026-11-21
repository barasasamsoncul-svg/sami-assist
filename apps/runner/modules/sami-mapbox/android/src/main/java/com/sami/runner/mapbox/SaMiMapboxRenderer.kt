package com.sami.runner.mapbox

import android.content.Context
import android.view.View
import android.view.ViewGroup

import androidx.lifecycle.LifecycleOwner

import com.mapbox.common.Cancelable
import com.mapbox.common.MapboxOptions
import com.mapbox.geojson.Point
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.renderer.RendererSetupErrorListener
import com.mapbox.maps.plugin.Plugin
import com.mapbox.maps.plugin.attribution.attribution
import com.mapbox.maps.plugin.gestures.gestures
import com.mapbox.maps.plugin.logo.logo

import expo.modules.kotlin.AppContext

private val SA_MI_MAPS_STAGE_ONE_PLUGINS = listOf(
    Plugin.Mapbox(Plugin.MAPBOX_CAMERA_PLUGIN_ID),
    Plugin.Mapbox(Plugin.MAPBOX_GESTURES_PLUGIN_ID),
    Plugin.Mapbox(Plugin.MAPBOX_LOCATION_COMPONENT_PLUGIN_ID),
    Plugin.Mapbox(Plugin.MAPBOX_LOGO_PLUGIN_ID),
    Plugin.Mapbox(Plugin.MAPBOX_ATTRIBUTION_PLUGIN_ID),
)

internal data class SaMiMapboxConfig(
    val accessToken: String = "",
    val mapStyleURL: String = SaMiMapboxDefaults.DAY_STYLE,
    val initialLatitude: Double = SaMiMapboxDefaults.DEFAULT_LATITUDE,
    val initialLongitude: Double = SaMiMapboxDefaults.DEFAULT_LONGITUDE,
    val initialZoom: Double = 14.5,
    val initialBearing: Double = 0.0,
    val renderSurface: String = "surface",
    val screenActive: Boolean = true,
    val showUserLocation: Boolean = false,
    val hasUserLocation: Boolean = false,
    val userLatitude: Double = SaMiMapboxDefaults.DEFAULT_LATITUDE,
    val userLongitude: Double = SaMiMapboxDefaults.DEFAULT_LONGITUDE,
    val userBearing: Double = 0.0,
    val hasUserBearing: Boolean = false,
    val cameraMode: String = "free",
    val locationPulsingEnabled: Boolean = false,
    val recenterRequestId: Int = 0,
)

/**
 * Owns the native Mapbox surface and rendering lifecycle. SaMi Location
 * injects position fixes through a custom provider; this renderer never
 * requests device location or starts a second GPS subscription.
 */
internal class SaMiMapboxRenderer(
    context: Context,
    appContext: AppContext,
    private val diagnostics: SaMiMapboxDiagnostics,
    private val onReady: (Map<String, Any>) -> Unit,
    private val onError: (String) -> Unit,
    private val onCameraChanged: (Map<String, Any>) -> Unit,
    private val onMapTap: (Map<String, Any>) -> Unit,
) {
    private val context = context

    private var host: ViewGroup? = null
    private var hostAttached = false
    private var disposed = false
    private var config = SaMiMapboxConfig()

    private var mapView: MapView? = null
    private var styleController: SaMiMapboxStyleController? = null
    private var locationController: SaMiMapboxLocationController? = null
    private val lifecycle = SaMiMapboxLifecycle(
        activityProvider = {
            appContext.currentActivity as? LifecycleOwner
        },
        mapViewProvider = { mapView },
        diagnostics = diagnostics,
        onStopped = { handleLifecycleStopped() },
        onResumed = { handleLifecycleResumed() },
    )

    private var mapLoaded = false
    private var firstFrameRendered = false
    private var readyDispatched = false
    private var firstUsableLayoutLogged = false
    private var mapGeneration = 0
    private var recreationSequence = 0L

    private val subscriptions = mutableListOf<Cancelable>()

    private val layoutChangeListener = View.OnLayoutChangeListener {
            view,
            left,
            top,
            right,
            bottom,
            oldLeft,
            oldTop,
            oldRight,
            oldBottom,
        ->
        val width = right - left
        val height = bottom - top

        if (width > 0 && height > 0 && !firstUsableLayoutLogged) {
            firstUsableLayoutLogged = true
            diagnostics.info(
                code = "map_view_has_size",
                message = "Native MapView has a non-zero layout: ${width}x${height} px.",
                surface = config.renderSurface,
            )
        }

        maybeDispatchReady(view as? MapView)
    }

    private val rendererSetupErrorListener = RendererSetupErrorListener { error ->
        val message = "Mapbox renderer setup failed. EGL error code: ${error.eglErrorCode}."
        diagnostics.error(
            code = "renderer_setup_failed",
            message = message,
            surface = config.renderSurface,
        )
        onError(message)
    }

    fun update(nextConfig: SaMiMapboxConfig) {
        if (disposed) return

        val previous = config
        config = normalize(nextConfig)

        if (!hostAttached) return

        if (config.accessToken.isBlank()) {
            reportError(
                code = "missing_access_token",
                message = "SaMi Maps requires EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.",
            )
            return
        }

        if (mapView != null && previous.accessToken != config.accessToken) {
            diagnostics.info(
                code = "access_token_changed",
                message = "Recreating MapView after an access token change.",
                surface = config.renderSurface,
            )
            recreateMapView("access_token_changed")
            return
        }

        if (mapView == null) {
            createMapView()
            return
        }

        if (previous.renderSurface != config.renderSurface) {
            diagnostics.info(
                code = "render_surface_change",
                message = "Recreating MapView to use the ${config.renderSurface} rendering surface.",
                surface = config.renderSurface,
            )
            recreateMapView("render_surface_changed")
            return
        }

        if (previous.mapStyleURL != config.mapStyleURL) {
            val currentMapView = mapView ?: return
            styleController?.applyStyle(
                mapView = currentMapView,
                styleUri = config.mapStyleURL,
                surface = config.renderSurface,
                beforeLoad = {
                    mapLoaded = false
                    firstFrameRendered = false
                    readyDispatched = false
                },
            )
        }

        if (
            previous.initialLatitude != config.initialLatitude ||
            previous.initialLongitude != config.initialLongitude ||
            previous.initialZoom != config.initialZoom ||
            previous.initialBearing != config.initialBearing
        ) {
            applyInitialCamera()
        }

        // The same Expo Location fixes update the puck and follow camera.
        // The Mapbox location component is configured with SaMi's custom
        // provider, so it never opens a second device GPS subscription.
        locationController?.update(config)
    }

    fun onHostAttached(parent: ViewGroup) {
        if (disposed) return

        host = parent
        hostAttached = true

        diagnostics.info(
            code = "native_host_attached",
            message = "SaMi Maps native host view attached to the Android window.",
            surface = config.renderSurface,
        )

        if (config.accessToken.isNotBlank()) {
            if (mapView == null) {
                createMapView()
            } else {
                lifecycle.attach()
            }
        }
    }

    fun onHostDetached() {
        if (!hostAttached) return

        hostAttached = false
        lifecycle.detach()
        firstFrameRendered = false
        readyDispatched = false

        diagnostics.info(
            code = "native_host_detached",
            message = "SaMi Maps native host detached; MapView was stopped and retained for reattachment.",
            surface = config.renderSurface,
        )
    }

    fun dispose() {
        if (disposed) return

        disposed = true
        hostAttached = false
        recreationSequence += 1L
        lifecycle.dispose()
        destroyCurrentMapView()
        host = null

        diagnostics.info(
            code = "renderer_disposed",
            message = "SaMi Maps renderer disposed.",
            surface = config.renderSurface,
        )
    }

    private fun createMapView() {
        if (disposed || mapView != null) return

        val parent = host
        if (!hostAttached || parent == null) return

        if (config.accessToken.isBlank()) {
            reportError(
                code = "missing_access_token",
                message = "SaMi Maps requires EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.",
            )
            return
        }

        try {
            MapboxOptions.accessToken = config.accessToken

            val initOptions = MapInitOptions(
                context = context,
                // This explicit plugin set deliberately excludes Mapbox's
                // default lifecycle plugin. SaMiMapboxLifecycle is the single
                // owner forwarding Activity and native-host lifecycle events.
                // Location is enabled only through SaMi's custom provider,
                // which receives the single Expo Location stream.
                plugins = SA_MI_MAPS_STAGE_ONE_PLUGINS,
                cameraOptions = SaMiMapboxCameraController.createInitialCamera(config),
                textureView = false,
                styleUri = config.mapStyleURL,
            )

            val createdMapView = MapView(context, initOptions)
            createdMapView.layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )

            mapView = createdMapView
            mapGeneration += 1
            mapLoaded = false
            firstFrameRendered = false
            readyDispatched = false
            firstUsableLayoutLogged = false
            styleController = SaMiMapboxStyleController(diagnostics).also {
                it.recordInitialStyle(config.mapStyleURL)
            }

            createdMapView.addRendererSetupErrorListener(rendererSetupErrorListener)
            createdMapView.addOnLayoutChangeListener(layoutChangeListener)
            configureMapControls(createdMapView)
            locationController = SaMiMapboxLocationController(createdMapView, diagnostics)
            subscribeToMapEvents(createdMapView, mapGeneration)

            parent.addView(
                createdMapView,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )

            diagnostics.info(
                code = "map_view_created",
                message = "Created Mapbox Maps SDK MapView (generation $mapGeneration).",
                surface = config.renderSurface,
            )

            lifecycle.attach()
            locationController?.update(config)
        } catch (error: Exception) {
            destroyCurrentMapView()
            reportError(
                code = "map_view_creation_failed",
                message = error.message ?: "SaMi Maps could not create the native MapView.",
            )
        }
    }

    private fun configureMapControls(nativeMapView: MapView) {
        SaMiMapboxCameraController.applyTwoDimensionalGesturePolicy(nativeMapView)
        nativeMapView.logo.enabled = true
        nativeMapView.attribution.enabled = true
    }

    private fun subscribeToMapEvents(
        nativeMapView: MapView,
        generation: Int,
    ) {
        subscriptions += nativeMapView.mapboxMap.subscribeMapLoaded {
            if (generation != mapGeneration || disposed) return@subscribeMapLoaded

            nativeMapView.post {
                if (generation != mapGeneration || disposed) return@post

                mapLoaded = true
                diagnostics.info(
                    code = "map_loaded",
                    message = "Mapbox reported that the style and visible map tiles have loaded.",
                    surface = config.renderSurface,
                )
                maybeDispatchReady(nativeMapView)
            }
        }

        subscriptions += nativeMapView.mapboxMap.subscribeMapLoadingError { error ->
            if (generation != mapGeneration || disposed) return@subscribeMapLoadingError

            val message = error.message
                ?: "Mapbox reported an unspecified style or tile loading error."

            nativeMapView.post {
                if (generation != mapGeneration || disposed) return@post
                reportError(
                    code = "map_loading_error",
                    message = message,
                )
            }
        }

        subscriptions += nativeMapView.mapboxMap.subscribeRenderFrameFinished {
            if (generation != mapGeneration || disposed) return@subscribeRenderFrameFinished

            nativeMapView.post {
                if (generation != mapGeneration || disposed) return@post
                if (!mapLoaded) return@post

                if (!firstFrameRendered) {
                    firstFrameRendered = true
                    diagnostics.info(
                        code = "first_render_frame_after_map_loaded",
                        message = "Mapbox completed a render frame after the active style and visible tiles loaded.",
                        surface = config.renderSurface,
                    )
                }

                maybeDispatchReady(nativeMapView)
            }
        }

        subscriptions += nativeMapView.mapboxMap.subscribeCameraChanged {
            if (generation != mapGeneration || disposed) return@subscribeCameraChanged

            nativeMapView.post {
                if (generation != mapGeneration || disposed) return@post
                onCameraChanged(
                    SaMiMapboxCameraController.cameraPayload(nativeMapView),
                )
            }
        }

        nativeMapView.gestures.addOnMapClickListener { point: Point ->
            if (generation == mapGeneration && !disposed) {
                nativeMapView.post {
                    if (generation != mapGeneration || disposed) return@post
                    onMapTap(
                        mapOf(
                            "latitude" to point.latitude(),
                            "longitude" to point.longitude(),
                        ),
                    )
                }
            }
            true
        }
    }

    private fun maybeDispatchReady(candidate: MapView?) {
        val currentMapView = candidate ?: return
        if (disposed || readyDispatched) return
        if (!hostAttached || !currentMapView.isAttachedToWindow) return
        if (currentMapView.width <= 0 || currentMapView.height <= 0) return
        if (!mapLoaded || !firstFrameRendered) return

        readyDispatched = true
        val payload = mapOf(
            "ready" to true,
            "styleLoaded" to true,
            "firstFrameRendered" to true,
            "renderSurface" to config.renderSurface,
            "width" to currentMapView.width,
            "height" to currentMapView.height,
            "generation" to mapGeneration,
        )

        diagnostics.info(
            code = "map_ready_verified",
            message = "SaMi Maps is ready: style loaded, first frame rendered, and native view has a non-zero size.",
            surface = config.renderSurface,
        )
        onReady(payload)
    }

    private fun applyInitialCamera() {
        val nativeMapView = mapView ?: return

        try {
            nativeMapView.mapboxMap.setCamera(
                SaMiMapboxCameraController.createInitialCamera(config),
            )
        } catch (error: Exception) {
            reportError(
                code = "camera_update_failed",
                message = error.message ?: "SaMi Maps could not apply the initial camera.",
            )
        }
    }

    /**
     * SurfaceView and TextureView are immutable MapInitOptions choices, so a
     * surface change requires a new MapView. The old view must be detached
     * from its parent before onDestroy(), and the replacement must not be
     * attached in the same UI traversal that tears down the old surface.
     */
    private fun recreateMapView(reason: String) {
        if (disposed || !hostAttached) return

        val targetHost = host ?: return
        val request = ++recreationSequence
        val oldGeneration = mapGeneration

        diagnostics.info(
            code = "map_view_recreation_started",
            message = "Starting MapView recreation ($reason); current generation=$oldGeneration.",
            surface = config.renderSurface,
        )

        // Stop Activity callbacks first. detach() forwards onStop exactly once.
        lifecycle.detach()

        // Detach the old native surface from the Android view tree, then
        // destroy its Mapbox resources. Never reverse this ordering.
        destroyCurrentMapView()

        diagnostics.info(
            code = "map_view_recreation_deferred",
            message = "Old MapView has been detached and destroyed; replacement is scheduled for the next UI frame.",
            surface = config.renderSurface,
        )

        targetHost.postOnAnimation {
            // A newer surface/access-token request supersedes this callback.
            if (request != recreationSequence) return@postOnAnimation
            if (disposed || !hostAttached || host !== targetHost) return@postOnAnimation
            if (mapView != null) return@postOnAnimation

            if (!targetHost.isAttachedToWindow) {
                diagnostics.warning(
                    code = "map_view_recreation_host_detached",
                    message = "Replacement MapView was not created because the native host detached before the next frame.",
                    surface = config.renderSurface,
                )
                return@postOnAnimation
            }

            createMapView()
        }
    }

    /**
     * Cancels callbacks, removes the MapView from its parent, and only then
     * calls MapView.onDestroy(). Removing first gives Android an opportunity
     * to deliver native Surface/Texture detachment before Mapbox releases it.
     */
    private fun destroyCurrentMapView() {
        subscriptions.forEach { cancelable ->
            runCatching { cancelable.cancel() }
        }
        subscriptions.clear()

        val currentMapView = mapView
        mapView = null
        styleController = null
        locationController?.dispose()
        locationController = null

        if (currentMapView != null) {
            currentMapView.removeOnLayoutChangeListener(layoutChangeListener)
            runCatching {
                currentMapView.removeRendererSetupErrorListener(rendererSetupErrorListener)
            }

            val parent = currentMapView.parent as? ViewGroup
            if (parent != null) {
                runCatching {
                    parent.removeView(currentMapView)
                }.onFailure { error ->
                    diagnostics.warning(
                        code = "map_view_detach_warning",
                        message = error.message ?: "Android could not detach the previous MapView from its parent.",
                        surface = config.renderSurface,
                    )
                }
            }

            if (currentMapView.isAttachedToWindow) {
                diagnostics.warning(
                    code = "map_view_still_attached_before_destroy",
                    message = "MapView still reports window attachment after parent removal; destroying defensively.",
                    surface = config.renderSurface,
                )
            }

            runCatching {
                currentMapView.onDestroy()
            }.onFailure { error ->
                diagnostics.warning(
                    code = "map_view_destroy_warning",
                    message = error.message ?: "Mapbox MapView cleanup returned a warning.",
                    surface = config.renderSurface,
                )
            }
        }

        mapLoaded = false
        firstFrameRendered = false
        readyDispatched = false
        firstUsableLayoutLogged = false
    }

    private fun handleLifecycleStopped() {
        firstFrameRendered = false
        readyDispatched = false
        diagnostics.info(
            code = "renderer_waiting_after_stop",
            message = "Map renderer stopped with the host lifecycle; readiness will be reported again after a new frame.",
            surface = config.renderSurface,
        )
    }

    private fun handleLifecycleResumed() {
        val currentMapView = mapView
        if (currentMapView != null) {
            val hasLoadedStyle = runCatching {
                currentMapView.mapboxMap.style != null
            }.getOrDefault(false)

            if (!hasLoadedStyle) {
                mapLoaded = false
                diagnostics.warning(
                    code = "style_not_available_after_resume",
                    message = "Mapbox has no active style after resume; readiness will wait for a new map-loaded event.",
                    surface = config.renderSurface,
                )
            }
        }

        diagnostics.info(
            code = "renderer_host_resumed",
            message = "Host Activity resumed; readiness is waiting for a completed Mapbox frame and an available style.",
            surface = config.renderSurface,
        )
    }

    private fun reportError(code: String, message: String) {
        diagnostics.error(
            code = code,
            message = message,
            surface = config.renderSurface,
        )
        onError(message)
    }

    private fun normalize(input: SaMiMapboxConfig): SaMiMapboxConfig {
        val latitude = input.initialLatitude.takeIf {
            it.isFinite() && it in -90.0..90.0
        } ?: SaMiMapboxDefaults.DEFAULT_LATITUDE

        val longitude = input.initialLongitude.takeIf {
            it.isFinite() && it in -180.0..180.0
        } ?: SaMiMapboxDefaults.DEFAULT_LONGITUDE

        val zoom = input.initialZoom.takeIf { it.isFinite() } ?: 14.5
        val bearing = input.initialBearing.takeIf { it.isFinite() } ?: 0.0
        val style = input.mapStyleURL.trim().ifBlank { SaMiMapboxDefaults.DAY_STYLE }
        val surface = "surface"
        val userLatitude = input.userLatitude.takeIf { it.isFinite() && it in -90.0..90.0 } ?: SaMiMapboxDefaults.DEFAULT_LATITUDE
        val userLongitude = input.userLongitude.takeIf { it.isFinite() && it in -180.0..180.0 } ?: SaMiMapboxDefaults.DEFAULT_LONGITUDE
        val userBearing = input.userBearing.takeIf { it.isFinite() && it >= 0.0 && it < 360.0 } ?: 0.0
        val cameraMode = input.cameraMode.takeIf { it == "free" || it == "follow" || it == "navigation" } ?: "free"

        return input.copy(
            accessToken = input.accessToken.trim(),
            mapStyleURL = style,
            initialLatitude = latitude,
            initialLongitude = longitude,
            initialZoom = zoom.coerceIn(2.0, 20.0),
            initialBearing = bearing,
            renderSurface = surface,
            screenActive = input.screenActive,
            userLatitude = userLatitude,
            userLongitude = userLongitude,
            userBearing = userBearing,
            cameraMode = cameraMode,
        )
    }
}
