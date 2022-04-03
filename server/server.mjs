import { createRequire } from 'module'
const require = createRequire(import.meta.url)

import Vector from '../public/engine/vector.mjs';
import LoadCollider, { CreateGameObjectFromGLTF } from "./loadCollider.mjs";
import { PhysicsEngine, AABB } from '../public/engine/physics.mjs';
import { lerp, inverseLerp } from '../public/engine/helper.mjs';
import { AABBTriangleToAABB, capsuleToTriangle } from '../public/engine/algebra.mjs';
import PlayerPhysicsBase from '../public/playerPhysicsBase.mjs';

console.log("Starting server...");

const WebSocket = require('ws');

var colliderPath = "../public/assets/models/gunTestRoom/collider.glb";

var octree;
var physicsEngine;

var SIMULATED_PING = 50;

(async function setup() {
  octree = await LoadCollider(colliderPath);
  physicsEngine = { octree }; // Fixing call structure (fancy words :))

  console.log("Setup done!");

  loop();
})();

const wss = new WebSocket.Server({ port: 8080 });

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
            send("deploy", {
              status: "success"
            });
            broadcast("deployOther", {
              clientID: ws.id
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
          if (ws.gameData.state == ws.gameData.STATES.PLAYING) {
            if (Array.isArray(parsed.data)) {
              ws.inputQueue = ws.inputQueue.concat(parsed.data);
            }
            else {
              ws.inputQueue.push(parsed.data);
            }
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
                  position: client.gameData.position,
                  rotation: client.gameData.rotation,
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

    if (client.gameData.state != client.gameData.STATES.PLAYING) {
      continue;
    }

    if (client.inputQueue.length > 0) {
      for (var snapshot of client.inputQueue) {
        client.gameData.rotation.y = snapshot.yRotation;
        // client.gameData.yRotation = snapshot.yRotation;

        client.gameData.applyInputs(snapshot.inputs, fixedDeltaTime);
        client.gameData.simulatePhysicsStep(fixedDeltaTime);

        // applyInputs(client, snapshot.inputs, fixedDeltaTime);
        // physicsStep(client, fixedDeltaTime);
      }

      sendGlobal(client, "getSelf", {
        gameData: {
          position: client.gameData.position,
          velocity: client.gameData.velocity,
          isGrounded: client.gameData.isGrounded
        },
        // gameData: {...client.gameData},
        // currentSimTime: client.currentSimTime,
        lastProcessedTick: client.inputQueue[client.inputQueue.length - 1].tick
      });

      client.gameData.localUpdatedTime = client.inputQueue[client.inputQueue.length - 1].localTime;//new Date().getTime();
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

function applyInputs(client, inputs, dt) {
  // Moving
  var vertical = (inputs.forward || 0) - (inputs.back || 0);
  var horizontal = (inputs.left || 0) - (inputs.right || 0);

  if (vertical || horizontal) {
    var direction = Vector.rotateAround({
      x: vertical,
      y: 0,
      z: -horizontal
    }, {x: 0, y: 1, z: 0}, -client.gameData.yRotation + Math.PI / 2);

    if (client.gameData.isGrounded) {
      direction = Vector.normalize(Vector.projectOnPlane(direction, client.gameData.realGroundNormal));
    }
    
    var walkSpeed = 5;
    client.gameData.position = Vector.add(client.gameData.position, Vector.multiply(direction, walkSpeed * dt));
  }

  // Jumping
  if (inputs.jump) {
    client.gameData.jumpCounter = client.gameData.jumpBuffering;
  }

  if (inputs.jump && client.gameData.jumpCounter > 0 && client.gameData.groundCounter > 0) {
    client.gameData.velocity.y = 6;
    client.gameData.position.y += 0.05;

    client.gameData.jumpCounter = 0;
    client.gameData.groundCounter = 0;
  }

  client.gameData.crouching = inputs.crouching;
}

function simulateClientToTime(client, time) {
  if (time <= client.currentSimTime) {
    // console.warn("End time is less than current time");
    return;
  }

  var millisDT = fixedDeltaTime * 1000;

  while (client.currentSimTime < time) {
    physicsStep(client, fixedDeltaTime);
    client.currentSimTime += millisDT;

    if (client.currentSimTime > time) {
      client.currentSimTime -= millisDT;
      break;
    }
  }

  var leftOverTime = time - client.currentSimTime;
  physicsStep(client, leftOverTime / 1000);

  client.currentSimTime = time.getTime();
}

function physicsStep(client, dt) {
  client.gameData.velocity.y -= 18 * dt;

  // Jumping
  if (client.gameData.isGrounded) {
    client.gameData.groundCounter = client.gameData.coyoteTime;
  }

  client.gameDatagroundCounter -= dt;
  client.gameDatajumpCounter -= dt;

  // Friction
  if (client.gameData.isGrounded) {
    var projectedVelocity = Vector.projectOnPlane(client.gameData.velocity, client.gameData.fakeGroundNormal);//{x: this.velocity.x, y: 0, z: this.velocity.z};
    var speed = Vector.length(projectedVelocity);
    client.gameData.velocity = Vector.add(client.gameData.velocity, Vector.multiply(Vector.normalize(projectedVelocity), -speed * dt * client.gameData.friction));

    // // Sliding / turning
    // if (this.crouching && speed > 10) {
    //   var v = Vector.rotateAround({
    //     x: Vector.length(Vector.projectOnPlane(this.velocity, this.fakeGroundNormal)),
    //     y: 0,
    //     z: 0
    //   }, this.fakeGroundNormal, -this.rotation.y + Math.PI / 2);
      
    //   this.velocity.x = v.x;
    //   this.velocity.z = v.z;
    // }
  }

  if (client.gameData.position.y < -30) {
    client.gameData.position = new Vector(10, 3, 10);
    client.gameData.velocity = Vector.zero();
  }

  client.gameData.position = Vector.add(client.gameData.position, Vector.multiply(client.gameData.velocity, dt));

  solveCollision(client);
}

function solveCollision(client) {
  client.gameData.isGrounded = false;

  var colliderRadius = 0.5;
  var standHeight = 2;
  var height = 2;
  var collisionIterations = 3;

  var radiusOffset = new Vector(0, colliderRadius, 0);
  var playerAABB = new AABB(
    {x: client.gameData.position.x - colliderRadius * 2, y: client.gameData.position.y - colliderRadius * 2,          z: client.gameData.position.z - colliderRadius * 2},
    {x: client.gameData.position.x + colliderRadius * 2, y: client.gameData.position.y + colliderRadius * 2 + height, z: client.gameData.position.z + colliderRadius * 2}
  );
  var q = octree.queryAABB(playerAABB);

  for (var iter = 0; iter < collisionIterations; iter++) {
    if (q) {
      for (var k = 0; k < q.length; k++) {
        if (!AABBTriangleToAABB(q[k][0], q[k][1], q[k][2], playerAABB)) { // bruh redundant?
          continue;
        }

        var col = capsuleToTriangle(Vector.add(client.gameData.position, new Vector(0, standHeight / 2 - height * 0.5 + colliderRadius, 0)), Vector.subtract(Vector.add(client.gameData.position, new Vector(0, standHeight / 2 + height / 2, 0)), radiusOffset), colliderRadius, q[k][0], q[k][1], q[k][2], true);
        // var col = capsuleToTriangle(Vector.add(this.position, radiusOffset), Vector.subtract(Vector.add(this.position, new Vector(0, this.height, 0)), radiusOffset), this.colliderRadius, q[k][0], q[k][1], q[k][2], true);
        
        if (col && !Vector.equal(col.normal, Vector.zero(), 0.001)) {
          var dp = Vector.dot(Vector.up(), col.normal);
          var normal = dp > 0.85 ? Vector.up() : col.normal;
          var depth = col.depth / Vector.dot(normal, col.normal);

          client.gameData.position = Vector.add(client.gameData.position, Vector.multiply(normal, depth));
          client.gameData.velocity = Vector.projectOnPlane(client.gameData.velocity, normal);

          var isGround = Vector.dot(normal, Vector.up()) > 0.7;
          if (isGround) {
            client.gameData.fakeGroundNormal = normal;
            client.gameData.realGroundNormal = col.normal;
            client.gameData.isGrounded = true;
          }
        }
      }
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