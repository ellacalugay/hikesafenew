const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function withRNBackgroundActionsAndroid14Fix(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const filePath = path.join(
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

      if (!fs.existsSync(filePath)) {
        return config;
      }

      const src = fs.readFileSync(filePath, 'utf8');

      if (!src.includes('PendingIntent.FLAG_MUTABLE')) {
        // Already patched or upstream changed; leave as-is.
        return config;
      }

      const patched = src.replace(
        'PendingIntent.FLAG_MUTABLE',
        'PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE'
      );

      fs.writeFileSync(filePath, patched, 'utf8');

      return config;
    },
  ]);
};
