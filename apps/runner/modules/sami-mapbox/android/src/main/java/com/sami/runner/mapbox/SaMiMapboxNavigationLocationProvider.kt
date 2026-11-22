package com.sami.runner.mapbox

import android.app.PendingIntent
import android.os.SystemClock

import com.mapbox.common.Cancelable
import com.mapbox.common.location.BaseLocationProvider
import com.mapbox.common.location.DeviceLocationProvider
import com.mapbox.common.location.GetLocationCallback
import com.mapbox.common.location.Location

/**
 * Navigation SDK adapter for SaMi's existing location stream.
 *
 * SaMi Location remains the only component that obtains device fixes. The
 * Navigation SDK subscribes to this provider, but its hardware/PendingIntent
 * entry points are intentionally inert; fresh positions are pushed through
 * updateFromSaMiLocation() from the native Mapbox view props.
 */
internal class SaMiMapboxNavigationLocationProvider : BaseLocationProvider(), DeviceLocationProvider {
    @Volatile
    private var latestLocation: Location? = null

    fun updateFromSaMiLocation(
        latitude: Double,
        longitude: Double,
        bearing: Double?,
        speedMetersPerSecond: Double?,
        horizontalAccuracyMeters: Double?,
    ) {
        if (!latitude.isFinite() || latitude !in -90.0..90.0) return
        if (!longitude.isFinite() || longitude !in -180.0..180.0) return

        val builder = Location.Builder()
            .latitude(latitude)
            .longitude(longitude)
            .timestamp(System.currentTimeMillis())
            .monotonicTimestamp(SystemClock.elapsedRealtimeNanos())
            .source("sami-location")

        if (bearing != null && bearing.isFinite() && bearing >= 0.0 && bearing < 360.0) {
            builder.bearing(bearing)
        }
        if (speedMetersPerSecond != null && speedMetersPerSecond.isFinite() && speedMetersPerSecond >= 0.0) {
            builder.speed(speedMetersPerSecond)
        }
        if (horizontalAccuracyMeters != null && horizontalAccuracyMeters.isFinite() && horizontalAccuracyMeters > 0.0) {
            builder.horizontalAccuracy(horizontalAccuracyMeters)
        }

        val location = builder.build()
        latestLocation = location
        notifyLocationUpdate(listOf(location))
    }

    override fun getLastLocation(callback: GetLocationCallback): Cancelable {
        callback.run(latestLocation)
        return object : Cancelable {
            override fun cancel() = Unit
        }
    }

    /** The SDK must never start a platform location request behind SaMi's back. */
    override fun requestLocationUpdates(pendingIntent: PendingIntent) = Unit

    /** No platform subscription was started by this provider. */
    override fun removeLocationUpdates(pendingIntent: PendingIntent) = Unit
}

internal object SaMiMapboxNavigationLocationProviderHolder {
    val shared = SaMiMapboxNavigationLocationProvider()
}