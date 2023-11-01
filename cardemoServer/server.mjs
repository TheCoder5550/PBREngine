import { createRequire } from 'module';
import Matrix from '../public/engine/matrix.mjs'; // Most import matrix before quaternion...
import Quaternion from '../public/engine/quaternion.mjs';
import Vector from '../public/engine/vector.mjs';
const require = createRequire(import.meta.url);

console.log("Starting server...");

const WebSocket = require("ws");
const HttpsServer = require("https").createServer;
const fs = require("fs");

const SIMULATED_PING = 0;//50;

(async function setup() {
  console.log("Setup done!");
})();

// const ip = "192.168.181.117";
const ip = "127.0.0.1";
const port = 8080;
const certPath = "C:\\Users\\alfon\\Documents\\HTTPS self signed certificates\\server.crt";
const keyPath = "C:\\Users\\alfon\\Documents\\HTTPS self signed certificates\\server.key";
const passphrasePath = "C:\\Users\\alfon\\Documents\\HTTPS self signed certificates\\passphrase.txt";

const server = HttpsServer({
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
  passphrase: fs.readFileSync(passphrasePath).toString(),
});
const wss = new WebSocket.Server({
  server: server
});
// const wss = new WebSocket.Server({ port: 8080 });

var connectedClients = {};

wss.on("connection", ws => {
  console.log("New client! ", ws._socket.remoteAddress);

  ws.id = Math.floor(Math.random() * 100);
  connectedClients[ws.id] = ws;

  ws.gameData = {
    position: Vector.zero(),
    rotation: Quaternion.identity(),
    velocity: Vector.zero(),
    angularVelocity: Vector.zero(),
    steerInput: 0,
    driveInput: 0,
    ebrakeInput: 0,
    brakeInput: 0,
    clutchInput: 0,
  };

  console.log(ws.id);

  broadcast("playerAction", {
    action: "join",
    clientID: ws.id
  }, [ ws ]);

  ws.on("message", message => {
    setTimeout(function() {
      var parsed;
      try {
        parsed = JSON.parse(message);
      }
      catch(e) {
        console.warn(e);
        return;
      }

      if (parsed.hasOwnProperty("type") && parsed.hasOwnProperty("data")) {
        if (parsed.type == "updatePlayer") {
          for (const key in ws.gameData) {
            if (key in parsed.data) {
              ws.gameData[key] = parsed.data[key];
            }
          }
        }
        else if (parsed.type == "getAllPlayers") {
          var data = [];
          for (var key in connectedClients) {
            var client = connectedClients[key];
            if (client != ws) {
              data.push({
                clientID: client.id,
                name: client.name,
                data: client.gameData
              });
            }

            // if (client == ws) {
            //   send("getSelf", {
            //     serverTime: new Date().getTime(),
            //     gameData: client.gameData,
            //     lastActionId: client.lastActionId
            //   }, parsed.clientSendTime);
            // }
          }
          send("getAllPlayers", data, parsed.clientSendTime);
        }
        else if (parsed.type == "ping") {
          send("ping", "Pong!!!", parsed.clientSendTime);
        }
      }
    }, SIMULATED_PING);
  });

  ws.on("close", function(reasonCode, description) {
    console.log("Client disconnected", reasonCode, description);

    broadcast("playerAction", {
      action: "leave",
      clientID: ws.id
    }, [ ws ]);

    delete connectedClients[ws.id];
  });

  function send(type, data = null, clientSendTime) {
    sendGlobal(ws, type, data, clientSendTime);
  }
});
server.listen(port, ip, () => {
  console.log(server.address());
});

function broadcast(type, data = null, exclude = []) {
  for (var key in connectedClients) {
    var client = connectedClients[key];
    if (!exclude.includes(client)) {
      sendGlobal(client, type, data);
    }
  }
}

function sendGlobal(client, type, data = null, clientSendTime) {
  if (client) {
    var cache = [];
    var json = JSON.stringify({
      type: type,
      data: data,
      serverTimestamp: new Date().getTime(),
      clientSendTime: clientSendTime
    }, (key, value) => {
      if (typeof value === "object" && value !== null) {
        // Duplicate reference found, discard key
        if (cache.includes(value)) return;

        // Store value in our collection
        cache.push(value);
      }
      return value;
    });
    cache = null; // Enable garbage collection

    client.send(json);
  }
}