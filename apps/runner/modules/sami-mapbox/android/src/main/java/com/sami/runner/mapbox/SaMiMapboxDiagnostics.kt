package com.sami.runner.mapbox

import android.util.Log

/**
 * Central diagnostic output for the SaMi-owned Maps renderer.
 *
 * Never pass access tokens, device identifiers, precise location coordinates,
 * or other secrets to this class.
 */
internal class SaMiMapboxDiagnostics(
    private val onDiagnostic: (Map<String, Any>) -> Unit,
) {
    fun info(
        code: String,
        message: String,
        surface: String? = null,
    ) {
        publish("info", code, message, surface)
        Log.i(TAG, "[$code] $message${surfaceSuffix(surface)}")
    }

    fun warning(
        code: String,
        message: String,
        surface: String? = null,
    ) {
        publish("warning", code, message, surface)
        Log.w(TAG, "[$code] $message${surfaceSuffix(surface)}")
    }

    fun error(
        code: String,
        message: String,
        surface: String? = null,
    ) {
        publish("error", code, message, surface)
        Log.e(TAG, "[$code] $message${surfaceSuffix(surface)}")
    }

    private fun publish(
        level: String,
        code: String,
        message: String,
        surface: String?,
    ) {
        val payload = mutableMapOf<String, Any>(
            "level" to level,
            "code" to code,
            "message" to message,
            "timestamp" to System.currentTimeMillis(),
        )

        if (!surface.isNullOrBlank()) {
            payload["surface"] = surface
        }

        onDiagnostic(payload)
    }

    private fun surfaceSuffix(surface: String?): String =
        if (surface.isNullOrBlank()) "" else " (surface=$surface)"

    private companion object {
        const val TAG = "SaMiMapbox"
    }
}
