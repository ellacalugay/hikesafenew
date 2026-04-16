const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function withRNBackgroundActionsAndroid14Fix(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

      const taskJavaPath = path.join(
        projectRoot,
        'node_modules',
        'react-native-background-actions',
        'android',
        'src',
        'main',
        'java',
        'com',
        'asterinet',
        'react',
        'bgactions',
        'RNBackgroundActionsTask.java'
      );

      const manifestPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'AndroidManifest.xml'
      );

      // 1) Patch react-native-background-actions native code for Android 14+/targetSdk 34+.
      if (fs.existsSync(taskJavaPath)) {
        const src = fs.readFileSync(taskJavaPath, 'utf8');

        let patched = src;
        let changed = false;

        // Android 14 (targetSdk 34+) disallows implicit PendingIntents that are FLAG_MUTABLE.
        // Keep existing behavior by ensuring we still include FLAG_UPDATE_CURRENT when we remove mutability.
        if (patched.includes('PendingIntent.FLAG_MUTABLE')) {
          patched = patched.replaceAll(
            'PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE',
            'PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE'
          );
          patched = patched.replaceAll(
            'PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT',
            'PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT'
          );
          patched = patched.replaceAll(
            'PendingIntent.FLAG_MUTABLE',
            'PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE'
          );
          changed = true;
        }

        // Prefer an explicit intent for the app launch, instead of ACTION_MAIN/CATEGORY_LAUNCHER.
        // This avoids "unsafe implicit PendingIntent" restrictions when targeting Android 14+.
        if (
          !patched.includes('getLaunchIntentForPackage') &&
          patched.includes('notificationIntent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);')
        ) {
          patched = patched.replace(
            'notificationIntent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);',
            [
              'notificationIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());',
              '            if (notificationIntent == null) {',
              '                notificationIntent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);',
              '            }',
            ].join('\n')
          );
          changed = true;
        }

        // Android 14+ (targetSdk 34+) requires specifying a foreground service type when calling startForeground().
        // react-native-background-actions 3.0.1 uses the 2-arg overload, which crashes on Android 14+ when targetSdk >= 34.
        if (
          !patched.includes('FOREGROUND_SERVICE_TYPE_') &&
          patched.includes('startForeground(') &&
          /startForeground\(.*?,\s*notification\s*\);/.test(patched)
        ) {
          // Ensure ServiceInfo import exists.
          if (!patched.includes('import android.content.pm.ServiceInfo;')) {
            if (patched.includes('import android.os.Build;')) {
              patched = patched.replace(
                'import android.os.Build;',
                'import android.os.Build;\nimport android.content.pm.ServiceInfo;'
              );
            } else {
              patched = patched.replace(
                /(package [^;]+;\s*)\r?\n/,
                '$1\n\nimport android.content.pm.ServiceInfo;\n'
              );
            }
          }

          patched = patched.replace(
            /(\s*)startForeground\(\s*([^,\)]+)\s*,\s*notification\s*\);/g,
            [
              '$1if (android.os.Build.VERSION.SDK_INT >= 34) {',
              '$1    startForeground($2, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC | ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);',
              '$1} else {',
              '$1    startForeground($2, notification);',
              '$1}',
            ].join('\n')
          );
          changed = true;
        }

        if (changed) {
          fs.writeFileSync(taskJavaPath, patched, 'utf8');
        }
      }

      // 2) Ensure the service is declared with a foregroundServiceType so startForeground(type) is valid.
      // Note: /android is typically generated (gitignored) in Expo projects, so we patch it during prebuild.
      if (fs.existsSync(manifestPath)) {
        const src = fs.readFileSync(manifestPath, 'utf8');

        let patched = src;
        let changed = false;

        // Ensure tools namespace is available (needed for tools:replace).
        if (!patched.includes('xmlns:tools="http://schemas.android.com/tools"')) {
          const manifestTag = patched.match(/<manifest\b[^>]*>/)?.[0];
          if (
            manifestTag &&
            manifestTag.includes('xmlns:android="http://schemas.android.com/apk/res/android"')
          ) {
            const nextTag = manifestTag.replace(
              />$/,
              ' xmlns:tools="http://schemas.android.com/tools">'
            );
            if (nextTag !== manifestTag) {
              patched = patched.replace(manifestTag, nextTag);
              changed = true;
            }
          }
        }

        if (!patched.includes('android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE')) {
          const re = /(<uses-permission android:name="android\.permission\.FOREGROUND_SERVICE"\/>\s*\r?\n)/;
          if (re.test(patched)) {
            patched = patched.replace(
              re,
              `$1  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE"/>\n`
            );
            changed = true;
          }
        }

        if (!patched.includes('com.asterinet.react.bgactions.RNBackgroundActionsTask')) {
          const serviceBlock = [
            '    <service',
            '      android:name="com.asterinet.react.bgactions.RNBackgroundActionsTask"',
            '      android:exported="false"',
            '      android:foregroundServiceType="dataSync|connectedDevice"',
            '      tools:replace="android:exported,android:foregroundServiceType" />',
            '',
          ].join('\n');

          const mainActivityMarker = '    <activity android:name=".MainActivity"';
          if (patched.includes(mainActivityMarker)) {
            patched = patched.replace(
              mainActivityMarker,
              `${serviceBlock}${mainActivityMarker}`
            );
            changed = true;
          } else if (patched.includes('  </application>')) {
            patched = patched.replace(
              '  </application>',
              `${serviceBlock}  </application>`
            );
            changed = true;
          }
        }

        if (changed) {
          fs.writeFileSync(manifestPath, patched, 'utf8');
        }
      }

      return config;
    },
  ]);
};
