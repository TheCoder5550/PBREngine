import { createRequire } from "module";
const require = createRequire(import.meta.url);

import Vector from "../public/engine/vector.mjs";
import { CreateGameObjectFromGLTF } from "./loadCollider.mjs";
import { PhysicsEngine } from "../public/engine/physics.mjs";
import { lerp, inverseLerp } from "../public/engine/helper.mjs";
import PlayerPhysicsBase from "../public/playerPhysicsBase.mjs";

console.log("Starting server...");

const WebSocket = require("ws");
const HttpsServer = require("https").createServer;
const fs = require("fs");

const mapPath = "../public/assets/models/maps/beta/model.glb";
const colliderPath = "../public/assets/models/maps/beta/model.glb";

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

const ip = "192.168.181.117";
// const ip = "localhost";
const port = 8080;
const certPath = "C:\\Users\\alfon\\Documents\\HTTPS self signed certificates\\server.crt";
const keyPath = "C:\\Users\\alfon\\Documents\\HTTPS self signed certificates\\server.key";
const passphrasePath = "C:\\Users\\alfon\\Documents\\HTTPS self signed certificates\\passphrase.txt";

const server = HttpsServer({
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
  passphrase: fs.readFileSync(passphrasePath).toString(),
});
server.listen(port, ip, () => {
  console.log(server.address());
});

const wssHTTPS = new WebSocket.Server({ server: server });
const wssHTTP = new WebSocket.Server({ port });

setupWSS(wssHTTPS);
setupWSS(wssHTTP);

setTimeout(() => {
  for (let i = 0; i < 1; i++) {
    new Bot();
  }
}, 1000);

var connectedClients = {};
var clientHistory = [];

