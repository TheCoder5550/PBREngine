import { createRequire } from 'module'
const require = createRequire(import.meta.url)

import Vector from '../public/engine/vector.mjs';
import LoadCollider, { CreateGameObjectFromGLTF } from "./loadCollider.mjs";
import { PhysicsEngine, AABB } from '../public/engine/physics.mjs';
import { lerp, inverseLerp } from '../public/engine/helper.mjs';
import { distanceBetweenRayAndPoint } from '../public/engine/algebra.mjs';
import PlayerPhysicsBase from '../public/playerPhysicsBase.mjs';
import Quaternion from '../public/engine/quaternion.mjs';

console.log("Starting server...");

const WebSocket = require('ws');
const HttpsServer = require('https').createServer;
const fs = require("fs");

// var colliderPath = "../public/assets/models/gunTestRoom/collider.glb";
var mapPath = "../public/assets/models/checkerPlaneBig.glb";
var colliderPath = "../public/assets/models/checkerPlaneBig.glb";

var spawnPoints = [];
var physicsEngine;

var SIMULATED_PING = 0;//50;

(async function setup() {
  var map = (await CreateGameObjectFromGLTF(mapPath))[0];

  var spawnPointsObj = map.getChild("SpawnPoints", true);
  if (spawnPointsObj) {
    for (var child of spawnPointsObj.children) {
      spawnPoints.push(child.transform.worldPosition);
    }
  }
  else {
    spawnPoints.push(Vector.zero());
  }

  var mapCollider = (await CreateGameObjectFromGLTF(colliderPath))[0];

  physicsEngine = new PhysicsEngine();
  physicsEngine.addMeshCollider(mapCollider);
  physicsEngine.setupMeshCollider();

  console.log("Setup done!");

  loop();
})();

// const ip = "192.168.181.117";
const ip = "localhost";
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
var clientHistory = [];

