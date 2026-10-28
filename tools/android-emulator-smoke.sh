#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Run only on a disposable test emulator; never clears or changes a user's device.
set -uo pipefail
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell dumpsys webviewupdate | head -30 || true
cd android || exit 1
# Scope to the app; generated Cordova plugin modules are not our test target.
./gradlew --no-daemon :app:connectedDebugAndroidTest 2>&1 | tee /tmp/trk-emulator-gradle.log
status=${PIPESTATUS[0]}
if (( status != 0 )); then
  tail -n 35 /tmp/trk-emulator-gradle.log | sed 's/^/::error::/'
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
fi
exit "$status"
