//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const test = require('ava'),
      { MessagingMock } = require('./_request.mock'),
      Api = require('../server/api'),
      ClientsManager = require('../server/clients-manager'),
      { packMessage, unpackMessage } = require('../server/ws-message');

test.before(t => {
  const basePath = '/apipath',
        clientKey = 'client-1',
        clientsManager = new ClientsManager(),
        api = new Api(basePath, clientsManager),
        ws = new MessagingMock(),
        client = clientsManager.makeClient(clientKey),
        request = new MessagingMock(),
        response = new MessagingMock();
    
  response.__replace('writeHead');
  response.__replace('write');
  response.__replace('end');

  // connect a client
  clientsManager.onConnected(ws, client);

  t.context = {
    apiUrl: `${basePath}/${clientKey}`,
    ws: ws,
    client: client,
    api: api,
    request: request,
    response: response,
  }

});

test.cb('resends request', t => {
  const { request, response, ws, api, apiUrl } = t.context;
  const targetPath =  '/something',
        requestPayload = 'some data to send',
        requestData = {
          method: 'GET',
          url: `${apiUrl}${targetPath}`,
          headers: {'x-h': 'x-v'},
        };

  Object.assign(request, requestData);
  api.request_handler(request, response);

  let message = unpackMessage(ws.__lastMessage);
  t.is(message.event, 'headers');
  t.is(message.data.url, targetPath);

  request.emit('data', Buffer.from(requestPayload));
  t.is(unpackMessage(ws.__lastMessage).data, requestPayload);

  function onMessage (message) {
    if(unpackMessage(message).event === 'end') {
      ws.__off('message', onMessage);
      t.end();
    }
  }

  ws.__on('message', onMessage);
  request.emit('end');

});

test.cb('fails on error', t => {
  const { request, response, ws, api, apiUrl, client } = t.context;
  const targetPath =  '/something',
        requestData = { method: 'GET', url: `${apiUrl}${targetPath}`};

  Object.assign(request, requestData);
  api.request_handler(request, response);
  request.emit('end');

  let message = unpackMessage(ws.__lastMessage);

  ws.on('message', (message) => {
    unpackMessage(message).event == 'end' && t.end();
  });
  const serverResponse = { statusCode: 404, statusMessage: 'Not Found', headers: {a: 'b'}};
  client.emit('message', {
    event: 'headers',
    channel: message.channel,
    data: serverResponse,
  });
  response.__assertCalled('writeHead', [serverResponse.statusCode, serverResponse.statusMessage, serverResponse.headers]);
  ws.emit('message', packMessage({
    event: 'end',
    channel: message.channel,
  }));


});
