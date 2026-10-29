#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Run only on a disposable test emulator; never clears or changes a user's device.
set -uo pipefail
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell dumpsys webviewupdate | head -30 || true
cd android || exit 1
# The Media3 experiment belongs to androidTestImplementation only, not the
# production app's runtime dependency graph.
if ! ./gradlew --no-daemon :app:dependencies --configuration debugRuntimeClasspath > /tmp/trk-debug-runtime-deps.log 2>&1; then
  tail -n 60 /tmp/trk-debug-runtime-deps.log | sed 's/^/::error::/'
  exit 1
fi
if grep -q 'androidx\.media3:' /tmp/trk-debug-runtime-deps.log; then
  echo '::error::Media3 unexpectedly appears in the app debug runtime dependencies'
  exit 1
fi
echo '::notice::Media3 is absent from the app debug runtime dependency graph'
# Scope to the app; generated Cordova plugin modules are not our test target.
echo '::notice::Running app instrumentation on the disposable emulator'
./gradlew --no-daemon :app:connectedDebugAndroidTest 2>&1 | tee /tmp/trk-emulator-gradle.log
status=${PIPESTATUS[0]}
if (( status != 0 )); then
  tail -n 80 /tmp/trk-emulator-gradle.log | sed 's/^/::error::/'
  # A crashing instrumentation process may not leave JUnit results. The
  # disposable emulator's filtered logcat helps diagnose that case.
  adb logcat -d -t 1500 -s AndroidRuntime:E ActivityManager:W ActivityTaskManager:W TestRunner:I '*:S' | tail -n 120 | sed 's/^/::error::/' || true
  # Publish concise JUnit failures as check annotations, not just a report file.
  python3 - <<'PY'
import glob, xml.etree.ElementTree as ET
for path in glob.glob('app/build/outputs/androidTest-results/connected/**/*.xml', recursive=True):
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        continue
    for case in root.iter('testcase'):
        for failure in list(case.findall('failure')) + list(case.findall('error')):
            msg = '%s: %s' % (case.get('name'), failure.get('message') or (failure.text or '')[:600])
            msg = msg.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
            print('::error::' + msg[:900])
PY
else
  # A green Gradle exit is not enough if no instrumentation tests were run.
  python3 - <<'PY'
import glob, sys, xml.etree.ElementTree as ET
smoke_class = 'com.trk.agrg.AndroidWebViewSmokeTest'
barrier_class = 'com.trk.agrg.Media3BarrierExperimentTest'
expected_by_class = {
    smoke_class: {'freshStartupBackAndNativeOrientationBridge',
                  'rendererCrashShowsRecoveryAndRetryStartsGuarded',
                  'simulatedNoisyCallbackReachesWebViewAndBlocksRestart',
                  'fxRestorationFailureShowsNoticeAndKeepsPlaybackBlocked',
                  'media3PendingOperationsUsePlaceholderAndDeferInvalidation',
                  'media3InterruptDrainsPendingButReentrantReadCanSeeStaleState',
                  'media3InterruptedGenerationAndOldEpochCannotCompleteNewPlay',
                  'pictureInPictureRatioUsesVideoAndAndroidLimits',
                  'nativePictureInPictureEntryNotifiesWebView'},
    barrier_class: {'sharedBarrierDefersUpdatesAndBlocksListenerReentry',
                    'sharedBarrierCannotPreventAnEarlierCompletionListenerSeeingStaleState'},
}
expected = {(class_name, name) for class_name, names in expected_by_class.items() for name in names}
found = {}
for path in glob.glob('app/build/outputs/androidTest-results/connected/**/*.xml', recursive=True):
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        continue
    for case in root.iter('testcase'):
        key = (case.get('classname'), case.get('name'))
        if key in expected:
            found[key] = case
missing = expected - found.keys()
if missing:
    print('::error::Expected Android smoke test results are missing: ' + ', '.join('.'.join(key) for key in sorted(missing)))
    sys.exit(1)
for (class_name, name), case in found.items():
    if case.find('failure') is not None or case.find('error') is not None:
        print('::error::Smoke test failed: ' + name)
        sys.exit(1)
    if case.find('skipped') is not None:
        if name != 'nativePictureInPictureEntryNotifiesWebView':
            print('::error::Required smoke test was skipped: ' + name)
            sys.exit(1)
        print('::warning::PiP entry test skipped: PiP unsupported or disabled')
    else:
        print('::notice::Smoke test passed: ' + name)
PY
  status=$?
fi
exit "$status"
