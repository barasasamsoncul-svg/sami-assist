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
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.swift_version = '5.9'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = 'ios/**/*.{h,m,mm,swift,hpp,cpp}'

  unless defined?(spm_dependency)
    raise 'SaMi Mapbox requires React Native Swift Package Manager podspec support (spm_dependency).'
  end

  # Official Mapbox Navigation SDK v3. SaMi uses NavigationCore and owns
  # its own dashboard, navigation controls, and turn-by-turn presentation.
  spm_dependency(
    s,
    url: 'https://github.com/mapbox/mapbox-navigation-ios.git',
    requirement: { kind: 'exactVersion', version: '3.35.0' },
    products: ['MapboxNavigationCore', 'MapboxDirections'],
    embed_frameworks: [
      'MapboxNavigationCore',
      'MapboxDirections',
      'MapboxNavigationNative'
    ]
  )

  # Explicit Maps product dependency makes MapboxMaps directly importable
  # by the SaMi native map view. Navigation v3 pins this same Maps release.
  spm_dependency(
    s,
    url: 'https://github.com/mapbox/mapbox-maps-ios.git',
    requirement: { kind: 'exactVersion', version: '11.35.0' },
    products: ['MapboxMaps'],
    embed_frameworks: [
      'MapboxMaps',
      'MapboxCommon',
      'MapboxCoreMaps',
      'Turf'
    ]
  )
end
