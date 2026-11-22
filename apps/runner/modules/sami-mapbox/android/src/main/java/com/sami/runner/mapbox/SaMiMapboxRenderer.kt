package com.sami.runner.mapbox

import android.content.Context
import android.content.ContextWrapper
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.findViewTreeLifecycleOwner
import com.mapbox.bindgen.ExpectedFactory
import com.mapbox.common.Cancelable
import com.mapbox.common.MapboxOptions
import com.mapbox.common.location.DeviceLocationProviderFactory
import com.mapbox.navigation.base.options.LocationOptions
import com.mapbox.navigation.base.options.LocationOptions.LocationProviderType
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.NavigationOptions
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.Plugin
import com.mapbox.maps.renderer.RendererSetupErrorListener
import com.mapbox.maps.plugin.attribution.attribution
import com.mapbox.maps.plugin.gestures.gestures
import com.mapbox.maps.plugin.logo.logo

internal data class SaMiMapboxConfig(
    val accessToken: String = "",
    val mapStyleURL: String = SaMiMapboxDefaults.DAY_STYLE,
    val initialLatitude: Double = SaMiMapboxDefaults.DEFAULT_LATITUDE,
    val initialLongitude: Double = SaMiMapboxDefaults.DEFAULT_LONGITUDE,
    val initialZoom: Double = 14.5,
    val initialBearing: Double = 0.0,
    val renderSurface: String = "texture",
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
    val userSpeedMetersPerSecond: Double = 0.0,
    val userHorizontalAccuracyMeters: Double = 0.0,
    val navigationActive: Boolean = false,
    val hasRouteDestination: Boolean = false,
    val routeDestinationLatitude: Double = 0.0,
    val routeDestinationLongitude: Double = 0.0,
    val routeDestinationLabel: String = "",
    val routeProfile: String = "driving-traffic",
    val voiceGuidanceMuted: Boolean = false,
)

/**
 * Owns the native Mapbox surface and rendering lifecycle. SaMi Location
 * injects position fixes through a custom provider; this renderer never
 * requests device location or starts a second GPS subscription.
 *
 * Mapbox's first SaMi integration added MapView directly to the ExpoView,
 * used Mapbox's standard default plugin configuration, and retained the same
 * MapView when the screen detached. Mapbox's default lifecycle plugin owns
 * Activity and View attach/detach lifecycle transitions; SaMi does not forward
 * duplicate onStart/onStop calls. The same MapView is retained when the screen
 * returns and destroyed only when Expo disposes it. SaMi Location remains the
 * only source of device fixes.
 */
