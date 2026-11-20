import Combine
import CoreLocation
import ExpoModulesCore
import MapboxMaps
import MapboxNavigationCore
import UIKit

public final class SaMiMapboxView: ExpoView {

    // MARK: - Expo events

    let onMapReady = EventDispatcher()
    let onMapError = EventDispatcher()
    let onCameraChanged = EventDispatcher()
    let onMapTap = EventDispatcher()
    let onLocationChanged = EventDispatcher()
    let onNavigationStatusChanged = EventDispatcher()
    let onRouteChanged = EventDispatcher()
    let onVoiceInstructionChanged = EventDispatcher()

    // MARK: - Map state

    private var mapView: MapView?

    var accessToken = ""
    var mapStyleURL = StyleURI.standard.rawValue

    var initialLatitude = -1.2921
    var initialLongitude = 36.8219
    var initialZoom = 14.0
    var initialBearing = 0.0
    var initialPitch = 0.0

    var showUserLocation = true
    var showCompass = true
    var showScaleBar = false

    var screenActive = true
    var navigationActive = false
    var cameraMode = "free"
    var puckBearing = "course"
    var locationPulsingEnabled = false

    private var mapIsReady = false
    private var hasReportedReadyForCurrentActivation = false
    private var lastAppliedStyleURL = ""
    private var disposed = false

    private var cancellables = Set<AnyCancelable>()

    // MARK: - Route guidance props

    var hasRouteDestination = false
    var routeDestinationLatitude = 0.0
    var routeDestinationLongitude = 0.0
    var routeDestinationLabel = ""
    var routeProfile = "driving-traffic"
    var voiceGuidanceMuted = false

    private var routeGuidanceController: SaMiRouteGuidanceController?
    private var routeGuidanceActive = false

    private var lastAppliedHasRouteDestination: Bool?
    private var lastAppliedRouteLatitude: Double?
    private var lastAppliedRouteLongitude: Double?
    private var lastAppliedRouteProfile: String?
    private var lastAppliedVoiceGuidanceMuted: Bool?

    private var navigationSessionRunning = false

    // MARK: - Location providers

    private let appleLocationProvider = AppleLocationProvider()

    private let matchedLocationSubject =
        PassthroughSubject<MapboxMaps.Location, Never>()

    // MARK: - Navigation SDK

    private lazy var navigationProvider =
        MapboxNavigationProvider(
            coreConfig: CoreConfig(locationSource: .live)
        )

    private var mapboxNavigation: MapboxNavigation {
        navigationProvider.mapboxNavigation
    }

    private var navigationLocationSubscription: AnyCancellable?

    // MARK: - Initialisation and UIKit lifecycle

    override public func layoutSubviews() {
        super.layoutSubviews()

        guard screenActive,
              window != nil,
              !bounds.isEmpty else {
            syncMapVisibility()
            return
        }

        createMapIfNeeded()
        mapView?.frame = bounds
        syncMapVisibility()
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()

        guard window != nil else {
            hasReportedReadyForCurrentActivation = false
            syncMapVisibility()
            return
        }

        syncMapVisibility()

        guard screenActive else {
            return
        }

        createMapIfNeeded()
        applyUpdatedProps()
    }

    private func setScreenActive(_ active: Bool) {
        guard screenActive != active else {
            return
        }

        screenActive = active

        if !active {
            hasReportedReadyForCurrentActivation = false
        }

        syncMapVisibility()
    }

    private func syncMapVisibility() {
        let visible =
            screenActive &&
            window != nil &&
            !disposed

        mapView?.isHidden = !visible
        mapView?.isUserInteractionEnabled = visible
    }

    // MARK: - Map creation

