package com.sami.runner.mapbox

import com.mapbox.geojson.Point
import com.mapbox.maps.plugin.locationcomponent.LocationConsumer
import com.mapbox.maps.plugin.locationcomponent.LocationProvider

/**
 * Receives device fixes from the SaMi Location service through Expo props.
 * This provider deliberately does not access Android LocationManager,
 * FusedLocationProviderClient, or Mapbox's default device-location source.
 */
internal class SaMiMapboxLocationProvider : LocationProvider {
    private var consumer: LocationConsumer? = null
    private var latestPoint: Point? = null
    private var latestBearing: Double? = null

    @Synchronized
    override fun registerLocationConsumer(locationConsumer: LocationConsumer) {
        consumer = locationConsumer
        latestPoint?.let { locationConsumer.onLocationUpdated(it) }
        latestBearing?.let { locationConsumer.onBearingUpdated(it) }
    }

    @Synchronized
    override fun unRegisterLocationConsumer(locationConsumer: LocationConsumer) {
        if (consumer === locationConsumer) {
            consumer = null
        }
    }

    @Synchronized
    fun update(
        latitude: Double,
        longitude: Double,
        bearing: Double?,
    ) {
        if (!latitude.isFinite() || latitude !in -90.0..90.0) return
        if (!longitude.isFinite() || longitude !in -180.0..180.0) return

        val point = Point.fromLngLat(longitude, latitude)
        latestPoint = point
        consumer?.onLocationUpdated(point)

        if (bearing != null && bearing.isFinite() && bearing >= 0.0 && bearing < 360.0) {
            latestBearing = bearing
            consumer?.onBearingUpdated(bearing)
        }
    }

    @Synchronized
    fun clear() {
        latestPoint = null
        latestBearing = null
        consumer = null
    }
}
