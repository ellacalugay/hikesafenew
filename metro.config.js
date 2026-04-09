const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// This repo is nested (hikesafe_purr/hikesafenew). Metro sometimes resolves
// modules from the parent folder. Force resolution to this app's node_modules.
const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
};

module.exports = config;