    private func createMapIfNeeded() {
        guard mapView == nil,
              !disposed,
              screenActive,
              window != nil,
              !bounds.isEmpty else {
            return
        }

        guard !accessToken.isEmpty else {
            reportError(
                "SaMi Mapbox public access token is missing."
            )
            return
        }

        do {
            MapboxOptions.accessToken = accessToken

            let coordinate = CLLocationCoordinate2D(
                latitude: initialLatitude,
                longitude: initialLongitude
            )

            let cameraOptions = CameraOptions(
                center: coordinate,
                zoom: initialZoom,
                bearing: initialBearing,
                pitch: initialPitch
            )

            let styleURI = resolvedStyleURI()

            let initOptions = MapInitOptions(
                cameraOptions: cameraOptions,
                styleURI: styleURI
            )

            let nativeMap = MapView(
                frame: bounds,
                mapInitOptions: initOptions
            )

            nativeMap.autoresizingMask = [
                .flexibleWidth,
                .flexibleHeight
            ]

            mapView = nativeMap
            addSubview(nativeMap)

            lastAppliedStyleURL = mapStyleURL

            routeGuidanceController = SaMiRouteGuidanceController(
                navigationProvider: navigationProvider,
                mapView: nativeMap,
                onRouteEvent: { [weak self] event in
                    self?.handleRouteEvent(event)
                },
                onVoiceInstructionEvent: { [weak self] event in
                    self?.onVoiceInstructionChanged(event)
                }
            )

            configureLocationProvider()
            configureMapEvents()
            configureMapControls()
            syncMapVisibility()

            if navigationActive || hasRouteDestination {
                startFreeDrive()
            }

        } catch {
            reportError(
                "Mapbox initialization failed: \(error.localizedDescription)"
            )
        }
    }

    // MARK: - Map style

    private func resolvedStyleURI() -> StyleURI {
        guard let customStyle = StyleURI(
            rawValue: mapStyleURL
        ) else {
            return .standard
        }

        return customStyle
    }

    private func updateMapStyle() {
        guard let mapView,
              lastAppliedStyleURL != mapStyleURL else {
            return
        }

        let styleURI = resolvedStyleURI()

        lastAppliedStyleURL = mapStyleURL
        mapIsReady = false
        hasReportedReadyForCurrentActivation = false

        mapView.mapboxMap.loadStyle(styleURI)
    }

    // MARK: - Map readiness

    private func emitMapReadyIfNeeded() {
        guard screenActive,
              window != nil,
              mapIsReady,
              !hasReportedReadyForCurrentActivation else {
            return
        }

        hasReportedReadyForCurrentActivation = true

        onMapReady([
            "ready": true
        ])
    }

    // MARK: - Map events

    private func configureMapEvents() {
        guard let mapView else {
            return
        }

        mapView.mapboxMap.onMapLoaded.observe {
            [weak self] _ in

            guard let self else {
                return
            }

            self.mapIsReady = true

            self.configureStandardStyleConfiguration()
            self.configureMapControls()
            self.configureLocationProvider()
            self.applyCameraMode()
            self.emitMapReadyIfNeeded()

        }.store(in: &cancellables)

        mapView.mapboxMap.onMapLoadingError.observe {
            [weak self] error in

            self?.reportError(
                error.message
            )

        }.store(in: &cancellables)

        mapView.mapboxMap.onCameraChanged.observe {
            [weak self] event in

            let camera = event.cameraState

            self?.onCameraChanged([
                "latitude": camera.center.latitude,
                "longitude": camera.center.longitude,
                "zoom": camera.zoom,
                "bearing": camera.bearing,
                "pitch": camera.pitch
            ])

        }.store(in: &cancellables)

        mapView.gestures.onMapTap.observe {
            [weak self] context in

            guard let self,
                  self.screenActive else {
                return
            }

            self.onMapTap([
                "latitude": context.coordinate.latitude,
                "longitude": context.coordinate.longitude
            ])

        }.store(in: &cancellables)

        mapView.location.onLocationChange.observe {
            [weak self] locations in

            guard let self,
                  !self.navigationSessionRunning,
                  let location = locations.last else {
                return
            }

            self.emitRawLocation(
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude
            )

        }.store(in: &cancellables)
    }

    // MARK: - Map controls

