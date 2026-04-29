const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch workspace root so @cricket-os/shared and other packages resolve
config.watchFolders = [workspaceRoot];

// Mobile node_modules first — wins over root for all hoisted packages
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
];

// Force react-native to ALWAYS resolve from mobile's own node_modules.
// react-native-svg is hoisted to root/node_modules by npm workspace hoisting,
// so when Metro bundles it, standard node resolution finds root's react-native@0.85.2
// (which has TypeScript syntax the Flow parser can't handle).
// resolveRequest intercepts every resolution in Metro — wins over all other strategies.
// context.resolveRequest is bound to its original Metro instance, so spreading
// context with a different originModulePath has no effect. Instead, we pass an
// ABSOLUTE path as the module name — Metro treats path.isAbsolute() === true as
// a direct filesystem lookup and applies platform/extension fallbacks correctly.
// Pin these packages to mobile's node_modules. npm workspace hoisting installs
// mismatched versions at root (react-native@0.85.2, react@19.x) which break
// the bundle when packages like react-native-svg or @expo-google-fonts pull them in.
// react and react-native must be pinned — root has React 19 and react-native@0.85.2
// from npm workspace peer-dep hoisting, both incompatible with Expo SDK 51 (RN 0.74 / React 18).
// scheduler is always co-located with react in the same node_modules, so it resolves
// correctly without pinning once react itself is pinned.
const PINNED = ['react-native', 'react'];
const mobileModules = path.join(projectRoot, 'node_modules');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinnedPkg = PINNED.find(
    pkg => moduleName === pkg || moduleName.startsWith(pkg + '/')
  );
  if (pinnedPkg) {
    const subpath = moduleName.startsWith(pinnedPkg + '/')
      ? moduleName.slice(pinnedPkg.length + 1)
      : null;
    const absolutePath = subpath
      ? path.join(mobileModules, pinnedPkg, subpath)
      : path.join(mobileModules, pinnedPkg);
    return context.resolveRequest(context, absolutePath, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
