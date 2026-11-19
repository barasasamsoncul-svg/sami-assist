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

    var navigationActive = false
    var cameraMode = "free"
    var puckBearing = "course"
    var locationPulsingEnabled = false

    private var lastAppliedStyleURL = ""
    private var mapIsReady = false
    private var navigationSessionRunning = false
    private var disposed = false

    private var cancellables = Set<AnyCancelable>()

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

    // MARK: - Initialisation

    override public func layoutSubviews() {
        super.layoutSubviews()

        guard !bounds.isEmpty else {
            return
        }

        createMapIfNeeded()

        mapView?.frame = bounds
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()

        guard window != nil else {
            return
        }

        createMapIfNeeded()
        applyUpdatedProps()
    }

    // MARK: - Map creation

    private func createMapIfNeeded() {
        guard mapView == nil,
              !disposed,
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

            configureLocationProvider()
            configureMapEvents()
            configureMapControls()

            if navigationActive {
                startFreeDrive()
            }

        } catch {
            reportError(
                "Mapbox initialization failed: \(error.localizedDescription)"
            )
        }
    }

    // MARK: - Style

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

        mapView.mapboxMap.loadStyle(styleURI)
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

            self.configureMapControls()
            self.configureLocationProvider()
            self.applyCameraMode()

            self.onMapReady([
                "ready": true
            ])

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

            self?.onMapTap([
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

        // Mapbox logo and attribution remain enabled.
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

            // Subscribe before starting the navigation session so
            // the first enhanced location update is not missed.
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

            // Start the actual Mapbox Navigation SDK free-drive
            // session. This enables map matching and enhanced
            // location updates without requiring a destination.
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

    private func stopFreeDrive() {
        guard navigationSessionRunning else {
            return
        }

        navigationLocationSubscription?.cancel()
        navigationLocationSubscription = nil

        navigationProvider.tripSession().setToIdle()

        navigationSessionRunning = false

        configureLocationProvider()
        emitNavigationStatus()
    }

    private func receiveEnhancedLocation(
        _ location: CLLocation
    ) {
        guard navigationSessionRunning else {
            return
        }

        // Feed Navigation SDK's enhanced, map-matched position
        // into the Mapbox Maps location puck.
        let matchedLocation = MapboxMaps.Location(
            coordinate: location.coordinate
        )

        matchedLocationSubject.send(
            matchedLocation
        )

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

    private func emitNavigationStatus() {
        onNavigationStatusChanged([
            "active": navigationSessionRunning,
            "mode": navigationSessionRunning
                ? "free_drive"
                : "idle"
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
            pitch: navigationCamera ? 55 : 0
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

        createMapIfNeeded()

        updateMapStyle()
        configureMapControls()
        configureLocationProvider()

        if navigationActive {
            startFreeDrive()
        } else {
            stopFreeDrive()
        }

        applyCameraMode()
    }

    // MARK: - Errors

    private func reportError(_ message: String) {
        onMapError([
            "message": message
        ])
    }

    // MARK: - Cleanup

    deinit {
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
                "onNavigationStatusChanged"
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

            Prop("navigationActive", false) {
                (view: SaMiMapboxView, value: Bool) in

                view.navigationActive = value
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