function setupWSS(wss) {
  wss.on("connection", ws => {
    console.log("New client! ", ws._socket.remoteAddress);
  
    ws.on("message", message => {
      setTimeout(function() {
        var parsed;
        try {
          parsed = JSON.parse(message);
        }
        catch(e) {
          return;
        }
  
        // eslint-disable-next-line no-prototype-builtins
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
            ws.gameData.ads = false;
            ws.gameData.adsT = 0;
            ws.gameData.currentWeaponName = "";
            ws.gameData.kills = 0;
            ws.gameData.deaths = 0;
            ws.gameData.lastTimeTakingDamage = 0;
  
            ws.gameData.localUpdatedTime = new Date();
            // ws.gameData.yRotation = 0;
  
            // ws.lastT = new Date();
  
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
              ws.gameData.position = getSpawnPoint();
              Vector.zero(ws.gameData.velocity);
  
              if (parsed.data) {
                ws.name = parsed.data.username + "#" + getName(ws.id);
              }
  
              send("deploy", {
                status: "success",
                position: ws.gameData.position,
                name: ws.name,
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
            for (const key in connectedClients) {
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
                    grounded: client.gameData.grounded,
                    ads: client.gameData.adsT,
                    currentWeaponName: client.gameData.currentWeaponName,
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
            for (const key in connectedClients) {
              const client = connectedClients[key];
              if (client != ws) {
                if (
                  parsed.data.action === "takeDamage" &&
                  parsed.data.targetClientId === client.id &&
                  parsed.data.damage > 0
                ) {
                  client.gameData.lastTimeTakingDamage = parsed.clientSendTime;
                }

                sendGlobal(client, "playerAction", {
                  ...parsed.data,
                  clientID: ws.id
                });
              }
            }
          }
          else if (parsed.type == "killPlayer") {
            const killedClient = connectedClients[parsed.data.clientID];
            const killerClient = ws;
  
            if (
              ws.gameData.state == ws.gameData.STATES.PLAYING && 
              killedClient.gameData.state == killedClient.gameData.STATES.PLAYING
            ) { // Do server auth check
              killedClient.gameData.state = killedClient.gameData.STATES.DEAD;
              killedClient.gameData.velocity = Vector.zero();
  
              killerClient.gameData.kills++;
              killedClient.gameData.deaths++;

              broadcast("killPlayer", {
                killed: parsed.data.clientID,
                killer: killerClient.id,

                killerKills: killerClient.gameData.kills,
                killerDeaths: killerClient.gameData.deaths,

                killedKills: killedClient.gameData.kills,
                killedDeaths: killedClient.gameData.deaths,

                killEffects: parsed.data.killEffects,
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
                console.log("No hit!");
                console.log(dist);
              }
            }
            else {
              console.log("State not found!");
            }
          }
          else if (parsed.type == "ping") {
            send("ping", "Pong!!!", parsed.clientSendTime);
          }
          else if (parsed.type == "syncClock") {
            send(parsed.type, {
              currentServerTime: new Date().valueOf(),
              currentClientTime: parsed.data.currentClientTime,
              iteration: parsed.data.iteration,
            }, parsed.clientSendTime);
          }
        }
      }, SIMULATED_PING);
    });
  
    ws.on("close", function(/*reasonCode, description*/) {
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
}

var fixedDeltaTime = 1 / 60;
const loopFPS = 15;
let tickLengthMs = 1000 / loopFPS;
// let previous = hrtimeMs();

function loop() {
  setTimeout(loop, tickLengthMs);
  // let now = hrtimeMs()
  // let delta = (now - previous) / 1000;
  // previous = now;

  // console.time("Frame");
  // var smallClients = {};
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

        if (new Date().valueOf() > client.gameData.lastTimeTakingDamage + 1000 * 5) {
          sendGlobal(client, "playerAction", {
            action: "takeDamage",
            damage: -1,
            targetClientId: client.id,
          });
        }

        if (client.gameData.state == client.gameData.STATES.PLAYING) {
          client.gameData.rotation = snapshot.rotation;
          client.gameData.ads = snapshot.inputs.ads;
          client.gameData.currentWeaponName = snapshot.inputs.currentWeaponName;
          client.gameData.applyInputs(snapshot.inputs, fixedDeltaTime);

          if (snapshot.inputs.fire) {
            fireBullet(client);
          }
        }

        const adsSpeed = 0.3;
        client.gameData.adsT += -(client.gameData.adsT - (client.gameData.ads ? 0 : 1)) * adsSpeed;

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

    // for (var actionQueue of client.queuesToHandle) {
    //   for (var action of actionQueue.actionQueue) {
    //     simulateClientToTime(client, action.time);

    //     if (action.type == "movement") {
    //       var dir = Vector.normalize(action.direction);
    //       client.gameData.position.x += dir.x * action.speed * action.dt;
    //       client.gameData.position.y += dir.y * action.speed * action.dt;
    //       client.gameData.position.z += dir.z * action.speed * action.dt;
    //     }
    //     else if (action.type == "jump" && client.gameData.isGrounded) {
    //       client.gameData.velocity.y = 6;
    //       client.gameData.position.y += 0.05;
    //       client.gameData.isGrounded = false;
    //     }

    //     solveCollision(client);
    //   }
    // }

    // var lastActionQueue = client.queuesToHandle[client.queuesToHandle.length - 1];
    // if (lastActionQueue) {
    //   client.lastActionId = lastActionQueue.id;
    // }
    // client.queuesToHandle = [];

    // simulateClientToTime(client, new Date());

    // sendGlobal(client, "getSelf", {
    //   gameData: {...client.gameData},
    //   currentSimTime: client.currentSimTime,
    //   lastActionId: client.lastActionId
    // });

    // continue;



    // //var speed = client.gameData.speed;

    // // client.gameData.velocity.y -= 18 * fixedDeltaTime;

    // // if (client.gameData.position.y < -30) {
    // //   client.gameData.position = {x: 10, y: 3, z: 10};
    // //   client.gameData.velocity = Vector.zero();
    // // }

    // for (var i = 0; i < client.actionQueue.actionQueue.length; i++) {
    //   var action = client.actionQueue.actionQueue[i];

    //   if (action.type == "movement") {
    //     var dir = Vector.normalize(action.direction);
    //     client.gameData.position.x += dir.x * action.speed * action.dt;
    //     client.gameData.position.y += dir.y * action.speed * action.dt;
    //     client.gameData.position.z += dir.z * action.speed * action.dt;
    //   }
    //   else if (action.type == "jump" && client.gameData.isGrounded) {
    //     client.gameData.velocity.y = 6;
    //     client.gameData.position.y += 0.05;
    //     client.gameData.isGrounded = false;
    //   }

    //   solveCollision(client);
    // }
    // client.lastActionId = client.actionQueue.id;
    // // if (client.actionQueue.actionQueue.length > 0) {
    // //   sendGlobal(client, "getSelf", {
    // //     gameData: {...client.gameData},
    // //     lastActionId: client.lastActionId
    // //   });
    // // }
    // client.actionQueue.actionQueue = [];

    // physicsStep(client, fixedDeltaTime);

    // // client.gameData.position = Vector.add(client.gameData.position, Vector.multiply(client.gameData.velocity, fixedDeltaTime));

    // //if (client.gameData.position.x > 300) client.gameData.position.x = 300;

    // smallClients[client.id] = {
    //   position: {...client.gameData.position},
    //   velocity: {...client.gameData.velocity}
    // };

    // /*if (client.keysPressed[87]) client.gameData.position.y -= speed * dt;
    // if (client.keysPressed[83]) client.gameData.position.y += speed * dt;
    // if (client.keysPressed[65]) client.gameData.position.x -= speed * dt;
    // if (client.keysPressed[68]) client.gameData.position.x += speed * dt;*/

    // /*for (var otherKey in connectedClients) {
    //   var otherClient = connectedClients[otherKey];
    //   if (otherClient != client) {
    //     var dist = getDistance(client.gameData.position, otherClient.gameData.position);
    //     if (dist != 0 && dist < 40) {
    //       var error = 40 - dist;
    //       var normal = normalize(subtract(client.gameData.position, otherClient.gameData.position));

    //       client.gameData.position.x += normal.x * error;
    //       client.gameData.position.y += normal.y * error;
    //       //otherClient.gameData.position.x += -normal.x * error / 2;
    //       //otherClient.gameData.position.y += -normal.y * error / 2;
    //     }
    //   }
    // }*/
  }

  // console.timeEnd("Frame");

  // console.log("loop")

  // clientHistory.push({
  //   timestamp: new Date().getTime(),
  //   clientPositions: smallClients
  // });
  // if (clientHistory.length > 500) clientHistory.shift();

}

function getSpawnPoint() {
  const weights = [];

  for (const spawnPoint of spawnPoints) {
    let minimumDistance = Infinity;
    for (const id in connectedClients) {
      const client = connectedClients[id];
      if (client.gameData.state === client.gameData.STATES.PLAYING) {
        const distance = Vector.distance(client.gameData.position, spawnPoint);
        minimumDistance = Math.min(distance, minimumDistance);
      }
    }

    weights.push(minimumDistance);
  }

  return weightedRandom(spawnPoints, weights);
}

function weightedRandom(items, weights) {
  for (let i = 1; i < weights.length; i++) {
    weights[i] += weights[i - 1];
  }
  
  const random = Math.random() * weights[weights.length - 1];
  
  let i;
  for (i = 0; i < weights.length; i++)
    if (weights[i] > random)
      break;
  
  return items[i];
}

function fireBullet(shooter) {
  for (var key in connectedClients) {
    var client = connectedClients[key];
    if (client != shooter) {
      // console.log(distanceBetweenRayAndPoint({
      //   origin: shooter.gameData.position,
      //   direction: shooter.gameData.forward
      // }, client.gameData.position));
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

// function hrtimeMs() {
//   let time = process.hrtime();
//   return time[0] * 1000 + time[1] / 1000000;
// }

function Bot() {
  const username = "BOT" + Math.random();
  let id = -1;

  let loopInterval = null;

  // const addressInfo = server.address();
  // const ws = new WebSocket(`wss://${addressInfo.address}:${addressInfo.port}`);
  const ws = new WebSocket("ws://localhost:8080");
  ws.onopen = () => {
    console.log("Connected!");

    sendMessage("login", { username });
  };

  ws.onmessage = (msg) => {
    var parsed;
    try {
      parsed = JSON.parse(msg.data);
    }
    catch(e) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(parsed, "type") && Object.prototype.hasOwnProperty.call(parsed, "data")) {
      if (parsed.type == "login") {
        if (parsed.data.status == "success") {
          console.log("Logged in!");
          id = parsed.data.id;
          deploy();
        }
        else {
          console.error("Error loggin in!");
        }
      }
      else if (parsed.type === "deploy") {
        if (parsed.data.status == "success") {
          console.log("Deployed!");
          loopInterval = setInterval(loop, 1000);
        }
        else {
          console.error("Could not deploy!");
          setTimeout(deploy, 1000);
        }
      }
      else if (parsed.type == "killPlayer") {
        // I died
        if (parsed.data.killed == id) {
          setTimeout(() => {
            deploy();
          }, 3100);
        }
      }
    }
  };

  ws.onclose = () => {
    clearInterval(loopInterval);
  };

  const loop = () => {
    const inputsToSend = [
      {
        localTime: new Date(),
        tick: 0,
        rotation: new Vector(0, 0, 0),
        inputs: {
          forward: 1,
          back: 0,
          left: 0,
          right: 0,
          jump: false,
          crouching: false,
          _fireDown: false,
          fire: false,
          ads: false,
          currentWeaponName: "AK12"
        }
      }
    ];
    sendMessage("inputs", inputsToSend);
  };

  const deploy = () => {
    sendMessage("deploy", { username });
  };

  function sendMessage(type, data = null) {
    if (wsIsOpen(ws)) {
      ws.send(JSON.stringify({
        type: type,
        data: data,
        clientSendTime: new Date().valueOf()
      }));
    }
  }

  function wsIsOpen(ws) {
    return ws && ws.readyState == ws.OPEN;
  }
}