    private func configureStandardStyleConfiguration() {
        guard mapStyleURL == StyleURI.standard.rawValue,
              let mapboxMap = mapView?.mapboxMap else {
            return
        }

        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "lightPreset", value: "day"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "theme", value: "default"
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showPlaceLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showRoadLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showPointOfInterestLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showTransitLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showPedestrianRoads", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showHdRoads", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "show3dObjects", value: false
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "show3dBuildings", value: false
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "show3dLandmarks", value: false
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "show3dTrees", value: false
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showLandmarkIcons", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showLandmarkIconLabels", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "showAdminBoundaries", value: true
        )
        mapboxMap.setStyleImportConfigProperty(
            for: "basemap", config: "densityPointOfInterestLabels", value: 2.0
        )
    }

    private func configureMapControls() {
        guard let mapView else {
            return
        }

        var ornaments = mapView.ornaments.options

        ornaments.compass.visibility =
            showCompass ? .visible : .hidden

        ornaments.scaleBar.visibility =
            showScaleBar ? .visible : .hidden

        mapView.ornaments.options = ornaments
    }

    // MARK: - Location puck

    private func configureLocationProvider() {
        guard let mapView else {
            return
        }

        if navigationSessionRunning {
            mapView.location.override(
                locationProvider: matchedLocationSubject
                    .map { [$0] }
                    .eraseToSignal()
            )
        } else {
            appleLocationProvider.options.activityType =
                .automotiveNavigation

            mapView.location.override(
                provider: appleLocationProvider
            )
        }

        let puckConfiguration =
            Puck2DConfiguration.makeDefault(
                showBearing: true
            )

        mapView.location.options = LocationOptions(
            puckType: showUserLocation
                ? .puck2D(puckConfiguration)
                : .none,
            puckBearing: puckBearing == "heading"
                ? .heading
                : .course,
            puckBearingEnabled: true
        )
    }

    // MARK: - Navigation: Free drive and road matching

    private func startFreeDrive() {
        guard !navigationSessionRunning else {
            return
        }

        let authorization = CLLocationManager.authorizationStatus()

        guard authorization == .authorizedWhenInUse ||
              authorization == .authorizedAlways else {

            navigationActive = false

            reportError(
                "Location permission is required before starting SaMi navigation."
            )

            emitNavigationStatus()
            return
        }

        do {
            navigationLocationSubscription?.cancel()

            navigationLocationSubscription =
                mapboxNavigation.navigation()
                    .locationMatching
                    .map(\.enhancedLocation)
                    .sink { [weak self] matchedLocation in

                        guard let self else {
                            return
                        }

                        self.receiveEnhancedLocation(
                            matchedLocation
                        )
                    }

            navigationProvider.tripSession().startFreeDrive()

            navigationSessionRunning = true

            configureLocationProvider()
            applyCameraMode()
            emitNavigationStatus()

        } catch {
            navigationLocationSubscription?.cancel()
            navigationLocationSubscription = nil

            navigationSessionRunning = false
            navigationActive = false

            configureLocationProvider()

            reportError(
                "Mapbox navigation could not start: \(error.localizedDescription)"
            )

            emitNavigationStatus()
        }
    }

    private func stopFreeDrive(force: Bool = false) {
        guard navigationSessionRunning || force else {
            return
        }

        navigationLocationSubscription?.cancel()
        navigationLocationSubscription = nil

        navigationProvider.tripSession().setToIdle()

        navigationSessionRunning = false
        routeGuidanceActive = false
        routeGuidanceController?.clearOrigin()

        configureLocationProvider()
        emitNavigationStatus()
    }

    private func receiveEnhancedLocation(
        _ location: CLLocation
    ) {
        guard navigationSessionRunning else {
            return
        }

        let matchedLocation = MapboxMaps.Location(
            coordinate: location.coordinate
        )

        matchedLocationSubject.send(
            matchedLocation
        )

        routeGuidanceController?.updateOrigin(location)

        let bearing: Any =
            location.course >= 0
                ? location.course as Any
                : NSNull()

        let speed: Any =
            location.speed >= 0
                ? location.speed as Any
                : NSNull()

        let accuracy: Any =
            location.horizontalAccuracy >= 0
                ? location.horizontalAccuracy as Any
                : NSNull()

        onLocationChanged([
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "bearing": bearing,
            "speedMetersPerSecond": speed,
            "horizontalAccuracyMeters": accuracy,
            "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
            "enhanced": true
        ])
    }

    private func emitRawLocation(
        latitude: Double,
        longitude: Double
    ) {
        onLocationChanged([
            "latitude": latitude,
            "longitude": longitude,
            "bearing": NSNull(),
            "speedMetersPerSecond": NSNull(),
            "horizontalAccuracyMeters": NSNull(),
            "timestamp": Date().timeIntervalSince1970 * 1000,
            "enhanced": false
        ])
    }

    // MARK: - Route events and navigation status

    private func handleRouteEvent(_ event: [String: Any]) {
        let status = event["status"] as? String
        routeGuidanceActive = status == "active"

        onRouteChanged(event)
        emitNavigationStatus()
    }

    private func emitNavigationStatus() {
        let mode: String

        if routeGuidanceActive {
            mode = "active_guidance"
        } else if navigationSessionRunning {
            mode = "free_drive"
        } else {
            mode = "idle"
        }

        onNavigationStatusChanged([
            "active": navigationSessionRunning,
            "mode": mode
        ])
    }

    // MARK: - Camera

    private func applyCameraMode() {
        guard let mapView,
              mapIsReady else {
            return
        }

        if cameraMode == "free" {
            mapView.viewport.idle()
            return
        }

        let navigationCamera = cameraMode == "navigation"

        let padding = UIEdgeInsets(
            top: navigationCamera ? 120 : 70,
            left: 0,
            bottom: navigationCamera ? 300 : 170,
            right: 0
        )

        let cameraOptions = CameraOptions(
            zoom: navigationCamera ? 17.5 : 16.5
        )

        mapView.viewport.idle()

        mapView.mapboxMap.setCamera(
            to: cameraOptions
        )

        let viewportOptions = FollowPuckViewportStateOptions(
            padding: padding,
            bearing: navigationCamera
                ? .course
                : .constant(0),
            pitch: 0
        )

        let followState =
            mapView.viewport.makeFollowPuckViewportState(
                options: viewportOptions
            )

        mapView.viewport.transition(
            to: followState
        )
    }

    // MARK: - Prop updates

    func applyUpdatedProps() {
        guard !disposed else {
            return
        }

        syncMapVisibility()

        if screenActive && window != nil {
            createMapIfNeeded()
        }

        let previousHasRouteDestination =
            lastAppliedHasRouteDestination ?? false

        let destinationChanged: Bool

        if let previousHasDestination = lastAppliedHasRouteDestination {
            destinationChanged =
                previousHasDestination != hasRouteDestination ||
                (hasRouteDestination && (
                    lastAppliedRouteLatitude != routeDestinationLatitude ||
                    lastAppliedRouteLongitude != routeDestinationLongitude ||
                    lastAppliedRouteProfile != routeProfile
                ))
        } else {
            destinationChanged = true
        }

        /*
         * Keep a currently active trip session alive when the dashboard
         * loses focus. A route-only session is started only while the
         * dashboard is visible.
         */
        let shouldRunNavigation =
            navigationActive ||
            (screenActive && hasRouteDestination)

        if shouldRunNavigation {
            if destinationChanged && navigationSessionRunning {
                navigationProvider.tripSession().startFreeDrive()
            }

            startFreeDrive()
        }

        if let routeGuidanceController {
            if hasRouteDestination {
                routeGuidanceController.setDestination(
                    latitude: routeDestinationLatitude,
                    longitude: routeDestinationLongitude,
                    label: routeDestinationLabel,
                    profile: routeProfile
                )
            } else {
                routeGuidanceController.setDestination(
                    latitude: nil,
                    longitude: nil,
                    label: "",
                    profile: routeProfile
                )
            }

            if lastAppliedVoiceGuidanceMuted != voiceGuidanceMuted {
                routeGuidanceController.setVoiceMuted(
                    voiceGuidanceMuted
                )
                lastAppliedVoiceGuidanceMuted = voiceGuidanceMuted
            }
        }

        lastAppliedHasRouteDestination = hasRouteDestination
        lastAppliedRouteLatitude = hasRouteDestination
            ? routeDestinationLatitude
            : nil
        lastAppliedRouteLongitude = hasRouteDestination
            ? routeDestinationLongitude
            : nil
        lastAppliedRouteProfile = routeProfile

        if !shouldRunNavigation {
            stopFreeDrive(
                force: previousHasRouteDestination
            )
        }

        guard screenActive,
              window != nil else {
            return
        }

        updateMapStyle()
        configureMapControls()
        configureLocationProvider()
        applyCameraMode()
        emitMapReadyIfNeeded()
    }

    // MARK: - Errors

    private func reportError(_ message: String) {
        onMapError([
            "message": message
        ])
    }

    // MARK: - Cleanup

    deinit {
        routeGuidanceController?.dispose()
        navigationLocationSubscription?.cancel()

        if navigationSessionRunning {
            navigationProvider.tripSession().setToIdle()
        }

        cancellables.removeAll()
    }
}

