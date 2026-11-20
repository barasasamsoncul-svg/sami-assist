package com.sami.runner.mapbox

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager

import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner

import com.mapbox.common.Cancelable
import com.mapbox.common.MapboxOptions
import com.mapbox.bindgen.Value
import com.mapbox.common.location.Location as MapboxLocation
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.Style

import com.mapbox.maps.plugin.PuckBearing
import com.mapbox.maps.plugin.attribution.attribution
import com.mapbox.maps.plugin.compass.compass
import com.mapbox.maps.plugin.gestures.gestures
import com.mapbox.maps.plugin.locationcomponent.OnIndicatorAccuracyRadiusChangedListener
import com.mapbox.maps.plugin.locationcomponent.OnIndicatorBearingChangedListener
import com.mapbox.maps.plugin.locationcomponent.OnIndicatorPositionChangedListener
import com.mapbox.maps.plugin.locationcomponent.createDefault2DPuck
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.maps.plugin.logo.logo
import com.mapbox.maps.plugin.scalebar.scalebar
import com.mapbox.maps.plugin.viewport.data.FollowPuckViewportStateBearing
import com.mapbox.maps.plugin.viewport.data.FollowPuckViewportStateOptions
import com.mapbox.maps.plugin.viewport.viewport

import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider

