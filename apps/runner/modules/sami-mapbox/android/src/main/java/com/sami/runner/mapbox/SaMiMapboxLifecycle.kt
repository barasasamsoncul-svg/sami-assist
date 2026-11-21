package com.sami.runner.mapbox

import android.content.ComponentCallbacks2
import android.content.res.Configuration

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner

import com.mapbox.maps.MapView

/**
 * The single lifecycle owner for SaMi's native MapView.
 *
 * SaMiMapboxRenderer supplies an explicit Mapbox plugin list that excludes
 * MAPBOX_LIFECYCLE_PLUGIN_ID. This class is therefore the only code allowed
 * to forward onStart(), onResume(), onStop() and onLowMemory() to MapView.
 *
 * It also detaches from the Activity when the Expo host view leaves the window,
 * and reattaches when that same native host returns.
 */
internal class SaMiMapboxLifecycle(
    private val activityProvider: () -> LifecycleOwner?,
    private val mapViewProvider: () -> MapView?,
    private val diagnostics: SaMiMapboxDiagnostics,
    private val onStopped: () -> Unit,
    private val onResumed: () -> Unit,
) {
    private var owner: LifecycleOwner? = null
    private var observer: LifecycleEventObserver? = null
    private var componentCallbacks: ComponentCallbacks2? = null
    private var mapStarted = false
    private var mapResumed = false

    fun attach() {
        val currentOwner = activityProvider()
        val mapView = mapViewProvider()

        if (currentOwner == null || mapView == null) {
            diagnostics.error(
                code = "activity_lifecycle_unavailable",
                message = "SaMi Maps could not obtain its MapView and host Activity lifecycle.",
            )
            return
        }

        if (currentOwner.lifecycle.currentState == Lifecycle.State.DESTROYED) {
            diagnostics.warning(
                code = "activity_lifecycle_destroyed",
                message = "SaMi Maps is waiting for a live host Activity before starting.",
            )
            return
        }

        if (owner === currentOwner && observer != null) return

        detach()

        val callbacks = object : ComponentCallbacks2 {
            override fun onConfigurationChanged(newConfig: Configuration) = Unit

            override fun onLowMemory() {
                mapViewProvider()?.let { currentMap ->
                    runCatching { currentMap.onLowMemory() }
                }
            }

            override fun onTrimMemory(level: Int) {
                if (
                    level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL ||
                    level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW
                ) {
                    mapViewProvider()?.let { currentMap ->
                        runCatching { currentMap.onLowMemory() }
                    }
                }
            }
        }

        val lifecycleObserver = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> startMap()
                Lifecycle.Event.ON_RESUME -> resumeMap()
                Lifecycle.Event.ON_STOP -> stopMap()
                Lifecycle.Event.ON_DESTROY -> stopMap()
                else -> Unit
            }
        }

        try {
            mapView.context.registerComponentCallbacks(callbacks)
            componentCallbacks = callbacks
            owner = currentOwner
            observer = lifecycleObserver

            // LifecycleRegistry immediately dispatches the owner's current
            // state. This also handles a MapView created after Activity RESUME.
            currentOwner.lifecycle.addObserver(lifecycleObserver)

            diagnostics.info(
                code = "activity_lifecycle_attached",
                message = "SaMi's single lifecycle controller attached to the host Activity.",
            )
        } catch (error: Exception) {
            currentOwner.lifecycle.removeObserver(lifecycleObserver)
            runCatching { mapView.context.unregisterComponentCallbacks(callbacks) }
            componentCallbacks = null
            owner = null
            observer = null

            diagnostics.error(
                code = "activity_lifecycle_attach_failed",
                message = error.message ?: "SaMi Maps could not attach to the host Activity lifecycle.",
            )
        }
    }

    fun detach() {
        val currentOwner = owner
        val currentObserver = observer
        val currentMapView = mapViewProvider()
        val callbacks = componentCallbacks

        if (currentOwner != null && currentObserver != null) {
            currentOwner.lifecycle.removeObserver(currentObserver)
        }

        if (currentMapView != null && callbacks != null) {
            runCatching {
                currentMapView.context.unregisterComponentCallbacks(callbacks)
            }
        }

        owner = null
        observer = null
        componentCallbacks = null
        stopMap()
    }

    fun dispose() {
        detach()
    }

    private fun startMap() {
        val mapView = mapViewProvider() ?: return
        if (mapStarted) return

        try {
            mapView.onStart()
            mapStarted = true
            diagnostics.info(
                code = "mapview_started",
                message = "Mapbox MapView received onStart from SaMi's lifecycle controller.",
            )
        } catch (error: Exception) {
            diagnostics.error(
                code = "mapview_start_failed",
                message = error.message ?: "Mapbox MapView failed to start.",
            )
        }
    }

    private fun resumeMap() {
        val mapView = mapViewProvider() ?: return

        if (!mapStarted) startMap()
        if (!mapStarted || mapResumed) return

        try {
            mapView.onResume()
            mapResumed = true
            diagnostics.info(
                code = "mapview_resumed",
                message = "Mapbox MapView received onResume from SaMi's lifecycle controller.",
            )
            onResumed()
        } catch (error: Exception) {
            diagnostics.error(
                code = "mapview_resume_failed",
                message = error.message ?: "Mapbox MapView failed to resume.",
            )
        }
    }

    private fun stopMap() {
        val mapView = mapViewProvider()

        if (mapView != null && mapStarted) {
            try {
                mapView.onStop()
                diagnostics.info(
                    code = "mapview_stopped",
                    message = "Mapbox MapView received onStop from SaMi's lifecycle controller.",
                )
            } catch (error: Exception) {
                diagnostics.error(
                    code = "mapview_stop_failed",
                    message = error.message ?: "Mapbox MapView failed to stop.",
                )
            }
        }

        val wasRunning = mapStarted || mapResumed
        mapStarted = false
        mapResumed = false

        if (wasRunning) onStopped()
    }
}
