import Combine
import CoreLocation
import Foundation
import MapboxDirections
import MapboxMaps
import MapboxNavigationCore
import UIKit

/// Native iOS route guidance for SaMi Runner.
///
/// This controller uses Mapbox Navigation SDK 3.35.0 for route calculation,
/// route progress, rerouting and spoken instructions. It uses a Maps SDK
/// polyline annotation for the route line so the module does not need
/// MapboxNavigationUIKit.
@MainActor
internal final class SaMiRouteGuidanceController {

    // MARK: - Dependencies

    private let navigationProvider: MapboxNavigationProvider
    private let navigation: MapboxNavigation
    private weak var mapView: MapView?

    private let onRouteEvent: ([String: Any]) -> Void
    private let onVoiceInstructionEvent: ([String: Any]) -> Void

    // MARK: - Mapbox controllers

    private let voiceController: RouteVoiceController
    private var routeLineManager: PolylineAnnotationManager?

    // MARK: - Route state

    private var destination: CLLocationCoordinate2D?
    private var destinationLabel = ""
    private var routingProfile = "driving-traffic"
    private var latestOrigin: CLLocationCoordinate2D?
    private var activeRoute = false
    private var requestInFlight = false
    private var requestGeneration = 0
    private var lastRequestAttemptAt: TimeInterval = 0
    private var lastSpokenInstruction = ""
    private var voiceMuted = false
    private var disposed = false

    private var routeProgressSubscription: AnyCancellable?

    private let retryInterval: TimeInterval = 30
    private let routeAnnotationManagerID = "sami-runner-active-route"

    // MARK: - Initialisation

    init(
        navigationProvider: MapboxNavigationProvider,
        mapView: MapView,
        onRouteEvent: @escaping ([String: Any]) -> Void,
        onVoiceInstructionEvent: @escaping ([String: Any]) -> Void
    ) {
        self.navigationProvider = navigationProvider
        self.navigation = navigationProvider.mapboxNavigation
        self.mapView = mapView
        self.onRouteEvent = onRouteEvent
        self.onVoiceInstructionEvent = onVoiceInstructionEvent

        // Mapbox's shared voice controller subscribes to Navigation SDK
        // route progress and speaks the route's voice instructions.
        self.voiceController = navigationProvider.routeVoiceController

        subscribeToRouteProgress()
    }

    // MARK: - Public API

    /// Receives Navigation SDK's enhanced, map-matched location.
    /// The first usable origin starts the initial route request.
    func updateOrigin(_ location: CLLocation) {
        guard !disposed else { return }
        latestOrigin = location.coordinate
        requestRouteWhenReady()
    }

    /// Clears a stale matched origin when the parent view stops its
    /// Navigation SDK trip session. A future route waits for a fresh fix.
    func clearOrigin() {
        latestOrigin = nil
    }

    /// Sets or clears the active errand destination.
    ///
    /// `profile` must be `cycling` or `driving-traffic`.
    func setDestination(
        latitude: Double?,
        longitude: Double?,
        label: String,
        profile: String
    ) {
        guard !disposed else { return }

        let nextCoordinate: CLLocationCoordinate2D?
        if let latitude,
           let longitude,
           latitude.isFinite,
           longitude.isFinite,
           (-90.0...90.0).contains(latitude),
           (-180.0...180.0).contains(longitude) {
            nextCoordinate = CLLocationCoordinate2D(
                latitude: latitude,
                longitude: longitude
            )
        } else {
            nextCoordinate = nil
        }

        let normalizedProfile = profile == "cycling"
            ? "cycling"
            : "driving-traffic"

        let unchanged: Bool
        if let current = destination, let next = nextCoordinate {
            unchanged = current.latitude == next.latitude &&
                current.longitude == next.longitude &&
                routingProfile == normalizedProfile
        } else {
            unchanged = destination == nil && nextCoordinate == nil &&
                routingProfile == normalizedProfile
        }

        destinationLabel = label.trimmingCharacters(
            in: .whitespacesAndNewlines
        )

        if unchanged {
            return
        }

        requestGeneration += 1
        requestInFlight = false
        activeRoute = false
        lastRequestAttemptAt = 0
        lastSpokenInstruction = ""

        destination = nextCoordinate
        routingProfile = normalizedProfile

        clearRenderedRoute()
        voiceController.speechSynthesizer.stopSpeaking()

        guard nextCoordinate != nil else {
            // SaMiMapboxView owns the Navigation SDK trip-session lifecycle.
            // Clearing the route here must not independently start a session.
            emitRouteEvent(status: "idle")
            return
        }

        emitRouteEvent(
            status: latestOrigin == nil
                ? "waiting_for_location"
                : "requesting"
        )

        // SaMiMapboxView starts or restarts free drive after checking the
        // location permission and maintaining the native session subscription.
        requestRouteWhenReady()
    }