internal class SaMiMapboxRenderer(
    context: Context,
    private val diagnostics: SaMiMapboxDiagnostics,
    private val onReady: (Map<String, Any>) -> Unit,
    private val onError: (String) -> Unit,
    private val onCameraChanged: (Map<String, Any>) -> Unit,
    private val onMapTap: (Map<String, Any>) -> Unit,
    private val onNavigationStatusChanged: (Map<String, Any>) -> Unit,
    private val onRouteChanged: (Map<String, Any?>) -> Unit,
    private val onVoiceInstructionChanged: (Map<String, Any?>) -> Unit,
) {
    private val context = context
    private val mainHandler = Handler(Looper.getMainLooper())

    private var host: ViewGroup? = null
    private var hostAttached = false
    private var disposed = false
    private var config = SaMiMapboxConfig()

    private var mapView: MapView? = null
    // Retain the last camera state, not the MapView. A MapView belongs to the
    // ViewTreeLifecycleOwner that created it and must not be reused after detach.
    private var restoredCamera: CameraOptions? = null
    private var styleController: SaMiMapboxStyleController? = null
    private var locationController: SaMiMapboxLocationController? = null
    private var routeGuidanceController: SaMiRouteGuidanceController? = null
    private val voiceGuidanceController = SaMiVoiceGuidanceController(context) { payload ->
        onVoiceInstructionChanged(payload)
    }

    private var mapboxNavigation: MapboxNavigation? = null
    private var navigationLifecycleOwner: LifecycleOwner? = null
    private var navigationOwnerAttached = false
    private var navigationObserverRegistered = false
    private var tripSessionStarted = false
    private var lastDestinationKey: String? = null

    private val navigationObserver = object : MapboxNavigationObserver {
        override fun onAttached(mapboxNavigation: MapboxNavigation) {
            this@SaMiMapboxRenderer.mapboxNavigation = mapboxNavigation
            routeGuidanceController?.attach(mapboxNavigation)
            voiceGuidanceController.attach(mapboxNavigation)
            syncNavigationState()
        }

        override fun onDetached(mapboxNavigation: MapboxNavigation) {
            if (this@SaMiMapboxRenderer.mapboxNavigation !== mapboxNavigation) return
            runCatching { mapboxNavigation.stopTripSession() }
            tripSessionStarted = false
            routeGuidanceController?.detach()
            voiceGuidanceController.detach()
            this@SaMiMapboxRenderer.mapboxNavigation = null
            onNavigationStatusChanged(mapOf("active" to false, "mode" to "idle"))
        }
    }

    private var mapLoaded = false
    private var firstFrameRendered = false
    private var readyDispatched = false
    private var firstUsableLayoutLogged = false
    private var mapGeneration = 0
    private var recreationSequence = 0L
    private var styleRetryAttempts = 0
    private var pendingStyleRetry: Runnable? = null

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

        // The first Android attach can precede prop delivery. Retry lifecycle
        // attachment now that the access token and final props are available.
        host?.let { ensureNavigationAttached(it) }

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
            cancelPendingStyleRetry()
            styleRetryAttempts = 0
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
            // An explicit new initial-camera prop takes precedence over the
            // viewport saved from the previous native MapView.
            restoredCamera = null
            applyInitialCamera()
        }

        // The same Expo Location fixes update both the Maps puck and the
        // Navigation SDK adapter. Neither SDK is allowed to start a second GPS feed.
        locationController?.update(config)
        syncNavigationState()
    }

    fun onHostAttached(parent: ViewGroup) {
        if (disposed) return

        // A MapView is tied to the ViewTreeLifecycleOwner that created it.
        // Never reuse an instance from an earlier native-window attachment.
        if (mapView != null) {
            captureCameraStateForRestore(mapView)
            cancelPendingStyleRetry()
            destroyCurrentMapView()
        }

        host = parent
        hostAttached = true
        ensureNavigationAttached(parent)

        diagnostics.info(
            code = "native_host_attached",
            message = "SaMi Maps native ExpoView attached; creating a fresh MapView for this window lifecycle.",
            surface = config.renderSurface,
        )

        if (config.accessToken.isNotBlank()) {
            createMapView()
        }
    }

    /**
     * Snapshot the camera before the old view-tree lifecycle owner is torn
     * down. Only camera state survives; the MapView itself is always retired.
     */
    private fun captureCameraStateForRestore(candidate: MapView?) {
        val currentMapView = candidate ?: return

        runCatching {
            val state = currentMapView.mapboxMap.cameraState
            restoredCamera = CameraOptions.Builder()
                .center(state.center)
                .zoom(state.zoom)
                .bearing(state.bearing)
                // Persist bearing/zoom/center, never a tilted camera. SaMi maps stay 2D.
                .pitch(0.0)
                .build()
        }.onFailure { error ->
            diagnostics.warning(
                code = "map_camera_snapshot_failed",
                message = error.message ?: "Could not snapshot the current camera before replacing MapView.",
                surface = config.renderSurface,
            )
        }
    }

    fun onHostDetached() {
        if (!hostAttached) return

        hostAttached = false
        recreationSequence += 1L
        cancelPendingStyleRetry()
        firstFrameRendered = false
        readyDispatched = false

        // The Mapbox lifecycle observer can destroy a MapView when Android
        // tears down this host's view-tree lifecycle. Dispose it now rather
        // than retaining a dead renderer and calling triggerRepaint() after wake.
        captureCameraStateForRestore(mapView)
        diagnostics.info(
            code = "native_host_detached",
            message = "SaMi Maps host detached; disposing this MapView and preserving its camera for a fresh view on reattachment.",
            surface = config.renderSurface,
        )
        destroyCurrentMapView()
    }

    fun dispose() {
        if (disposed) return

        disposed = true
        hostAttached = false
        recreationSequence += 1L
        cancelPendingStyleRetry()
        destroyCurrentMapView()
        voiceGuidanceController.dispose()
        mapboxNavigation?.let { navigation ->
            if (tripSessionStarted) runCatching { navigation.stopTripSession() }
        }
        tripSessionStarted = false
        if (navigationObserverRegistered) {
            runCatching { MapboxNavigationApp.unregisterObserver(navigationObserver) }
            navigationObserverRegistered = false
        }
        if (navigationOwnerAttached) {
            navigationLifecycleOwner?.let { owner ->
                runCatching { MapboxNavigationApp.detach(owner) }
            }
            navigationOwnerAttached = false
        }
        navigationLifecycleOwner = null
        mapboxNavigation = null
        host = null

        diagnostics.info(
            code = "renderer_disposed",
            message = "SaMi Maps renderer disposed.",
            surface = config.renderSurface,
        )
    }

    /**
     * Initializes the one process-wide Navigation SDK instance with SaMi's
     * provider. If another component has already initialized Mapbox Navigation
     * with an unknown provider, fail closed rather than silently opening a
     * second GPS source.
     */
    private fun ensureNavigationAttached(parent: ViewGroup) {
        if (config.accessToken.isBlank()) return
        val owner = parent.findViewTreeLifecycleOwner() ?: resolveLifecycleOwner(parent.context)
        if (owner == null) {
            diagnostics.warning(
                code = "navigation_lifecycle_owner_missing",
                message = "Mapbox Navigation is waiting for the native Activity lifecycle owner.",
                surface = config.renderSurface,
            )
            return
        }

        try {
            MapboxOptions.accessToken = config.accessToken
            if (!MapboxNavigationApp.isSetup()) {
                MapboxNavigationApp.setup {
                    NavigationOptions.Builder(context.applicationContext)
                        .locationOptions(
                            LocationOptions.Builder()
                                .locationProviderFactory(
                                    DeviceLocationProviderFactory { _ ->
                                        ExpectedFactory.createValue(
                                            SaMiMapboxNavigationLocationProviderHolder.shared,
                                        )
                                    },
                                    LocationProviderType.REAL,
                                )
                                .build(),
                        )
                        .build()
                }
                navigationAppConfigured = true
            } else if (!navigationAppConfigured) {
                throw IllegalStateException(
                    "Mapbox Navigation was initialized outside SaMi's single-location provider. Refusing to attach to avoid a second GPS source.",
                )
            }

            if (navigationLifecycleOwner !== owner) {
                if (navigationOwnerAttached) {
                    navigationLifecycleOwner?.let { previous ->
                        runCatching { MapboxNavigationApp.detach(previous) }
                    }
                }
                navigationLifecycleOwner = owner
                navigationOwnerAttached = false
            }

            if (!navigationOwnerAttached) {
                MapboxNavigationApp.attach(owner)
                navigationOwnerAttached = true
            }
            if (!navigationObserverRegistered) {
                MapboxNavigationApp.registerObserver(navigationObserver)
                navigationObserverRegistered = true
            }
            syncNavigationState()
        } catch (error: Exception) {
            diagnostics.error(
                code = "navigation_sdk_initialization_failed",
                message = error.message ?: "SaMi turn-by-turn navigation could not be initialized.",
                surface = config.renderSurface,
            )
            onError(error.message ?: "SaMi turn-by-turn navigation could not be initialized.")
        }
    }

    private fun resolveLifecycleOwner(candidate: Context): LifecycleOwner? {
        var current: Context? = candidate
        while (current != null) {
            if (current is LifecycleOwner) return current
            current = (current as? ContextWrapper)?.baseContext
        }
        return null
    }

    /** Applies only SaMi Location fixes and the current errand destination. */
    private fun syncNavigationState() {
        val navigation = mapboxNavigation ?: return

        if (config.hasUserLocation) {
            SaMiMapboxNavigationLocationProviderHolder.shared.updateFromSaMiLocation(
                latitude = config.userLatitude,
                longitude = config.userLongitude,
                bearing = if (config.hasUserBearing) config.userBearing else null,
                speedMetersPerSecond = config.userSpeedMetersPerSecond,
                horizontalAccuracyMeters = config.userHorizontalAccuracyMeters,
            )
        }

        if (config.navigationActive && !tripSessionStarted) {
            runCatching { navigation.startTripSession() }
                .onSuccess { tripSessionStarted = true }
                .onFailure { error ->
                    diagnostics.error(
                        code = "navigation_trip_session_start_failed",
                        message = error.message ?: "Navigation tracking could not be started.",
                        surface = config.renderSurface,
                    )
                    onError(error.message ?: "Navigation tracking could not be started.")
                }
        } else if (!config.navigationActive && tripSessionStarted) {
            runCatching { navigation.stopTripSession() }
            tripSessionStarted = false
        }

        val destination = if (
            config.hasRouteDestination &&
            config.routeDestinationLatitude.isFinite() &&
            config.routeDestinationLatitude in -90.0..90.0 &&
            config.routeDestinationLongitude.isFinite() &&
            config.routeDestinationLongitude in -180.0..180.0
        ) {
            Point.fromLngLat(config.routeDestinationLongitude, config.routeDestinationLatitude)
        } else {
            null
        }

        val destinationKey = destination?.let {
            "${it.latitude()},${it.longitude()},${config.routeProfile}"
        }
        if (destinationKey != lastDestinationKey) {
            voiceGuidanceController.onRouteChanged()
            lastDestinationKey = destinationKey
        }
        routeGuidanceController?.setDestination(
            point = destination,
            label = config.routeDestinationLabel,
            profile = config.routeProfile,
        )
        if (config.hasUserLocation) {
            routeGuidanceController?.updateOrigin(
                Point.fromLngLat(config.userLongitude, config.userLatitude),
            )
        }
        voiceGuidanceController.setMuted(config.voiceGuidanceMuted)

        onNavigationStatusChanged(
            mapOf(
                "active" to config.navigationActive,
                "mode" to when {
                    destination != null -> "active_guidance"
                    config.navigationActive -> "free_drive"
                    else -> "idle"
                },
            ),
        )
    }

    private fun createMapView() {
        if (disposed || mapView != null) return

        val parent = host
        if (!hostAttached || parent == null || !parent.isAttachedToWindow) return

        if (config.accessToken.isBlank()) {
            reportError(
                code = "missing_access_token",
                message = "SaMi Maps requires EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.",
            )
            return
        }

        try {
            MapboxOptions.accessToken = config.accessToken

            // Keep Mapbox's standard plugins and its built-in view lifecycle,
            // but omit the ScaleBar ornament. The Runner dashboard is a
            // full-bleed map and intentionally has no distance scale overlay.
            // Use TextureView so the map is composited as a normal Android
            // view during React Native screen fade transitions; this trades
            // some rendering throughput for view-hierarchy compatibility.
            // SaMi Location installs its custom provider before enabling the
            // puck, preserving the single SaMi GPS source.
            val pluginsWithoutScaleBar = MapInitOptions.defaultPluginList.filterNot { plugin ->
                plugin.id == Plugin.MAPBOX_SCALEBAR_PLUGIN_ID
            }
            val initOptions = MapInitOptions(
                context = context,
                plugins = pluginsWithoutScaleBar,
                cameraOptions = restoredCamera
                    ?: SaMiMapboxCameraController.createInitialCamera(config),
                textureView = true,
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
            styleRetryAttempts = 0
            styleController = SaMiMapboxStyleController(diagnostics).also {
                it.recordInitialStyle(config.mapStyleURL)
            }

            createdMapView.addRendererSetupErrorListener(rendererSetupErrorListener)
            createdMapView.addOnLayoutChangeListener(layoutChangeListener)
            configureMapControls(createdMapView)
            locationController = SaMiMapboxLocationController(createdMapView, diagnostics)
            routeGuidanceController = SaMiRouteGuidanceController(
                context = context,
                mapView = createdMapView,
                onRouteEvent = onRouteChanged,
            )
            mapboxNavigation?.let { routeGuidanceController?.attach(it) }
            voiceGuidanceController.let { controller -> mapboxNavigation?.let(controller::attach) }
            subscribeToMapEvents(createdMapView, mapGeneration)

            // Restore the original native hierarchy: MapView is a direct
            // child of the ExpoView supplied by React Native.
            parent.addView(
                createdMapView,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            // ExpoView opts into Android child layout so this request measures
            // MapView even when its host already completed the first Yoga pass.
            parent.requestLayout()
            parent.invalidate()

            diagnostics.info(
                code = "map_view_created",
                message = "Created Mapbox Maps SDK MapView (generation $mapGeneration) directly inside the ExpoView.",
                surface = config.renderSurface,
            )

            locationController?.update(config)
            syncNavigationState()
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
                routeGuidanceController?.onStyleLoaded()
                styleRetryAttempts = 0
                cancelPendingStyleRetry()
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
                scheduleStyleRetry(nativeMapView, generation)
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
                captureCameraStateForRestore(nativeMapView)
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

    /** Retry transient style/tile request failures without creating duplicate views. */
    private fun scheduleStyleRetry(nativeMapView: MapView, generation: Int) {
        if (styleRetryAttempts >= MAX_STYLE_RETRIES) {
            diagnostics.error(
                code = "map_style_retry_exhausted",
                message = "Mapbox style loading failed after $MAX_STYLE_RETRIES automatic retries. Check connectivity and the configured public Mapbox token.",
                surface = config.renderSurface,
            )
            return
        }

        styleRetryAttempts += 1
        val attempt = styleRetryAttempts
        val delayMs = 1_500L * attempt
        cancelPendingStyleRetry()

        val retry = Runnable {
            pendingStyleRetry = null
            if (disposed || !hostAttached || generation != mapGeneration) return@Runnable
            if (mapView !== nativeMapView || !nativeMapView.isAttachedToWindow) return@Runnable
            if (nativeMapView.width <= 0 || nativeMapView.height <= 0) return@Runnable

            diagnostics.warning(
                code = "map_style_retry",
                message = "Retrying Mapbox style ${config.mapStyleURL} (attempt $attempt of $MAX_STYLE_RETRIES).",
                surface = config.renderSurface,
            )

            styleController?.retryStyle(
                mapView = nativeMapView,
                styleUri = config.mapStyleURL,
                surface = config.renderSurface,
                beforeLoad = {
                    mapLoaded = false
                    firstFrameRendered = false
                    readyDispatched = false
                },
            )
        }

        pendingStyleRetry = retry
        mainHandler.postDelayed(retry, delayMs)
        diagnostics.warning(
            code = "map_style_retry_scheduled",
            message = "Mapbox style loading failed; retry $attempt of $MAX_STYLE_RETRIES is scheduled in ${delayMs}ms.",
            surface = config.renderSurface,
        )
    }

    private fun cancelPendingStyleRetry() {
        pendingStyleRetry?.let { mainHandler.removeCallbacks(it) }
        pendingStyleRetry = null
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

        cancelPendingStyleRetry()
        destroyCurrentMapView()

        diagnostics.info(
            code = "map_view_recreation_deferred",
            message = "Old MapView has been detached and destroyed; replacement is scheduled for the next UI frame.",
            surface = config.renderSurface,
        )

        targetHost.postOnAnimation {
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
     * to deliver native Surface detachment before Mapbox releases it.
     */
    private fun destroyCurrentMapView() {
        cancelPendingStyleRetry()
        subscriptions.forEach { cancelable ->
            runCatching { cancelable.cancel() }
        }
        subscriptions.clear()

        val currentMapView = mapView
        mapView = null
        styleController = null
        locationController?.dispose()
        locationController = null
        routeGuidanceController?.dispose()
        routeGuidanceController = null

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
        styleRetryAttempts = 0
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
        val surface = "texture"
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

    private companion object {
        const val MAX_STYLE_RETRIES = 3
        @Volatile var navigationAppConfigured = false
    }
}
