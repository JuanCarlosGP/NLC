#!/usr/bin/env python3
"""Compile and run the native archive test only against a debug emulator."""
import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True, help='Explicit emulator-NNNN serial; physical devices are rejected')
parser.add_argument('--size-mib', type=int, default=320)
parser.add_argument('--private', action='store_true', help='Use private cache instead of the granted NLC-Service-QA/Health SAF folder')
args = parser.parse_args()
if not re.fullmatch(r'emulator-\d+', args.serial) or not 1 <= args.size_mib <= 2048:
    parser.error('An emulator serial and a size between 1 and 2048 MiB are required')
root = Path(__file__).resolve().parents[2]
sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / '.local/opt/android-sdk')))
source = Path(__file__).resolve().parent
android = sdk / 'platforms/android-36/android.jar'
build_tools = sdk / 'build-tools/36.0.0'
adb = [str(sdk / 'platform-tools/adb'), '-s', args.serial]
def run(*command, **kwargs):
    return subprocess.run(list(map(str, command)), check=True, **kwargs)
run(*adb, 'shell', 'pm', 'path', 'app.nlc.player.dev')
# Requires a debug build with the same standard development signer. Production is never targeted.
with tempfile.TemporaryDirectory(prefix='nlc-archive-qa-') as temporary:
    work = Path(temporary)
    classes = work / 'classes'; classes.mkdir()
    dex = work / 'dex'; dex.mkdir()
    run('javac', '-source', '8', '-target', '8', '-cp', android, '-d', classes, source / 'ArchiveQA.java')
    run(build_tools / 'd8', '--lib', android, '--output', dex, *classes.rglob('*.class'))
    unsigned = work / 'unsigned.apk'
    run(build_tools / 'aapt', 'package', '-f', '-M', source / 'AndroidManifest.xml', '-I', android, '-F', unsigned)
    run('zip', '-j', unsigned, dex / 'classes.dex')
    apk = work / 'qa.apk'
    run(build_tools / 'apksigner', 'sign', '--ks', root / 'android/app/debug.keystore', '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', apk, unsigned)
    run(*adb, 'install', '-r', apk)
    command = adb + ['shell', 'am', 'instrument', '-w', '-e', 'size', str(args.size_mib * 1024 * 1024)]
    if not args.private:
        command += ['-e', 'destination', 'auto']
    result = subprocess.run(command + ['app.nlc.archiveqa/.ArchiveQA'], check=True, text=True, stdout=subprocess.PIPE)
    print(result.stdout)
    if 'INSTRUMENTATION_CODE: 0' not in result.stdout or 'INSTRUMENTATION_RESULT: error=' in result.stdout:
        raise SystemExit(1)
