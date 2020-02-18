'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const WsJsonProtocol = require('../lib/ws-json');

const client_key = process.argv[2];
const server_host_port = process.argv[3];
const forward_base_uri = process.argv[4];

if (client_key === undefined) {
  throw new Error("Missing client key.");
}

const ws_ = new WebSocket(`ws://${server_host_port}/ws/${client_key}`);
const ws = new WsJsonProtocol(ws_);

class RequestForwarder extends Object {
  constructor(ws, forward_base_uri) {
    super();
    if (!forward_base_uri) throw new Error("Missing the base uri to forward to.");
    let parsed_uri = new URL(forward_base_uri);
    if (parsed_uri.search) throw new Error("Search path is not implemented yet for forward base uri.");
    if (!parsed_uri.protocol.match(/^https?:$/i)) throw new Error(`Only HTTP(s) protocol is implemented for forward base uri (got ${parsed_uri.protocol}).`);
    this._forward_base_uri = parsed_uri;
    this._ws = ws;
  }

  fire_request(message, ) {
    const ireq = message.request;
    console.log(`< ${message.channel}:  ${ireq.method} ${ireq.url}`);
    let oreq_uri = new URL(this._forward_base_uri.toString()); // clone the original uri
    oreq_uri.href = path.posix.join(oreq_uri.href, ireq.url);
    const req_params = {
      method: ireq.method,
      headers: ireq.headers,
    }
    let _send = this._send.bind(this);
    let sender = function sender(event_id) {
      return function (data) {
        if (event_id != 'data') 
          console.log(`<:  ${message.channel}:  ${event_id} ${ireq.method} ${oreq_uri.pathname}`);
        _send({
          channel: message.channel,
          id: message.id,
          event: event_id,
          data: data,
        })
      }
    }
    console.log(` :> ${message.channel}:  ${ireq.method} ${oreq_uri.pathname}`);
    const req = http.request(oreq_uri.toString(), req_params, function handleResponse(res) {
      res.setEncoding('utf8');
      console.log(`<:  ${message.channel}:  ${res.statusCode} ${res.statusMessage} / ${ireq.method} ${oreq_uri.pathname}`);
      sender('headers')({
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        headers: res.headers,
      });
      res.on('data', sender('data'));
      res.on('end', sender('end'));
    });
    req.on('error', sender('error'));
    if (ireq.body) {
      req.write(ireq.body);
    }
    req.end();
  }

  _send(data) {
    this._ws.send(data);
  }

  on_message(message) {
    if (!message.channel || message.channel.indexOf('/req/') != 0) return;
    else this.fire_request(message);
  }
}


ws.on('open', function open() {
  const request_forwarder = new RequestForwarder(ws, forward_base_uri);
  console.log("Client connection openned.");

  ws.send({data:"Hallo."});
  ws.on("message", function (message) {
    request_forwarder.on_message(message);
  });
  ws.on("close", function onClose() {
    console.log("Client connection closed.");
    process.exit()
  });
});