// MARK: - Expo module registration

public final class SaMiMapboxModule: Module {

    public func definition() -> ModuleDefinition {

        Name("SaMiMapbox")

        View(SaMiMapboxView.self) {

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
                (view: SaMiMapboxView, value: String) in

                view.accessToken = value.trimmingCharacters(
                    in: .whitespacesAndNewlines
                )
            }

            Prop("mapStyleURL", StyleURI.standard.rawValue) {
                (view: SaMiMapboxView, value: String) in

                view.mapStyleURL = value
            }

            Prop("initialLatitude", -1.2921) {
                (view: SaMiMapboxView, value: Double) in

                if (-90.0...90.0).contains(value) {
                    view.initialLatitude = value
                }
            }

            Prop("initialLongitude", 36.8219) {
                (view: SaMiMapboxView, value: Double) in

                if (-180.0...180.0).contains(value) {
                    view.initialLongitude = value
                }
            }

            Prop("initialZoom", 14.0) {
                (view: SaMiMapboxView, value: Double) in

                view.initialZoom = min(max(value, 0), 22)
            }

            Prop("initialBearing", 0.0) {
                (view: SaMiMapboxView, value: Double) in

                view.initialBearing = value
            }

            Prop("initialPitch", 0.0) {
                (view: SaMiMapboxView, value: Double) in

                view.initialPitch = min(max(value, 0), 85)
            }

            Prop("showUserLocation", true) {
                (view: SaMiMapboxView, value: Bool) in

                view.showUserLocation = value
            }

            Prop("showCompass", true) {
                (view: SaMiMapboxView, value: Bool) in

                view.showCompass = value
            }

            Prop("showScaleBar", false) {
                (view: SaMiMapboxView, value: Bool) in

                view.showScaleBar = value
            }

            Prop("screenActive", true) {
                (view: SaMiMapboxView, value: Bool) in

                view.setScreenActive(value)
            }

            Prop("navigationActive", false) {
                (view: SaMiMapboxView, value: Bool) in

                view.navigationActive = value
            }

            Prop("hasRouteDestination", false) {
                (view: SaMiMapboxView, value: Bool) in

                view.hasRouteDestination = value
            }

            Prop("routeDestinationLatitude", 0.0) {
                (view: SaMiMapboxView, value: Double) in

                view.routeDestinationLatitude = value
            }

            Prop("routeDestinationLongitude", 0.0) {
                (view: SaMiMapboxView, value: Double) in

                view.routeDestinationLongitude = value
            }

            Prop("routeDestinationLabel", "") {
                (view: SaMiMapboxView, value: String) in

                view.routeDestinationLabel = value
            }

            Prop("routeProfile", "driving-traffic") {
                (view: SaMiMapboxView, value: String) in

                view.routeProfile = value
            }

            Prop("voiceGuidanceMuted", false) {
                (view: SaMiMapboxView, value: Bool) in

                view.voiceGuidanceMuted = value
            }

            Prop("cameraMode", "free") {
                (view: SaMiMapboxView, value: String) in

                view.cameraMode = value
            }

            Prop("puckBearing", "course") {
                (view: SaMiMapboxView, value: String) in

                view.puckBearing = value
            }

            Prop("locationPulsingEnabled", false) {
                (view: SaMiMapboxView, value: Bool) in

                view.locationPulsingEnabled = value
            }

            OnViewDidUpdateProps { view in
                view.applyUpdatedProps()
            }
        }
    }
}