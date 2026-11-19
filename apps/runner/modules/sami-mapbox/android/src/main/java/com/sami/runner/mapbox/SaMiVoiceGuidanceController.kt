
package com.sami.runner.mapbox

import android.content.Context

import com.mapbox.bindgen.Expected
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import com.mapbox.navigation.ui.base.util.MapboxNavigationConsumer
import com.mapbox.navigation.voice.api.MapboxSpeechApi
import com.mapbox.navigation.voice.api.MapboxVoiceInstructionsPlayer
import com.mapbox.navigation.voice.model.SpeechAnnouncement
import com.mapbox.navigation.voice.model.SpeechError
import com.mapbox.navigation.voice.model.SpeechValue

import java.util.Locale

class SaMiVoiceGuidanceController(
    context: Context,
    private val onInstructionChanged: (Map<String, Any?>) -> Unit
) {

    private val localeTag = Locale.US.toLanguageTag()

    /*
     * Initialize both services immediately.
     * The voice player should not be lazily initialized because
     * Android's speech services require initialization time.
     */
    private val speechApi = MapboxSpeechApi(
        context.applicationContext,
        localeTag
    )

    private val voicePlayer = MapboxVoiceInstructionsPlayer(
        context.applicationContext,
        localeTag
    )

    private var attachedNavigation: MapboxNavigation? = null

    @Volatile
    private var muted = false

    @Volatile
    private var disposed = false

    private var requestGeneration = 0L

    /*
     * Cleans up synthesized speech files after playback.
     */
    private val voicePlayerCallback =
        MapboxNavigationConsumer<SpeechAnnouncement> { announcement ->

            runCatching {
                speechApi.clean(announcement)
            }
        }

    /*
     * Receives instructions at the appropriate point along the route.
     */
    private val voiceInstructionsObserver =
        VoiceInstructionsObserver { voiceInstructions ->

            if (!disposed) {

                val announcement =
                    voiceInstructions.announcement().trim()

                val ssmlAnnouncement =
                    voiceInstructions.ssmlAnnouncement()

                if (announcement.isNotBlank()) {

                    onInstructionChanged(
                        mapOf(
                            "instruction" to announcement,
                            "ssmlAnnouncement" to ssmlAnnouncement,
                            "muted" to muted,
                            "timestamp" to System.currentTimeMillis()
                        )
                    )

                    if (!muted) {
                        generateAndPlay(voiceInstructions)
                    }
                }
            }
        }

    /*
     * Connect this controller to the active Navigation SDK instance.
     */
    fun attach(navigation: MapboxNavigation) {

        if (disposed) return

        if (attachedNavigation === navigation) {
            return
        }

        detach()

        attachedNavigation = navigation

        navigation.registerVoiceInstructionsObserver(
            voiceInstructionsObserver
        )
    }

    /*
     * Generate synthesized speech and play it.
     * If Mapbox speech generation fails, use the supplied
     * device speech fallback.
     */
    private fun generateAndPlay(
        voiceInstructions: com.mapbox.api.directions.v5.models.VoiceInstructions
    ) {

        val generationAtRequest = requestGeneration

        speechApi.generate(
            voiceInstructions,
            MapboxNavigationConsumer<
                Expected<SpeechError, SpeechValue>
            > { expected ->

                val resultIsCurrent =
                    !disposed &&
                    !muted &&
                    generationAtRequest == requestGeneration

                if (!resultIsCurrent) {

                    expected.fold(
                        { },
                        { value ->
                            runCatching {
                                speechApi.clean(value.announcement)
                            }
                        }
                    )

                } else {

                    expected.fold(

                        { error ->

                            voicePlayer.play(
                                error.fallback,
                                voicePlayerCallback
                            )
                        },

                        { value ->

                            voicePlayer.play(
                                value.announcement,
                                voicePlayerCallback
                            )
                        }
                    )
                }
            }
        )
    }

    /*
     * Call this whenever a new route replaces the previous route.
     * It prevents an old instruction from playing on the new route.
     */
    fun onRouteChanged() {

        if (disposed) return

        requestGeneration++

        runCatching {
            speechApi.cancel()
        }

        runCatching {
            voicePlayer.clear()
        }
    }

    /*
     * Mute or unmute spoken navigation instructions.
     */
    fun setMuted(value: Boolean) {

        if (disposed) return

        muted = value

        if (muted) {

            requestGeneration++

            runCatching {
                speechApi.cancel()
            }

            runCatching {
                voicePlayer.clear()
            }
        }
    }

    fun isMuted(): Boolean {
        return muted
    }

    /*
     * Disconnect from the Navigation SDK while preserving
     * the controller for a later attachment.
     */
    fun detach() {

        val navigation = attachedNavigation

        if (navigation != null) {

            runCatching {
                navigation.unregisterVoiceInstructionsObserver(
                    voiceInstructionsObserver
                )
            }
        }

        attachedNavigation = null

        requestGeneration++

        runCatching {
            speechApi.cancel()
        }

        runCatching {
            voicePlayer.clear()
        }
    }

    /*
     * Permanently release speech resources.
     */
    fun dispose() {

        if (disposed) return

        detach()

        disposed = true

        runCatching {
            speechApi.cancel()
        }

        runCatching {
            voicePlayer.clear()
        }

        runCatching {
            voicePlayer.shutdown()
        }
    }
}
