const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

// VendorAI Brand System and other shared workspace packages live outside the
// Expo app folder. Watch the monorepo root so mobile can consume the same
// design tokens used by the public site and authenticated web app.
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));

module.exports = config;
