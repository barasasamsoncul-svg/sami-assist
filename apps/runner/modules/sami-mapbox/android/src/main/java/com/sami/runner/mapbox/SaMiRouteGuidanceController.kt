
package com.sami.runner.mapbox

import android.content.Context
import android.graphics.Color

import com.mapbox.api.directions.v5.DirectionsCriteria
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.geojson.Point
import com.mapbox.maps.MapView
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.base.route.RouterOrigin
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.directions.session.RoutesUpdatedResult
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineApiOptions
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineViewOptions
import com.mapbox.navigation.ui.maps.route.line.model.RouteLineColorResources

/**
 * Manages real Mapbox Navigation SDK route guidance for SaMi Runner.
 *
 * Responsibilities:
 * - Calculate road-network routes.
 * - Activate Navigation SDK routes.
 * - Render primary and alternative routes.
 * - Update the route line as the runner moves.
 * - Observe route progress and SDK rerouting.
 */
internal class SaMiRouteGuidanceController(
    context: Context,
    private val mapView: MapView,
    private val onRouteEvent: (Map<String, Any?>) -> Unit,
) {

    private val routeLineApi = MapboxRouteLineApi(
        MapboxRouteLineApiOptions.Builder()
            .vanishingRouteLineEnabled(true)
            .build()
    )

    private val routeLineView = MapboxRouteLineView(
        MapboxRouteLineViewOptions.Builder(context)
            .routeLineColorResources(
                RouteLineColorResources.Builder()
                    // SaMi primary route and casing stay in the brand blue/navy palette.
                    .routeDefaultColor(Color.parseColor("#287DFF"))
                    .routeCasingColor(Color.parseColor("#00143D"))
                    .routeLineTraveledColor(Color.parseColor("#75B5FF"))
                    // Traffic remains legible without Mapbox's default green/red palette.
                    .routeLowCongestionColor(Color.parseColor("#4A9BFF"))
                    .routeModerateCongestionColor(Color.parseColor("#287DFF"))
                    .routeHeavyCongestionColor(Color.parseColor("#1B60CF"))
                    .routeSevereCongestionColor(Color.parseColor("#123F91"))
                    .routeUnknownCongestionColor(Color.parseColor("#287DFF"))
                    // Alternative routes and their traffic states stay in the SaMi blue family.
                    .alternativeRouteDefaultColor(Color.parseColor("#8ABEFF"))
                    .alternativeRouteCasingColor(Color.parseColor("#17345E"))
                    .alternativeRouteLowCongestionColor(Color.parseColor("#9CCAFF"))
                    .alternativeRouteModerateCongestionColor(Color.parseColor("#82B9FA"))
                    .alternativeRouteHeavyCongestionColor(Color.parseColor("#689DE6"))
                    .alternativeRouteSevereCongestionColor(Color.parseColor("#4B7FC9"))
                    .alternativeRouteUnknownCongestionColor(Color.parseColor("#8ABEFF"))
                    .build(),
            )
            .displaySoftGradientForTraffic(true)
            .softGradientTransition(24.0)
            .routeLineBelowLayerId("road-label-navigation")
            .build()
    )

    private var navigation: MapboxNavigation? = null

    private var destination: Point? = null
    private var destinationLabel = ""

    private var routingProfile =
        DirectionsCriteria.PROFILE_DRIVING_TRAFFIC

    private var latestOrigin: Point? = null
    private var latestRoutes: List<NavigationRoute> = emptyList()

    private var pendingRouteRequestId: Long? = null

    private var requestGeneration = 0
    private var lastRequestAttemptAt = 0L

    private var observersRegistered = false
    private var disposed = false
    private var routeActive = false

    val isGuidanceActive: Boolean
        get() = routeActive

    /* ------------------------------------------------------------------ */
    /* ROUTE OBSERVER                                                     */
    /* ------------------------------------------------------------------ */

    private val routesObserver = object : RoutesObserver {

        override fun onRoutesChanged(
            result: RoutesUpdatedResult
        ) {
            if (disposed) return

            val routes = result.navigationRoutes

            if (routes.isEmpty()) {
                latestRoutes = emptyList()
                routeActive = false

                clearRenderedRoute()

                emitRouteEvent(
                    status = if (destination == null) {
                        "idle"
                    } else {
                        "waiting_for_location"
                    }
                )

                return
            }

            latestRoutes = routes
            routeActive = true

            renderRoutes(routes)

            emitRouteEvent(
                status = "active"
            )
        }
    }

    /* ------------------------------------------------------------------ */
    /* ROUTE PROGRESS                                                     */
    /* ------------------------------------------------------------------ */

    private val routeProgressObserver =
        RouteProgressObserver { progress ->

            if (disposed) return@RouteProgressObserver

            routeLineApi.updateWithRouteProgress(progress) { update ->

                mapView.post {
                    if (disposed) return@post

                    mapView.mapboxMap.style?.let { style ->
                        routeLineView.renderRouteLineUpdate(
                            style,
                            update
                        )
                        routeLineView.showTraffic(style)
                    }
                }
            }

            val currentStepProgress =
                progress.currentLegProgress?.currentStepProgress

            val bannerInstructions =
                progress.bannerInstructions

            onRouteEvent(
                mapOf(
                    "status" to "active",
                    "destinationLabel" to destinationLabel,

                    // Whole-route progress.
                    "distanceRemainingMeters" to
                        progress.distanceRemaining,
                    "durationRemainingSeconds" to
                        progress.durationRemaining,
                    "fractionTraveled" to
                        progress.fractionTraveled,

                    // Current maneuver / step progress.
                    "nextInstruction" to
                        bannerInstructions?.primary()?.text(),
                    "secondaryInstruction" to
                        bannerInstructions?.secondary()?.text(),
                    "stepDistanceRemainingMeters" to
                        currentStepProgress?.distanceRemaining,
                    "stepDurationRemainingSeconds" to
                        currentStepProgress?.durationRemaining,
                    "stepFractionTraveled" to
                        currentStepProgress?.fractionTraveled,

                    "routeProgressState" to
                        progress.currentState.name
                )
            )
        }

    /* ------------------------------------------------------------------ */
    /* ATTACH NAVIGATION                                                  */
    /* ------------------------------------------------------------------ */

    fun attach(
        mapboxNavigation: MapboxNavigation
    ) {
        if (disposed) return

        if (
            navigation === mapboxNavigation &&
            observersRegistered
        ) {
            return
        }

        detach()

        navigation = mapboxNavigation

        mapboxNavigation.registerRoutesObserver(
            routesObserver
        )

        mapboxNavigation.registerRouteProgressObserver(
            routeProgressObserver
        )

        observersRegistered = true

        // Use the explicit Navigation SDK API accessor.
        val existingRoutes =
            mapboxNavigation.getNavigationRoutes()

        if (existingRoutes.isNotEmpty()) {
            latestRoutes = existingRoutes
            routeActive = true

            renderRoutes(existingRoutes)
        } else {
            routeActive = false
            requestRouteWhenReady()
        }
    }

    /* ------------------------------------------------------------------ */
    /* LIVE LOCATION                                                      */
    /* ------------------------------------------------------------------ */

    fun updateOrigin(point: Point) {
        if (disposed) return

        latestOrigin = point

        /*
         * Update the vanishing route line so the traveled portion
         * disappears behind the runner's current map position.
         */
        if (routeActive) {
            val update =
                routeLineApi.updateTraveledRouteLine(point)

            mapView.post {
                if (disposed) return@post

                mapView.mapboxMap.style?.let { style ->
                    routeLineView.renderRouteLineUpdate(
                        style,
                        update
                    )
                }
            }
        }

        /*
         * The Navigation SDK manages rerouting after guidance
         * becomes active. This call also starts the initial
         * route request once an origin becomes available.
         */
        requestRouteWhenReady()
    }

    /* ------------------------------------------------------------------ */
    /* DESTINATION                                                        */
    /* ------------------------------------------------------------------ */

    fun setDestination(
        point: Point?,
        label: String,
        profile: String,
    ) {
        if (disposed) return

        val normalizedProfile = when (profile) {
            DirectionsCriteria.PROFILE_CYCLING ->
                DirectionsCriteria.PROFILE_CYCLING

            else ->
                DirectionsCriteria.PROFILE_DRIVING_TRAFFIC
        }

        val unchanged =
            destination?.latitude() == point?.latitude() &&
            destination?.longitude() == point?.longitude() &&
            routingProfile == normalizedProfile

        destinationLabel = label.trim()

        if (unchanged) return

        requestGeneration += 1

        cancelPendingRequest()

        destination = point
        routingProfile = normalizedProfile

        routeActive = false
        latestRoutes = emptyList()
        lastRequestAttemptAt = 0L

        /*
         * Replacing the current destination invalidates the
         * previous Navigation SDK route.
         */
        navigation?.setNavigationRoutes(emptyList())

        clearRenderedRoute()

        if (point == null) {
            emitRouteEvent("idle")
            return
        }

        emitRouteEvent("waiting_for_location")

        requestRouteWhenReady()
    }

    /* ------------------------------------------------------------------ */
    /* MAP STYLE                                                          */
    /* ------------------------------------------------------------------ */

    fun onStyleLoaded() {
        if (disposed) return

        val style = mapView.mapboxMap.style ?: return

        routeLineView.initializeLayers(style)

        if (latestRoutes.isNotEmpty()) {
            renderRoutes(latestRoutes)
        } else {
            requestRouteWhenReady()
        }
    }

    /* ------------------------------------------------------------------ */
    /* RENDER ROUTES                                                      */
    /* ------------------------------------------------------------------ */

    private fun renderRoutes(
        routes: List<NavigationRoute>
    ) {
        val currentNavigation = navigation ?: return
        if (disposed || routes.isEmpty()) return

        val alternativesMetadata =
            currentNavigation.getAlternativeMetadataFor(routes)

        routeLineApi.setNavigationRoutes(
            routes,
            alternativesMetadata
        ) { drawData ->

            mapView.post {
                if (disposed) return@post

                mapView.mapboxMap.style?.let { style ->
                    routeLineView.renderRouteDrawData(
                        style,
                        drawData
                    )
                    // Mapbox Navigation 3.35 requires explicit visibility after route redraw.
                    routeLineView.showTraffic(style)
                }
            }
        }
    }

    private fun clearRenderedRoute() {
        if (disposed) return

        routeLineApi.clearRouteLine { clearData ->

            mapView.post {
                if (disposed) return@post

                mapView.mapboxMap.style?.let { style ->
                    routeLineView.renderClearRouteLineValue(
                        style,
                        clearData
                    )
                }
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* ROUTE REQUEST                                                      */
    /* ------------------------------------------------------------------ */

    private fun requestRouteWhenReady() {
        if (disposed) return
        if (destination == null) return
        if (routeActive) return
        if (pendingRouteRequestId != null) return

        val currentNavigation = navigation ?: return
        val origin = latestOrigin ?: return
        val target = destination ?: return

        val now = System.currentTimeMillis()

        /*
         * Prevent repeated route requests when the routing
         * service is temporarily unavailable.
         */
        if (
            lastRequestAttemptAt > 0L &&
            now - lastRequestAttemptAt < ROUTE_RETRY_INTERVAL_MS
        ) {
            return
        }

        lastRequestAttemptAt = now

        val generation = requestGeneration

        emitRouteEvent("requesting")

        val routeOptions = RouteOptions.builder()
            .applyDefaultNavigationOptions()
            .profile(routingProfile)
            .coordinatesList(
                listOf(
                    origin,
                    target
                )
            )
            /*
             * Request the data needed for full turn-by-turn guidance:
             * - step geometry and turn instructions
             * - visual banner maneuver instructions
             * - spoken voice instructions
             * - metric distances for runners in Kenya
             * - English maneuver text and speech
             */
            .steps(true)
            .bannerInstructions(true)
            .voiceInstructions(true)
            .voiceUnits(DirectionsCriteria.METRIC)
            .language("en")
            .alternatives(true)
            .build()

        val requestId = currentNavigation.requestRoutes(
            routeOptions,
            object : NavigationRouterCallback {

                override fun onRoutesReady(
                    routes: List<NavigationRoute>,
                    @RouterOrigin routerOrigin: String
                ) {
                    if (
                        disposed ||
                        generation != requestGeneration ||
                        navigation !== currentNavigation
                    ) {
                        return
                    }

                    pendingRouteRequestId = null

                    if (routes.isEmpty()) {
                        routeActive = false
                        latestRoutes = emptyList()

                        emitRouteEvent(
                            status = "error",
                            message = "Mapbox returned no usable route."
                        )

                        return
                    }

                    /*
                     * Setting the returned routes activates
                     * Navigation SDK guidance when the trip
                     * session is running.
                     */
                    currentNavigation.setNavigationRoutes(
                        routes
                    )
                }

                override fun onFailure(
                    reasons: List<RouterFailure>,
                    routeOptions: RouteOptions
                ) {
                    if (
                        disposed ||
                        generation != requestGeneration
                    ) {
                        return
                    }

                    pendingRouteRequestId = null
                    routeActive = false
                    latestRoutes = emptyList()

                    emitRouteEvent(
                        status = "error",
                        message = "Mapbox could not calculate a route. Check your connection and destination."
                    )
                }

                override fun onCanceled(
                    routeOptions: RouteOptions,
                    @RouterOrigin routerOrigin: String
                ) {
                    if (
                        disposed ||
                        generation != requestGeneration
                    ) {
                        return
                    }

                    pendingRouteRequestId = null

                    emitRouteEvent(
                        status = if (destination == null) {
                            "idle"
                        } else {
                            "waiting_for_location"
                        }
                    )
                }
            }
        )

        pendingRouteRequestId = requestId
    }

    /* ------------------------------------------------------------------ */
    /* CANCEL REQUEST                                                     */
    /* ------------------------------------------------------------------ */

    private fun cancelPendingRequest() {
        val requestId = pendingRouteRequestId
            ?: return

        pendingRouteRequestId = null

        runCatching {
            navigation?.cancelRouteRequest(requestId)
        }
    }

    /* ------------------------------------------------------------------ */
    /* LIFECYCLE                                                          */
    /* ------------------------------------------------------------------ */

    fun detach() {
        cancelPendingRequest()

        val currentNavigation = navigation

        if (
            currentNavigation != null &&
            observersRegistered
        ) {
            runCatching {
                currentNavigation.unregisterRoutesObserver(
                    routesObserver
                )

                currentNavigation.unregisterRouteProgressObserver(
                    routeProgressObserver
                )
            }
        }

        observersRegistered = false
        navigation = null
    }

    fun dispose() {
        if (disposed) return

        disposed = true
        requestGeneration += 1

        detach()

        runCatching {
            routeLineApi.cancel()
            routeLineView.cancel()
        }

        destination = null
        latestOrigin = null
        latestRoutes = emptyList()
        routeActive = false
    }

    /* ------------------------------------------------------------------ */
    /* EVENTS                                                             */
    /* ------------------------------------------------------------------ */

    private fun emitRouteEvent(
        status: String,
        message: String? = null,
    ) {
        onRouteEvent(
            mapOf(
                "status" to status,
                "destinationLabel" to destinationLabel,
                "message" to message
            )
        )
    }

    private companion object {
        const val ROUTE_RETRY_INTERVAL_MS = 30_000L
    }
}
