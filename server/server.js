'use strict';
// vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const WebSocket = require('ws'),
      config = require('../config'),
      { HttpError }    = require('./HttpError'),
      { unpackMessage } = require('./ws-message'),
      { debug, info, warning, error, DEBUG } = require('../lib/logger'),
      Sentry = require('@sentry/node');

/*
 * @clientsManager ... function (request, callback) which calls callback(err, client).
 *                    `err` is empty on success and client which should be an object with `key` property.
 */
function setupWebsocketServer(httpServer, clientsManager) {
  const webSocketServer = new WebSocket.Server({ noServer: true });

  webSocketServer.on('connection', function connection(/*ws, request, client*/) {
    if (config.logVerbosity >= DEBUG) {
      debug('Clients:')
      webSocketServer.clients.forEach(function each(clientWs) {
        debug(`- ${clientWs.client}`);
      });
    }
    info(`STAT: ${webSocketServer.clients.size} devices connected`);
  });

  /**
   * Called when client requests upgrade to WebSocket
   */
  httpServer.on('upgrade', function upgrade(request, socket, head) {
    debug("Upgrading protocol to websocket.");
    clientsManager.authenticate(request, socket, (err, client) => {
      if (err || !client) {
        let scope = new Sentry.Scope();
        scope.setExtra('url', request.url);
        if (err instanceof HttpError) {
          Sentry.captureMessage(`Authentication failed with "${err}": ${err.description}`, ()=>scope);
          warning(`Authentication failed with "${err}": ${err.description}`);
          socket.end(`HTTP/1.1 ${err.code} ${err.message}\r\nContent-Type: text/plain\r\n\r\n${err.description}\n\n`, 'ascii');
        } else {
          Sentry.captureException(err, ()=>scope);
          error(`Authentication failed on fatal error ${err}.`);
          socket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n', 'ascii');
        }
        debug("Destroying connection");
        socket.destroy();
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, function done(ws) {
        ws.on('close', function onClose() {
          debug(`Client ${client.id} closed connection.`);
          clientsManager.onClose(ws, client);
        });
        ws.on('message', (message)=>{
          try {
            message = unpackMessage(message);
          } catch(error) { // unparsable message
            Sentry.captureException(error);
            client.send({channel: 'error', event: 'error.', data: 'Unparsable message.'});
            return;
          }
          clientsManager.onMessage(message, ws, client);
        });
        clientsManager.onConnected(ws, client);
        ws.client_object = client;
        webSocketServer.emit('connection', ws, request, client);
      });
    });
  });
  return webSocketServer;
}

module.exports = setupWebsocketServer;