import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class SaMiMapboxView(
    context: Context,
    appContext: AppContext
) : ExpoView(context, appContext) {

    val onMapReady by EventDispatcher()
    val onMapError by EventDispatcher()
    val onCameraChanged by EventDispatcher()
    val onMapTap by EventDispatcher()
    val onLocationChanged by EventDispatcher()
    val onNavigationStatusChanged by EventDispatcher()
    val onRouteChanged by EventDispatcher()
    val onVoiceInstructionChanged by EventDispatcher()

    private var mapView: MapView? = null
    private var routeGuidanceController: SaMiRouteGuidanceController? = null
    private var voiceGuidanceController: SaMiVoiceGuidanceController? = null
    private var routeGuidanceActive = false
    private var voiceGuidanceMuted = false

    private var hasRouteDestination = false
    private var routeDestinationLatitude = 0.0
    private var routeDestinationLongitude = 0.0
    private var routeDestinationLabel = ""
    private var routeProfile = "driving-traffic"

    private var accessToken = ""
    private var mapStyleURL = Style.STANDARD
    private var appliedStyleURL = ""

    private var initialLatitude = -1.2921
    private var initialLongitude = 36.8219
    private var initialZoom = 14.0
    private var initialBearing = 0.0
    private var initialPitch = 0.0

    private var showUserLocation = false
    private var showCompass = true
    private var showScaleBar = false
    private var locationPulsingEnabled = false

    private var screenActive = true
    private var navigationActive = false
    private var cameraMode = "free"
    private var puckBearing = "course"

    private var mapStarted = false
    private var mapResumed = false
    private var mapWasStopped = false
    private var disposed = false
    private var mapLoaded = false

    private var latestPoint: Point? = null
    private var latestBearing: Double? = null
    private var latestAccuracy: Double? = null
    private var latestNavigationLocation: MapboxLocation? = null
    private var latestLocationEnhanced = false

    private var defaultLocationProvider:
        com.mapbox.maps.plugin.locationcomponent.LocationProvider? = null

    private val navigationLocationProvider =
        NavigationLocationProvider()

    private var mapLoadedCancelable: Cancelable? = null
    private var mapErrorCancelable: Cancelable? = null
    private var cameraChangedCancelable: Cancelable? = null

    private var mapLifecycleOwner: LifecycleOwner? = null
    private var mapLifecycleObserver: LifecycleEventObserver? = null

    private var navigationLifecycleOwner: LifecycleOwner? = null
    private var navigationObserverRegistered = false
    private var mapboxNavigation: MapboxNavigation? = null
    private var navigationSessionRunning = false

    private val indicatorPositionListener =
        OnIndicatorPositionChangedListener { point ->
            latestPoint = point
            emitLocation()
        }

    private val indicatorBearingListener =
        OnIndicatorBearingChangedListener { bearing ->
            latestBearing = bearing
            emitLocation()
        }

    private val indicatorAccuracyListener =
        OnIndicatorAccuracyRadiusChangedListener { accuracy ->
            latestAccuracy = accuracy
            emitLocation()
        }

    private val locationObserver = object : LocationObserver {

        override fun onNewRawLocation(
            rawLocation: MapboxLocation
        ) {
            latestNavigationLocation = rawLocation
            latestLocationEnhanced = false
            emitLocation()
        }

        override fun onNewLocationMatcherResult(
            locationMatcherResult: LocationMatcherResult
        ) {
            val enhancedLocation =
                locationMatcherResult.enhancedLocation

            latestNavigationLocation = enhancedLocation

            latestLocationEnhanced =
                !locationMatcherResult.isDegradedMapMatching &&
                !locationMatcherResult.isOffRoad

            navigationLocationProvider.changePosition(
                location = enhancedLocation,
                keyPoints = locationMatcherResult.keyPoints
            )

            latestPoint = Point.fromLngLat(
                enhancedLocation.longitude,
                enhancedLocation.latitude
            )

            latestBearing = enhancedLocation.bearing
            latestAccuracy = enhancedLocation.horizontalAccuracy

            routeGuidanceController?.updateOrigin(
                Point.fromLngLat(
                    enhancedLocation.longitude,
                    enhancedLocation.latitude
                )
            )

            emitLocation()
        }
    }

    private val navigationObserver =
        object : MapboxNavigationObserver {

            override fun onAttached(
                navigation: MapboxNavigation
            ) {
                mapboxNavigation = navigation

                navigation.registerLocationObserver(
                    locationObserver
                )

                voiceGuidanceController?.attach(navigation)
                routeGuidanceController?.attach(navigation)

                syncNavigationSession()
            }

            override fun onDetached(
                navigation: MapboxNavigation
            ) {
                if (navigationSessionRunning) {
                    runCatching {
                        navigation.stopTripSession()
                    }
                }

                navigationSessionRunning = false

                navigation.unregisterLocationObserver(
                    locationObserver
                )

                voiceGuidanceController?.detach()
                routeGuidanceController?.detach()
                routeGuidanceActive = false

                mapboxNavigation = null

                applyLocationSettings()
                emitNavigationStatus()
            }
        }

    init {
        layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        )
    }

    /* ------------------------------------------------------------------ */
    /* EVENT PAYLOAD NORMALIZATION                                        */
    /* ------------------------------------------------------------------ */

    private fun toNativeEventPayload(
        payload: Map<String, Any?>
    ): Map<String, Any> {
        val result = mutableMapOf<String, Any>()

        payload.forEach { (key, value) ->
            if (value != null) {
                result[key] = value
            }
        }

        return result
    }

    /* ------------------------------------------------------------------ */
    /* REACT NATIVE PROPS                                                 */
    /* ------------------------------------------------------------------ */

    fun setAccessToken(value: String) {
        val token = value.trim()

        if (token.isBlank()) {
            reportError(
                "SaMi Mapbox requires EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN."
            )
            return
        }

        accessToken = token
    }

    fun setMapStyle(value: String) {
        mapStyleURL = value.trim().ifBlank {
            Style.STANDARD
        }
    }

    fun setInitialLatitude(value: Double) {
        if (value.isFinite() && value in -90.0..90.0) {
            initialLatitude = value
        }
    }

    fun setInitialLongitude(value: Double) {
        if (value.isFinite() && value in -180.0..180.0) {
            initialLongitude = value
        }
    }

    fun setInitialZoom(value: Double) {
        if (value.isFinite()) {
            initialZoom = value.coerceIn(0.0, 22.0)
        }
    }

    fun setInitialBearing(value: Double) {
        if (value.isFinite()) {
            initialBearing = value
        }
    }

    fun setInitialPitch(value: Double) {
        if (value.isFinite()) {
            initialPitch = value.coerceIn(0.0, 85.0)
        }
    }

    fun setShowUserLocation(value: Boolean) {
        showUserLocation = value
    }

    fun setShowCompass(value: Boolean) {
        showCompass = value
    }

    fun setShowScaleBar(value: Boolean) {
        showScaleBar = value
    }

    fun setLocationPulsingEnabled(value: Boolean) {
        locationPulsingEnabled = value
    }

    fun setScreenActive(value: Boolean) {
        val becameActive = !screenActive && value
        screenActive = value

        /*
         * The native renderer is deliberately not stopped when a
         * React Navigation screen loses focus. When it becomes active
         * again, refresh the JS readiness state using the existing map.
         */
        if (becameActive && mapStarted && mapLoaded) {
            restoreMapAfterStart()
        }
    }

    fun setNavigationActive(value: Boolean) {
        navigationActive = value
        syncNavigationSession()
        applyLocationSettings()
        emitNavigationStatus()
    }

    fun setCameraMode(value: String) {
        cameraMode = when (value) {
            "follow" -> "follow"
            "navigation" -> "navigation"
            else -> "free"
        }

        applyCameraMode()
    }

    fun setPuckBearing(value: String) {
        puckBearing = if (value == "heading") {
            "heading"
        } else {
            "course"
        }

        applyLocationSettings()
    }

    fun setHasRouteDestination(value: Boolean) {
        hasRouteDestination = value
    }

    fun setRouteDestinationLatitude(value: Double) {
        if (value.isFinite() && value in -90.0..90.0) {
            routeDestinationLatitude = value
        }
    }

    fun setRouteDestinationLongitude(value: Double) {
        if (value.isFinite() && value in -180.0..180.0) {
            routeDestinationLongitude = value
        }
    }

    fun setRouteDestinationLabel(value: String) {
        routeDestinationLabel = value.trim()
    }

    fun setRouteProfile(value: String) {
        routeProfile = if (value == "cycling") {
            "cycling"
        } else {
            "driving-traffic"
        }
    }

    fun setVoiceGuidanceMuted(value: Boolean) {
        voiceGuidanceMuted = value
        voiceGuidanceController?.setMuted(value)
    }

    private fun syncRouteDestination() {
        val controller = routeGuidanceController ?: return

        val point = if (
            hasRouteDestination &&
            routeDestinationLatitude.isFinite() &&
            routeDestinationLongitude.isFinite() &&
            routeDestinationLatitude in -90.0..90.0 &&
            routeDestinationLongitude in -180.0..180.0
        ) {
            Point.fromLngLat(
                routeDestinationLongitude,
                routeDestinationLatitude
            )
        } else {
            null
        }

        controller.setDestination(
            point = point,
            label = routeDestinationLabel,
            profile = routeProfile
        )
    }

    /* ------------------------------------------------------------------ */
    /* VIEW INITIALIZATION                                                */
    /* ------------------------------------------------------------------ */

    fun applyUpdatedProps() {
        if (disposed) return

        if (
            screenActive &&
            isAttachedToWindow &&
            accessToken.isNotBlank()
        ) {
            createMapIfNeeded()
        }

        syncMapLifecycle()
        syncRouteDestination()
        syncNavigationLifecycle()
        syncNavigationSession()

        if (!screenActive || !isAttachedToWindow) return

        applyMapStyle()
        applyMapControls()
        applyLocationSettings()
        applyCameraMode()
    }

    private fun createMapIfNeeded() {
        if (mapView != null || disposed) return

        if (accessToken.isBlank()) {
            reportError(
                "Mapbox cannot start because the public access token is missing."
            )
            return
        }

        try {
            MapboxOptions.accessToken = accessToken

            val cameraOptions = CameraOptions.Builder()
                .center(
                    Point.fromLngLat(
                        initialLongitude,
                        initialLatitude
                    )
                )
                .zoom(initialZoom)
                .bearing(initialBearing)
                .pitch(initialPitch)
                .build()

            val mapInitOptions = MapInitOptions(
                context = context,
                cameraOptions = cameraOptions,
                textureView = true,
                styleUri = mapStyleURL
            )

            val nativeMapView = MapView(
                context,
                mapInitOptions
            )

            nativeMapView.layoutParams = LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
            )

            mapView = nativeMapView
            appliedStyleURL = mapStyleURL

            routeGuidanceController = SaMiRouteGuidanceController(
                context = context,
                mapView = nativeMapView,
                onRouteEvent = { event ->
                    val routeStatus = event["status"] as? String

                    if (
                        routeStatus == "requesting" ||
                        routeStatus == "waiting_for_location" ||
                        routeStatus == "idle"
                    ) {
                        voiceGuidanceController?.onRouteChanged()
                    }

                    routeGuidanceActive = routeStatus == "active"

                    onRouteChanged(
                        toNativeEventPayload(event)
                    )

                    emitNavigationStatus()
                }
            )

            voiceGuidanceController = SaMiVoiceGuidanceController(
                context = context,
                onInstructionChanged = { event ->
                    onVoiceInstructionChanged(
                        toNativeEventPayload(event)
                    )
                }
            ).also { controller ->
                controller.setMuted(voiceGuidanceMuted)
            }

            defaultLocationProvider =
                nativeMapView.location.getLocationProvider()

            registerMapEvents(nativeMapView)

            applyMapControls()
            applyLocationSettings()

            addView(nativeMapView)

            if (isAttachedToWindow) {
                syncMapLifecycle()
            }

        } catch (error: Exception) {
            reportError(
                error.message
                    ?: "SaMi Mapbox failed to initialize."
            )
        }
    }

    /* ------------------------------------------------------------------ */
    /* MAP EVENTS                                                         */
    /* ------------------------------------------------------------------ */

    private fun registerMapEvents(
        nativeMapView: MapView
    ) {
        mapLoadedCancelable =
            nativeMapView.mapboxMap.subscribeMapLoaded {
                mapLoaded = true
                mapWasStopped = false
                appliedStyleURL = mapStyleURL

                applyStandardStyleConfiguration(nativeMapView)
                applyLocationSettings()
                applyCameraMode()
                routeGuidanceController?.onStyleLoaded()

                if (screenActive) {
                    onMapReady(
                        mapOf("ready" to true)
                    )
                }

                emitNavigationStatus()
            }

        mapErrorCancelable =
            nativeMapView.mapboxMap.subscribeMapLoadingError {
                error ->
                reportError(
                    error.message
                        ?: "Mapbox encountered a map-loading error."
                )
            }

        cameraChangedCancelable =
            nativeMapView.mapboxMap.subscribeCameraChanged {
                event ->

                val camera = event.cameraState

                onCameraChanged(
                    mapOf(
                        "latitude" to camera.center.latitude(),
                        "longitude" to camera.center.longitude(),
                        "zoom" to camera.zoom,
                        "bearing" to camera.bearing,
                        "pitch" to camera.pitch
                    )
                )
            }

        nativeMapView.gestures.addOnMapClickListener {
            point ->

            if (screenActive) {
                onMapTap(
                    mapOf(
                        "latitude" to point.latitude(),
                        "longitude" to point.longitude()
                    )
                )
            }

            true
        }

        nativeMapView.location.addOnIndicatorPositionChangedListener(
            indicatorPositionListener
        )

        nativeMapView.location.addOnIndicatorBearingChangedListener(
            indicatorBearingListener
        )

        nativeMapView.location.addOnIndicatorAccuracyRadiusChangedListener(
            indicatorAccuracyListener
        )
    }

    /* ------------------------------------------------------------------ */
    /* MAP STYLE                                                          */
    /* ------------------------------------------------------------------ */

    private fun applyMapStyle() {
        val nativeMapView = mapView ?: return

        if (appliedStyleURL == mapStyleURL) return

        appliedStyleURL = mapStyleURL
        mapLoaded = false

        try {
            nativeMapView.mapboxMap.loadStyle(mapStyleURL) {
                mapLoaded = true
                mapWasStopped = false
                appliedStyleURL = mapStyleURL

                applyStandardStyleConfiguration(nativeMapView)
                applyMapControls()
                applyLocationSettings()
                applyCameraMode()
                routeGuidanceController?.onStyleLoaded()

                if (screenActive) {
                    onMapReady(
                        mapOf("ready" to true)
                    )
                }
            }
        } catch (error: Exception) {
            reportError(
                error.message
                    ?: "The selected Mapbox style could not be loaded."
            )
        }
    }

    private fun restoreMapAfterStart() {
        val nativeMapView = mapView ?: return

        try {
            val currentStyle = nativeMapView.mapboxMap.style

            if (currentStyle == null) {
                /*
                 * Do not duplicate the initial MapInitOptions style load.
                 * Reload only when a previously running MapView was stopped
                 * and its style is no longer available.
                 */
                if (mapWasStopped) {
                    mapWasStopped = false
                    mapLoaded = false
                    appliedStyleURL = ""
                    applyMapStyle()
                }

                return
            }

            mapWasStopped = false
            mapLoaded = true

            if (appliedStyleURL != mapStyleURL) {
                appliedStyleURL = ""
                applyMapStyle()
                return
            }

            applyStandardStyleConfiguration(nativeMapView)
            applyMapControls()
            applyLocationSettings()
            applyCameraMode()
            routeGuidanceController?.onStyleLoaded()

            if (screenActive) {
                onMapReady(
                    mapOf("ready" to true)
                )
            }

        } catch (error: Exception) {
            reportError(
                error.message
                    ?: "Mapbox could not restore the map after reactivation."
            )
        }
    }

    /* ------------------------------------------------------------------ */
    /* MAP CONTROLS                                                       */
    /* ------------------------------------------------------------------ */

    private fun applyStandardStyleConfiguration(nativeMapView: MapView) {
        if (mapStyleURL != "mapbox://styles/mapbox/standard") return

        nativeMapView.mapboxMap.getStyle { style ->
            val settings = listOf(
                "lightPreset" to Value.valueOf("day"),
                "theme" to Value.valueOf("default"),
                "showPlaceLabels" to Value.valueOf(true),
                "showRoadLabels" to Value.valueOf(true),
                "showPointOfInterestLabels" to Value.valueOf(true),
                "showTransitLabels" to Value.valueOf(true),
                "showPedestrianRoads" to Value.valueOf(true),
                "showHdRoads" to Value.valueOf(true),
                "show3dObjects" to Value.valueOf(false),
                "show3dBuildings" to Value.valueOf(false),
                "show3dLandmarks" to Value.valueOf(false),
                "show3dTrees" to Value.valueOf(false),
                "showLandmarkIcons" to Value.valueOf(true),
                "showLandmarkIconLabels" to Value.valueOf(true),
                "showAdminBoundaries" to Value.valueOf(true),
                "densityPointOfInterestLabels" to Value.valueOf(2.0),
            )

            settings.forEach { (key, value) ->
                runCatching {
                    style.setStyleImportConfigProperty("basemap", key, value)
                }
            }
        }
    }

    private fun applyMapControls() {
        val nativeMapView = mapView ?: return

        nativeMapView.compass.enabled = showCompass
        nativeMapView.scalebar.enabled = showScaleBar

        nativeMapView.logo.enabled = true
        nativeMapView.attribution.enabled = true
    }

    /* ------------------------------------------------------------------ */
    /* LOCATION                                                           */
    /* ------------------------------------------------------------------ */

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        return fine || coarse
    }

    private fun applyLocationSettings() {
        val nativeMapView = mapView ?: return

        val permitted = hasLocationPermission()

        try {
            nativeMapView.location.locationPuck =
                createDefault2DPuck(withBearing = true)

            nativeMapView.location.puckBearing =
                if (puckBearing == "heading") {
                    PuckBearing.HEADING
                } else {
                    PuckBearing.COURSE
                }

            nativeMapView.location.puckBearingEnabled = true

            nativeMapView.location.pulsingEnabled =
                locationPulsingEnabled

            nativeMapView.location.enabled =
                showUserLocation && permitted

            if (
                showUserLocation &&
                !permitted &&
                navigationActive
            ) {
                reportError(
                    "Location permission is required for live navigation."
                )
            }

        } catch (error: Exception) {
            reportError(
                error.message
                    ?: "Mapbox location could not be configured."
            )
        }
    }

    private fun emitLocation() {
        val point = latestPoint ?: return
        val navLocation = latestNavigationLocation

        val locationEvent = mutableMapOf<String, Any>(
            "latitude" to point.latitude(),
            "longitude" to point.longitude(),
            "timestamp" to (
                navLocation?.timestamp ?: System.currentTimeMillis()
            ),
            "enhanced" to latestLocationEnhanced
        )

        (navLocation?.bearing ?: latestBearing)?.let { bearing ->
            locationEvent["bearing"] = bearing
        }

        navLocation?.speed?.let { speed ->
            locationEvent["speedMetersPerSecond"] = speed
        }

        (navLocation?.horizontalAccuracy ?: latestAccuracy)?.let {
            accuracy ->
            locationEvent["horizontalAccuracyMeters"] = accuracy
        }

        onLocationChanged(locationEvent)
    }

    /* ------------------------------------------------------------------ */
    /* NAVIGATION SDK LIFECYCLE                                           */
    /* ------------------------------------------------------------------ */

    private fun shouldAttachNavigationLifecycle(): Boolean {
        if (disposed || !isAttachedToWindow) return false

        return navigationActive ||
            (screenActive && hasRouteDestination)
    }

    private fun syncNavigationLifecycle() {
        if (shouldAttachNavigationLifecycle()) {
            attachNavigationLifecycle()
            return
        }

        if (
            navigationLifecycleOwner != null ||
            navigationObserverRegistered ||
            mapboxNavigation != null
        ) {
            releaseNavigationLifecycle()
        }
    }

    private fun attachNavigationLifecycle() {
        if (navigationLifecycleOwner != null) return

        val owner = appContext.currentActivity as? LifecycleOwner
            ?: return

        try {
            if (!MapboxNavigationApp.isSetup()) {
                MapboxNavigationApp.setup {
                    NavigationOptions.Builder(
                        context.applicationContext
                    ).build()
                }
            }

            MapboxNavigationApp.registerObserver(
                navigationObserver
            )

            navigationObserverRegistered = true

            MapboxNavigationApp.attach(owner)

            navigationLifecycleOwner = owner

        } catch (error: Exception) {
            if (navigationObserverRegistered) {
                runCatching {
                    MapboxNavigationApp.unregisterObserver(
                        navigationObserver
                    )
                }
            }

            navigationObserverRegistered = false

            reportError(
                error.message
                    ?: "Mapbox Navigation could not attach to the Runner lifecycle."
            )
        }
    }

    private fun releaseNavigationLifecycle() {
        val owner = navigationLifecycleOwner

        voiceGuidanceController?.detach()
        routeGuidanceController?.detach()
        routeGuidanceActive = false

        if (navigationSessionRunning) {
            runCatching {
                mapboxNavigation?.stopTripSession()
            }
        }

        navigationSessionRunning = false

        if (navigationObserverRegistered) {
            runCatching {
                MapboxNavigationApp.unregisterObserver(
                    navigationObserver
                )
            }
        }

        navigationObserverRegistered = false

        if (owner != null) {
            runCatching {
                MapboxNavigationApp.detach(owner)
            }
        }

        navigationLifecycleOwner = null
        mapboxNavigation = null

        latestNavigationLocation = null
        latestLocationEnhanced = false

        applyLocationSettings()
        emitNavigationStatus()
    }

    private fun syncNavigationSession() {
        val navigation = mapboxNavigation ?: return

        try {
            if (navigationActive) {
                if (!hasLocationPermission()) {
                    reportError(
                        "Grant location permission before starting the navigation session."
                    )
                    return
                }

                if (!navigationSessionRunning) {
                    navigation.startTripSession()
                    navigationSessionRunning = true

                    mapView?.location?.setLocationProvider(
                        navigationLocationProvider
                    )
                }

            } else if (navigationSessionRunning) {
                navigation.stopTripSession()
                navigationSessionRunning = false

                defaultLocationProvider?.let { provider ->
                    mapView?.location?.setLocationProvider(
                        provider
                    )
                }

                latestNavigationLocation = null
                latestLocationEnhanced = false
            }

            applyLocationSettings()
            emitNavigationStatus()

        } catch (error: Exception) {
            navigationSessionRunning = false

            reportError(
                error.message
                    ?: "Mapbox could not update the navigation session."
            )

            emitNavigationStatus()
        }
    }

    private fun emitNavigationStatus() {
        val active = navigationSessionRunning

        val mode = when {
            !active -> "idle"
            routeGuidanceActive -> "active_guidance"
            else -> "free_drive"
        }

        onNavigationStatusChanged(
            mapOf(
                "active" to active,
                "mode" to mode
            )
        )
    }

    /* ------------------------------------------------------------------ */
    /* CAMERA                                                             */
    /* ------------------------------------------------------------------ */

    private fun applyCameraMode() {
        val nativeMapView = mapView ?: return
        if (!mapLoaded) return

        try {
            when (cameraMode) {

                "follow" -> {
                    val options =
                        FollowPuckViewportStateOptions.Builder()
                            .zoom(16.5)
                            .pitch(0.0)
                            .bearing(
                                FollowPuckViewportStateBearing.Constant(
                                    0.0
                                )
                            )
                            .build()

                    nativeMapView.viewport.transitionTo(
                        nativeMapView.viewport
                            .makeFollowPuckViewportState(options),
                        nativeMapView.viewport
                            .makeDefaultViewportTransition()
                    )
                }

                "navigation" -> {
                    val density =
                        resources.displayMetrics.density

                    val options =
                        FollowPuckViewportStateOptions.Builder()
                            .zoom(17.0)
                            .pitch(0.0)
                            .bearing(
                                FollowPuckViewportStateBearing.SyncWithLocationPuck
                            )
                            .padding(
                                EdgeInsets(
                                    130.0 * density,
                                    0.0,
                                    280.0 * density,
                                    0.0
                                )
                            )
                            .build()

                    nativeMapView.viewport.transitionTo(
                        nativeMapView.viewport
                            .makeFollowPuckViewportState(options),
                        nativeMapView.viewport
                            .makeDefaultViewportTransition()
                    )
                }

                else -> {
                    nativeMapView.viewport.idle()
                }
            }

        } catch (error: Exception) {
            reportError(
                error.message
                    ?: "Mapbox camera mode could not be applied."
            )
        }
    }

    /* ------------------------------------------------------------------ */
    /* MAP VIEW LIFECYCLE                                                 */
    /* ------------------------------------------------------------------ */

    private fun shouldRunMap(): Boolean {
        /*
         * Dashboard focus does not control the native renderer.
         * The MapView remains bound to the host Activity lifecycle while
         * its native parent is attached, even when another app screen is
         * temporarily focused.
         */
        return !disposed &&
            isAttachedToWindow &&
            mapView != null
    }

    private fun syncMapLifecycle() {
        if (shouldRunMap()) {
            attachMapLifecycle()
        } else {
            detachMapLifecycle()
        }
    }

    /**
     * MapView can be created after the Activity has already reached RESUMED.
     * Registering a LifecycleEventObserver synchronizes it to the Activity's
     * current state, delivering ON_START and ON_RESUME when appropriate.
     * This forwards the real host lifecycle instead of only starting the
     * renderer when the ExpoView happens to attach to its window.
     */
    private fun attachMapLifecycle() {
        if (!shouldRunMap()) return

        val owner = appContext.currentActivity as? LifecycleOwner
        if (owner == null) {
            reportError(
                "Mapbox could not connect to the Runner Activity lifecycle."
            )
            return
        }

        if (
            mapLifecycleOwner === owner &&
            mapLifecycleObserver != null
        ) {
            return
        }

        detachMapLifecycle()

        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> startMap()
                Lifecycle.Event.ON_RESUME -> resumeMap()
                Lifecycle.Event.ON_STOP -> stopMap()
                Lifecycle.Event.ON_DESTROY -> stopMap()
                else -> Unit
            }
        }

        mapLifecycleOwner = owner
        mapLifecycleObserver = observer

        owner.lifecycle.addObserver(observer)
    }

    private fun detachMapLifecycle() {
        val owner = mapLifecycleOwner
        val observer = mapLifecycleObserver

        if (owner != null && observer != null) {
            owner.lifecycle.removeObserver(observer)
        }

        mapLifecycleOwner = null
        mapLifecycleObserver = null

        stopMap()
    }

    private fun startMap() {
        val nativeMapView = mapView ?: return
        if (mapStarted || !shouldRunMap()) return

        try {
            nativeMapView.onStart()
            mapStarted = true

            restoreMapAfterStart()

        } catch (error: Exception) {
            reportError(
                error.message ?: "Mapbox could not start."
            )
        }
    }

    /**
     * Mapbox Maps SDK v11 requires onResume() to be forwarded from the host
     * Activity. The view may be instantiated after that Activity callback,
     * so the lifecycle observer must bring the new MapView into the Activity's
     * current RESUMED state.
     */
    private fun resumeMap() {
        val nativeMapView = mapView ?: return
        if (!shouldRunMap()) return

        if (!mapStarted) {
            startMap()
        }

        if (mapResumed) return

        try {
            nativeMapView.onResume()
            mapResumed = true
        } catch (error: Exception) {
            reportError(
                error.message ?: "Mapbox could not resume."
            )
        }
    }

    private fun stopMap() {
        val nativeMapView = mapView ?: run {
            mapStarted = false
            mapResumed = false
            return
        }

        if (!mapStarted) {
            mapResumed = false
            return
        }

        runCatching {
            nativeMapView.onStop()
        }

        mapStarted = false
        mapResumed = false
        mapWasStopped = true
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()

        disposed = false

        if (
            screenActive &&
            accessToken.isNotBlank()
        ) {
            createMapIfNeeded()
        }

        syncMapLifecycle()
        syncNavigationLifecycle()
        syncNavigationSession()
    }

    override fun onDetachedFromWindow() {
        detachMapLifecycle()
        releaseNavigationLifecycle()

        super.onDetachedFromWindow()
    }

    fun dispose() {
        if (disposed) return

        disposed = true

        voiceGuidanceController?.dispose()
        voiceGuidanceController = null

        routeGuidanceController?.dispose()
        routeGuidanceController = null
        routeGuidanceActive = false

        releaseNavigationLifecycle()
        detachMapLifecycle()

        mapLoadedCancelable?.cancel()
        mapErrorCancelable?.cancel()
        cameraChangedCancelable?.cancel()

        mapLoadedCancelable = null
        mapErrorCancelable = null
        cameraChangedCancelable = null

        mapView?.let { nativeMapView ->
            runCatching {
                nativeMapView.location.removeOnIndicatorPositionChangedListener(
                    indicatorPositionListener
                )

                nativeMapView.location.removeOnIndicatorBearingChangedListener(
                    indicatorBearingListener
                )

                nativeMapView.location.removeOnIndicatorAccuracyRadiusChangedListener(
                    indicatorAccuracyListener
                )

                nativeMapView.location.enabled = false

                nativeMapView.onDestroy()
            }

            removeView(nativeMapView)
        }

        mapView = null
        mapLoaded = false
        mapStarted = false
        mapResumed = false
        mapWasStopped = false
    }

    /* ------------------------------------------------------------------ */
    /* ERRORS                                                             */
    /* ------------------------------------------------------------------ */

    private fun reportError(message: String) {
        onMapError(
            mapOf(
                "message" to message
            )
        )
    }
}

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
                "onVoiceInstructionChanged"
            )

            Prop("accessToken", "") {
                    view: SaMiMapboxView,
                    value: String ->
                view.setAccessToken(value)
            }

            Prop("mapStyleURL", Style.STANDARD) {
                    view: SaMiMapboxView,
                    value: String ->
                view.setMapStyle(value)
            }

            Prop("initialLatitude", -1.2921) {
                    view: SaMiMapboxView,
                    value: Double ->
                view.setInitialLatitude(value)
            }

            Prop("initialLongitude", 36.8219) {
                    view: SaMiMapboxView,
                    value: Double ->
                view.setInitialLongitude(value)
            }

            Prop("initialZoom", 14.0) {
                    view: SaMiMapboxView,
                    value: Double ->
                view.setInitialZoom(value)
            }

            Prop("initialBearing", 0.0) {
                    view: SaMiMapboxView,
                    value: Double ->
                view.setInitialBearing(value)
            }

            Prop("initialPitch", 0.0) {
                    view: SaMiMapboxView,
                    value: Double ->
                view.setInitialPitch(value)
            }

            Prop("showUserLocation", false) {
                    view: SaMiMapboxView,
                    value: Boolean ->
                view.setShowUserLocation(value)
            }

            Prop("showCompass", true) {
                    view: SaMiMapboxView,
                    value: Boolean ->
                view.setShowCompass(value)
            }

            Prop("showScaleBar", false) {
                    view: SaMiMapboxView,
                    value: Boolean ->
                view.setShowScaleBar(value)
            }

            Prop("screenActive", true) {
                    view: SaMiMapboxView,
                    value: Boolean ->
                view.setScreenActive(value)
            }

            Prop("navigationActive", false) {
                    view: SaMiMapboxView,
                    value: Boolean ->
                view.setNavigationActive(value)
            }

            Prop("cameraMode", "free") {
                    view: SaMiMapboxView,
                    value: String ->
                view.setCameraMode(value)
            }

            Prop("puckBearing", "course") {
                    view: SaMiMapboxView,
                    value: String ->
                view.setPuckBearing(value)
            }

            Prop("locationPulsingEnabled", false) {
                    view: SaMiMapboxView,
                    value: Boolean ->
                view.setLocationPulsingEnabled(value)
            }

            Prop("hasRouteDestination", false) {
                    view: SaMiMapboxView,
                    value: Boolean ->
                view.setHasRouteDestination(value)
            }

            Prop("routeDestinationLatitude", 0.0) {
                    view: SaMiMapboxView,
                    value: Double ->
                view.setRouteDestinationLatitude(value)
            }

            Prop("routeDestinationLongitude", 0.0) {
                    view: SaMiMapboxView,
                    value: Double ->
                view.setRouteDestinationLongitude(value)
            }

            Prop("routeDestinationLabel", "") {
                    view: SaMiMapboxView,
                    value: String ->
                view.setRouteDestinationLabel(value)
            }

            Prop("routeProfile", "driving-traffic") {
                    view: SaMiMapboxView,
                    value: String ->
                view.setRouteProfile(value)
            }

            Prop("voiceGuidanceMuted", false) {
                    view: SaMiMapboxView,
                    value: Boolean ->
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