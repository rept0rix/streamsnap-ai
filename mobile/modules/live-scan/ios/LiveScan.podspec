require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LiveScan'
  s.version        = package['version']
  s.summary        = 'StreamSnap background live scan via ReplayKit broadcast'
  s.description    = 'Starts the iOS broadcast picker and reads accumulated finds from the App Group.'
  s.license        = 'MIT'
  s.author         = 'StreamSnap'
  s.homepage       = 'https://streamsnap.online'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.0'
  s.source         = { git: '' }
  s.static_framework = true
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.frameworks     = 'ReplayKit', 'UIKit', 'UserNotifications'
  s.dependency 'ExpoModulesCore'
end
