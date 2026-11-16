Pod::Spec.new do |s|
  s.name           = 'sami-mapbox'
  s.version        = '1.0.0'
  s.summary        = 'SaMi native Mapbox Maps and Navigation SDK integration'
  s.description    = 'Official Mapbox native SDKs exposed through a SaMi-owned Expo module.'
  s.author         = 'SaMi Technologies'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'Proprietary' }
  s.source         = { :git => '' }
  s.platform       = :ios, '16.4'

  s.dependency 'ExpoModulesCore'

  s.swift_version = '5.9'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"

  unless defined?(spm_dependency)
    raise 'SaMi Mapbox requires React Native Swift Package Manager podspec support (spm_dependency).'
  end

  # Official Mapbox Navigation SDK v3. SaMi uses NavigationCore, not the
  # prebuilt Mapbox UIKit navigation interface.
  spm_dependency(
    s,
    url: 'https://github.com/mapbox/mapbox-navigation-ios.git',
    requirement: { kind: 'exactVersion', version: '3.35.0' },
    products: ['MapboxNavigationCore', 'MapboxDirections']
  )

  # Official Mapbox Maps SDK. Navigation v3 pins this same Maps release.
  spm_dependency(
    s,
    url: 'https://github.com/mapbox/mapbox-maps-ios.git',
    requirement: { kind: 'exactVersion', version: '11.35.0' },
    products: ['MapboxMaps']
  )

  # React Native 0.88.1's SPM helper only registers declared products.
  # Declare the transitive runtime products explicitly for linking/embedding.
  spm_dependency(
    s,
    url: 'https://github.com/mapbox/mapbox-navigation-native-ios.git',
    requirement: { kind: 'exactVersion', version: '324.35.0' },
    products: ['MapboxNavigationNative']
  )

  spm_dependency(
    s,
    url: 'https://github.com/mapbox/mapbox-common-ios.git',
    requirement: { kind: 'exactVersion', version: '24.35.0' },
    products: ['MapboxCommon']
  )

  spm_dependency(
    s,
    url: 'https://github.com/mapbox/mapbox-core-maps-ios.git',
    requirement: { kind: 'exactVersion', version: '11.35.0' },
    products: ['MapboxCoreMaps']
  )

  spm_dependency(
    s,
    url: 'https://github.com/mapbox/turf-swift.git',
    requirement: { kind: 'exactVersion', version: '4.1.0' },
    products: ['Turf']
  )
end