    /// Updates the native speech synthesizer's mute state.
    /// Visual route and maneuver instructions continue while muted.
    func setVoiceMuted(_ muted: Bool) {
        guard !disposed, voiceMuted != muted else { return }

        voiceMuted = muted
        voiceController.speechSynthesizer.muted = muted

        onVoiceInstructionEvent([
            "instruction": "",
            "muted": muted,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    func dispose() {
        guard !disposed else { return }
        disposed = true

        requestGeneration += 1
        requestInFlight = false

        routeProgressSubscription?.cancel()
        routeProgressSubscription = nil

        voiceController.speechSynthesizer.stopSpeaking()
        clearRenderedRoute()

        if let routeLineManager {
            mapView?.annotations.removeAnnotationManager(
                withId: routeLineManager.id
            )
            self.routeLineManager = nil
        }
    }

    // MARK: - Route progress and instructions

    private func subscribeToRouteProgress() {
        routeProgressSubscription = navigation.navigation()
            .routeProgress
            .sink { [weak self] state in
                guard let routeProgress = state?.routeProgress else {
                    return
                }

                Task { @MainActor [weak self] in
                    self?.handleRouteProgress(routeProgress)
                }
            }
    }

    private func handleRouteProgress(_ progress: RouteProgress) {
        guard !disposed, activeRoute else { return }

        let stepProgress = progress.currentLegProgress.currentStepProgress
        let visualInstruction = stepProgress.currentVisualInstruction
        let spokenInstruction = stepProgress.currentSpokenInstruction

        let primaryText = visualInstruction?.primary.text
        let secondaryText = visualInstruction?.secondary?.text
        let spokenText = spokenInstruction?.text ?? ""

        if !spokenText.isEmpty && spokenText != lastSpokenInstruction {
            lastSpokenInstruction = spokenText

            var voiceEvent: [String: Any] = [
                "instruction": spokenText,
                "muted": voiceMuted,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]

            if let ssmlAnnouncement = spokenInstruction?.ssmlText,
               !ssmlAnnouncement.isEmpty {
                voiceEvent["ssmlAnnouncement"] = ssmlAnnouncement
            }

            onVoiceInstructionEvent(voiceEvent)
        }

        let distanceToManeuver =
            stepProgress.userDistanceToUpcomingIntersection ??
            stepProgress.distanceRemaining

        emitRouteEvent(
            status: "active",
            nextInstruction: primaryText ?? spokenText,
            secondaryInstruction: secondaryText,
            stepDistanceRemainingMeters: distanceToManeuver,
            stepDurationRemainingSeconds: stepProgress.durationRemaining,
            stepFractionTraveled: stepProgress.fractionTraveled,
            distanceRemainingMeters: progress.distanceRemaining,
            durationRemainingSeconds: progress.durationRemaining,
            fractionTraveled: progress.fractionTraveled,
            routeProgressState: progress.routeIsComplete
                ? "complete"
                : "tracking"
        )
    }

    // MARK: - Route calculation

    private func requestRouteWhenReady() {
        guard !disposed,
              destination != nil,
              !activeRoute,
              !requestInFlight else {
            return
        }

        guard let origin = latestOrigin,
              let target = destination else {
            emitRouteEvent(status: "waiting_for_location")
            return
        }

        let now = Date().timeIntervalSince1970
        guard lastRequestAttemptAt == 0 ||
              now - lastRequestAttemptAt >= retryInterval else {
            return
        }

        lastRequestAttemptAt = now
        requestInFlight = true

        let generation = requestGeneration
        emitRouteEvent(status: "requesting")

        let profileIdentifier: ProfileIdentifier = routingProfile == "cycling"
            ? .cycling
            : .automobileAvoidingTraffic

        let routeOptions = NavigationRouteOptions(
            coordinates: [origin, target],
            profileIdentifier: profileIdentifier
        )
        routeOptions.locale = Locale(identifier: "en")
        routeOptions.distanceUnit = .kilometer

        // NavigationRouteOptions in Navigation SDK 3.35.0 enables steps,
        // banner instructions and spoken instructions by default.
        let request = navigation.routingProvider().calculateRoutes(
            options: routeOptions
        )

        Task { @MainActor [weak self] in
            let result = await request.result

            guard let self,
                  !self.disposed,
                  generation == self.requestGeneration else {
                return
            }

            self.requestInFlight = false

            switch result {
            case .failure(let error):
                self.activeRoute = false
                self.emitRouteEvent(
                    status: "error",
                    message: "Mapbox could not calculate a route: \(error.localizedDescription)"
                )

            case .success(let navigationRoutes):
                self.activateRoute(navigationRoutes)
            }
        }
    }

    private func activateRoute(_ routes: NavigationRoutes) {
        guard !disposed else { return }

        let coordinates = routes.mainRoute.route.shape?.coordinates ?? []
        guard coordinates.count >= 2 else {
            activeRoute = false
            emitRouteEvent(
                status: "error",
                message: "Mapbox returned a route without usable geometry."
            )
            return
        }

        renderRoute(coordinates)

        activeRoute = true
        lastSpokenInstruction = ""

        navigation.tripSession().startActiveGuidance(
            with: routes,
            startLegIndex: 0
        )

        emitRouteEvent(
            status: "active",
            distanceRemainingMeters: routes.mainRoute.route.distance,
            durationRemainingSeconds: routes.mainRoute.route.expectedTravelTime,
            fractionTraveled: 0
        )
    }

    // MARK: - Route line

    private func ensureRouteLineManager() -> PolylineAnnotationManager? {
        guard let mapView else { return nil }

        if let routeLineManager {
            return routeLineManager
        }

        let manager = mapView.annotations.makePolylineAnnotationManager(
            id: routeAnnotationManagerID
        )

        manager.slot = "middle"
        routeLineManager = manager
        return manager
    }

    private func renderRoute(
        _ coordinates: [CLLocationCoordinate2D]
    ) {
        guard let manager = ensureRouteLineManager() else { return }

        let annotation = PolylineAnnotation(
            lineCoordinates: coordinates
        )
        .lineColor(UIColor.systemBlue)
        .lineWidth(7)
        .lineJoin(.round)

        manager.annotations = [annotation]
    }

    private func clearRenderedRoute() {
        routeLineManager?.annotations = []
    }

    // MARK: - Events

    private func emitRouteEvent(
        status: String,
        message: String? = nil,
        nextInstruction: String? = nil,
        secondaryInstruction: String? = nil,
        stepDistanceRemainingMeters: Double? = nil,
        stepDurationRemainingSeconds: Double? = nil,
        stepFractionTraveled: Double? = nil,
        distanceRemainingMeters: Double? = nil,
        durationRemainingSeconds: Double? = nil,
        fractionTraveled: Double? = nil,
        routeProgressState: String? = nil
    ) {
        var event: [String: Any] = [
            "status": status,
            "destinationLabel": destinationLabel
        ]

        if let message { event["message"] = message }
        if let nextInstruction { event["nextInstruction"] = nextInstruction }
        if let secondaryInstruction { event["secondaryInstruction"] = secondaryInstruction }
        if let stepDistanceRemainingMeters {
            event["stepDistanceRemainingMeters"] = stepDistanceRemainingMeters
        }
        if let stepDurationRemainingSeconds {
            event["stepDurationRemainingSeconds"] = stepDurationRemainingSeconds
        }
        if let stepFractionTraveled {
            event["stepFractionTraveled"] = stepFractionTraveled
        }
        if let distanceRemainingMeters {
            event["distanceRemainingMeters"] = distanceRemainingMeters
        }
        if let durationRemainingSeconds {
            event["durationRemainingSeconds"] = durationRemainingSeconds
        }
        if let fractionTraveled {
            event["fractionTraveled"] = fractionTraveled
        }
        if let routeProgressState {
            event["routeProgressState"] = routeProgressState
        }

        onRouteEvent(event)
    }
}
