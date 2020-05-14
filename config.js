const fs   = require('fs'),
      path = require('path'),
      merge    = require('merge');

function val(envName, defaultValue) {
  return (process.env[envName]) ? process.env[envName] : defaultValue;
}

let CONFIG = {
  server: {
    host: val('ADDRESS', 'localhost'),
    port: val('PORT', '8090'),
    // authenticator config
    // null - no authenticator (allow any key to pass)
    // http(s)://... - a url for key-master APIs
    keyServerUrl: val('AUTHENTICATOR', undefined),
  },
  client: {
    key: val('KEY', 'client-1'),
    serverUrl: val('SERVER_URL', 'ws://localhost:8090'),
    forwardTo: val('FORWARD_TO', 'http://prusa3d.local'),
  },
  logVerbosity: val('VERBOSITY', 3),
  requestTimeout: val('REQUEST_TIMEOUT', 30000),
}

if (fs.existsSync(path.join(__dirname, 'config-local.js')) || fs.existsSync(path.join(__dirname, 'config-local/index.js'))) {
  let localConfig = require('./config-local');
  CONFIG = merge.recursive(CONFIG, localConfig);
}
module.exports = CONFIG;