wss.on('connection', ws => {
  console.log("New client! ", ws._socket.remoteAddress);

  ws.on('message', message => {
    setTimeout(function() {
      var parsed;
      try {
        parsed = JSON.parse(message);
      }
      catch(e) {
        return;
      }

      if (parsed.hasOwnProperty("type") && parsed.hasOwnProperty("data")) {
        if (parsed.type == "login") {
          ws.id = getNewID();//parsed.data.id;
          ws.name = parsed.data.username + "#" + getName(ws.id);

          ws.inputQueue = [];
          // ws.queuesToHandle = [];

          // ws.actionQueue = {
          //   id: -1,
          //   actionQueue: []
          // };
          // ws.lastActionId = -1;

          // ws.currentSimTime = new Date(parsed.clientSendTime).getTime();

          // new Vector(10, 3, 10)
          ws.gameData = new PlayerPhysicsBase();
          ws.gameData.physicsEngine = physicsEngine;
          ws.gameData.state = ws.gameData.STATES.IN_LOBBY;

          ws.gameData.localUpdatedTime = new Date();
          // ws.gameData.yRotation = 0;

          // ws.gameData = {
          //   localUpdatedTime: new Date(),
          //   position: {x: 10, y: 3, z: 10},
          //   velocity: {x: 0, y: 0, z: 0},

          //   isGrounded: false,
          //   fakeGroundNormal: Vector.up(),
          //   realGroundNormal: Vector.up(),

          //   coyoteTime: 0.11,
          //   jumpBuffering: 0.08,
          //   groundCounter: 0,
          //   jumpCounter: 0,

          //   crouching: false,

          //   friction: 10,
          //   yRotation: 0,
          //   // angle: 0,
          //   speed: 300,

          //   kills: 0,
          //   deaths: 0
          // };
          //ws.lastT = new Date();

          connectedClients[ws.id] = ws;

          console.log("Logged in as " + ws.name);
          send("login", {
            status: "success",
            id: ws.id,
            name: ws.name
          });
          broadcast("playerAction", {
            action: "joined",
            clientID: ws.id
          }, [ ws ]);
        }
        else if (parsed.type == "deploy") {
          if (ws.gameData.state == ws.gameData.STATES.IN_LOBBY) {
            ws.gameData.state = ws.gameData.STATES.PLAYING;
            ws.gameData.position = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

            send("deploy", {
              status: "success",
              position: ws.gameData.position
            });
            broadcast("deployOther", {
              clientID: ws.id,
              position: ws.gameData.position
            }, [ ws ]);
          }
          else {
            send("deploy", {
              status: "error"
            });
          }
        }
        else if (parsed.type == "updatePlayer") {
          ws.gameData.position = parsed.data.position;
          ws.gameData.angle = parsed.data.angle;
          ws.gameData.localUpdatedTime = parsed.clientSendTime;
        }
        else if (parsed.type == "inputs") {
          if (Array.isArray(parsed.data)) {
            ws.inputQueue = ws.inputQueue.concat(parsed.data);
          }
          else {
            ws.inputQueue.push(parsed.data);
          }
        }
        else if (parsed.type == "actionQueue") {
          // ws.actionQueue = parsed.data;
          ws.queuesToHandle.push(parsed.data);

          // for (var action of parsed.data.actionQueue) {
          //   simulateClientToTime(ws, new Date(action.time));

          //   if (action.type == "movement") {
          //     var dir = Vector.normalize(action.direction);
          //     ws.gameData.position.x += dir.x * action.speed * action.dt;
          //     ws.gameData.position.y += dir.y * action.speed * action.dt;
          //     ws.gameData.position.z += dir.z * action.speed * action.dt;
          //   }
          //   else if (action.type == "jump"/* && client.gameData.isGrounded*/) {
          //     ws.gameData.velocity.y = 6;
          //     ws.gameData.position.y += 0.05;
          //     ws.gameData.isGrounded = false;
          //   }
          // }
        }
        else if (parsed.type == "getAllPlayers") {
          var data = [];
          for (var key in connectedClients) {
            var client = connectedClients[key];
            if (client != ws) {
              data.push({
                id: client.id,
                name: client.name,
                data: {
                  state: client.gameData.state,
                  position: client.gameData.position,
                  velocity: client.gameData.velocity,
                  rotation: client.gameData.rotation,
                  crouching: client.gameData.crouching,
                  localUpdatedTime: client.gameData.localUpdatedTime
                }
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
        else if (parsed.type == "playerAction") {
          var action = parsed.data.action;
          for (var key in connectedClients) {
            var client = connectedClients[key];
            if (client != ws) {
              sendGlobal(client, "playerAction", {
                ...parsed.data,
                clientID: ws.id
              });
            }
          }
        }
        else if (parsed.type == "killPlayer") {
          var killedClient = connectedClients[parsed.data.clientID];

          if (
            ws.gameData.state == ws.gameData.STATES.PLAYING && 
            killedClient.gameData.state == killedClient.gameData.STATES.PLAYING
          ) { // Do server auth check
            killedClient.gameData.state = killedClient.gameData.STATES.DEAD;

            broadcast("killPlayer", {
              killed: parsed.data.clientID,
              killer: ws.id
            });

            setTimeout(function() {
              killedClient.gameData.state = killedClient.gameData.STATES.IN_LOBBY;
              killedClient.gameData.health = killedClient.gameData.maxHealth;
              sendGlobal(killedClient, "gotoLobby");
            }, 3000);
          }

          // sendGlobal(connectedClients[parsed.data.clientID], "killPlayer", {
          //   killer: ws.id
          // });
        }
        else if (parsed.type == "hit") {
          var time = new Date(parsed.data.hit.serverTimestamp).getTime();
          var state = getWorldState(time);
          if (state) {
            var t = inverseLerp(state[0].timestamp.getTime(), state[1].timestamp.getTime(), time);
            var clientPos = {
              x: lerp(state[0].clientPositions[parsed.data.hit.id].position.x, state[1].clientPositions[parsed.data.hit.id].position.x, t),
              y: lerp(state[0].clientPositions[parsed.data.hit.id].position.y, state[1].clientPositions[parsed.data.hit.id].position.y, t)
            };

            console.log(clientPos);
            console.log(parsed.data.hit.position);

            var dist = Vector.distance(parsed.data.hit.position, clientPos);
            if (dist < 20) {
              console.log("Hit!");
              sendGlobal(connectedClients[parsed.data.hit.id], "hit", {
                by: ws.id
              });
            }
            else {
              console.log("No hit!")
              console.log(dist);
            }
          }
          else {
            console.log("State not found!")
          }
        }
        else if (parsed.type == "ping") {
          send("ping", "Pong!!!", parsed.clientSendTime);
        }
      }
    }, SIMULATED_PING);
  });

  ws.on('close', function(reasonCode, description) {
    console.log("Client disconnected");

    broadcast("playerAction", {
      action: "left",
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

var fixedDeltaTime = 1 / 60;
const loopFPS = 15;
let tickLengthMs = 1000 / loopFPS;
let previous = hrtimeMs();

function loop() {
  setTimeout(loop, tickLengthMs)
  // let now = hrtimeMs()
  // let delta = (now - previous) / 1000;
  // previous = now;

  // console.time("Frame");
  var smallClients = {};
  for (var key in connectedClients) {
    var client = connectedClients[key];

    // if (client.gameData.state != client.gameData.STATES.PLAYING) {
    //   continue;
    // }

    if (client.inputQueue.length > 0) {
      for (var snapshot of client.inputQueue) {
        if (!snapshot.inputs) {
          continue; // bruh maybe
        }

        if (client.gameData.state == client.gameData.STATES.PLAYING) {
          client.gameData.rotation.y = snapshot.yRotation;
          client.gameData.applyInputs(snapshot.inputs, fixedDeltaTime);

          if (snapshot.inputs.fire) {
            fireBullet(client);
          }
        }

        client.gameData.simulatePhysicsStep(fixedDeltaTime);
      }

      sendGlobal(client, "getSelf", {
        gameData: {
          state: client.gameData.state,
          position: client.gameData.position,
          velocity: client.gameData.velocity,
          grounded: client.gameData.grounded,
          crouching: client.gameData.crouching,

          groundCounter: client.gameData.groundCounter,
          jumpCounter: client.gameData.jumpCounter,
          lastJumpInput: client.gameData.lastJumpInput,
          fakeGroundNormal: client.gameData.fakeGroundNormal,
          realGroundNormal: client.gameData.realGroundNormal
        },
        // currentSimTime: client.currentSimTime,
        lastProcessedTick: client.inputQueue[client.inputQueue.length - 1].tick
      });

      client.gameData.localUpdatedTime = client.inputQueue[client.inputQueue.length - 1].localTime;
      client.inputQueue = [];
    }

    continue;

    for (var actionQueue of client.queuesToHandle) {
      for (var action of actionQueue.actionQueue) {
        simulateClientToTime(client, action.time);

        if (action.type == "movement") {
          var dir = Vector.normalize(action.direction);
          client.gameData.position.x += dir.x * action.speed * action.dt;
          client.gameData.position.y += dir.y * action.speed * action.dt;
          client.gameData.position.z += dir.z * action.speed * action.dt;
        }
        else if (action.type == "jump" && client.gameData.isGrounded) {
          client.gameData.velocity.y = 6;
          client.gameData.position.y += 0.05;
          client.gameData.isGrounded = false;
        }

        solveCollision(client);
      }
    }

    var lastActionQueue = client.queuesToHandle[client.queuesToHandle.length - 1];
    if (lastActionQueue) {
      client.lastActionId = lastActionQueue.id;
    }
    client.queuesToHandle = [];

    simulateClientToTime(client, new Date());

    sendGlobal(client, "getSelf", {
      gameData: {...client.gameData},
      currentSimTime: client.currentSimTime,
      lastActionId: client.lastActionId
    });

    continue;



    //var speed = client.gameData.speed;

    // client.gameData.velocity.y -= 18 * fixedDeltaTime;

    // if (client.gameData.position.y < -30) {
    //   client.gameData.position = {x: 10, y: 3, z: 10};
    //   client.gameData.velocity = Vector.zero();
    // }

    for (var i = 0; i < client.actionQueue.actionQueue.length; i++) {
      var action = client.actionQueue.actionQueue[i];

      if (action.type == "movement") {
        var dir = Vector.normalize(action.direction);
        client.gameData.position.x += dir.x * action.speed * action.dt;
        client.gameData.position.y += dir.y * action.speed * action.dt;
        client.gameData.position.z += dir.z * action.speed * action.dt;
      }
      else if (action.type == "jump" && client.gameData.isGrounded) {
        client.gameData.velocity.y = 6;
        client.gameData.position.y += 0.05;
        client.gameData.isGrounded = false;
      }

      solveCollision(client);
    }
    client.lastActionId = client.actionQueue.id;
    // if (client.actionQueue.actionQueue.length > 0) {
    //   sendGlobal(client, "getSelf", {
    //     gameData: {...client.gameData},
    //     lastActionId: client.lastActionId
    //   });
    // }
    client.actionQueue.actionQueue = [];

    physicsStep(client, fixedDeltaTime);

    // client.gameData.position = Vector.add(client.gameData.position, Vector.multiply(client.gameData.velocity, fixedDeltaTime));

    //if (client.gameData.position.x > 300) client.gameData.position.x = 300;

    smallClients[client.id] = {
      position: {...client.gameData.position},
      velocity: {...client.gameData.velocity}
    };

    /*if (client.keysPressed[87]) client.gameData.position.y -= speed * dt;
    if (client.keysPressed[83]) client.gameData.position.y += speed * dt;
    if (client.keysPressed[65]) client.gameData.position.x -= speed * dt;
    if (client.keysPressed[68]) client.gameData.position.x += speed * dt;*/

    /*for (var otherKey in connectedClients) {
      var otherClient = connectedClients[otherKey];
      if (otherClient != client) {
        var dist = getDistance(client.gameData.position, otherClient.gameData.position);
        if (dist != 0 && dist < 40) {
          var error = 40 - dist;
          var normal = normalize(subtract(client.gameData.position, otherClient.gameData.position));

          client.gameData.position.x += normal.x * error;
          client.gameData.position.y += normal.y * error;
          //otherClient.gameData.position.x += -normal.x * error / 2;
          //otherClient.gameData.position.y += -normal.y * error / 2;
        }
      }
    }*/
  }

  // console.timeEnd("Frame");

  // console.log("loop")

  // clientHistory.push({
  //   timestamp: new Date().getTime(),
  //   clientPositions: smallClients
  // });
  // if (clientHistory.length > 500) clientHistory.shift();

}

function fireBullet(shooter) {
  for (var key in connectedClients) {
    var client = connectedClients[key];
    if (client != shooter) {
      console.log(distanceBetweenRayAndPoint({
        origin: shooter.gameData.position,
        direction: shooter.gameData.forward
      }, client.gameData.position));
    }
  }
}

function getWorldState(time) {
  var clientHistoryCopy = [...clientHistory];
  clientHistoryCopy.sort(function(a, b) {
    return b.timestamp - a.timestamp;
  });

  for (var i = 0; i < clientHistoryCopy.length; i++) {
    var snapshot = clientHistoryCopy[i];
    if (time > snapshot.timestamp) {
      console.log(time - snapshot.timestamp);
      return [snapshot, clientHistoryCopy[i + 1], clientHistoryCopy[i - 1]];
    }
  }
}

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
      if (typeof value === 'object' && value !== null) {
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

function getName(id) {
  return "ID:" + id;
}

function getNewID() {
  var id;
  do {
    id = getRandomID();
  } while (idExists(id));

  return id;
}

function idExists(id) {
  for (var key in connectedClients) {
    var client = connectedClients[key];
    if (client.id == id) {
      return true;
    }
  }

  return false;
}

function getRandomID() {
  return Math.floor(Math.random() * 1e6);
}

function hrtimeMs() {
  let time = process.hrtime()
  return time[0] * 1000 + time[1] / 1000000
}