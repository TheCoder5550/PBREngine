const WebSocket = require('ws');
const Vector = require("../public/vector.js");
const LoadCollider = require("./loadCollider.js");

var octree;

(async function setup() {
  octree = await LoadCollider.LoadCollider("./public/assets/models/coastMap.glb");

  loop();
})();

const wss = new WebSocket.Server({ port: 8080 });

var connectedClients = {};
var clientHistory = [];

wss.on('connection', ws => {
  console.log("New client! ", ws._socket.remoteAddress);

  ws.on('message', message => {
    //setTimeout(function() {
      var parsed;
      try {
        parsed = JSON.parse(message);
      }
      catch(e) {
        return;
      }

      if (parsed.hasOwnProperty("type") && parsed.hasOwnProperty("data")) {
        if (parsed.type == "login") {
          connectedClients[parsed.data.id] = ws;
          ws.id = parsed.data.id;
          ws.actionQueue = {
            id: -1,
            actionQueue: []
          };
          ws.lastActionId = -1;
          ws.gameData = {
            position: {x: 10, y: 3, z: 10},
            velocity: {x: 0, y: 0, z: 0},
            isGrounded: false,
            angle: 0,
            speed: 300
          };
          //ws.lastT = new Date();
          send("login", "success");
        }
        // else if (parsed.type == "updatePlayer") {
        //   ws.gameData.position = parsed.data.position;
        //   ws.gameData.angle = parsed.data.angle;
        // }
        else if (parsed.type == "actionQueue") {
          ws.actionQueue = parsed.data;
        }
        else if (parsed.type == "getAllPlayers") {
          var data = [];
          for (var key in connectedClients) {
            var client = connectedClients[key];
            if (client != ws) {
              data.push({id: client.id, data: client.gameData});
            }
            if (client == ws) {
              send("getSelf", {
                serverTime: new Date(),
                gameData: client.gameData,
                lastActionId: client.lastActionId
              }, parsed.clientSendTime);
            }
          }
          send("getAllPlayers", data, parsed.clientSendTime);
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
    //}, 200);
  });

  ws.on('close', function(reasonCode, description) {
    console.log("Client disconnected");
    delete connectedClients[ws.id];
  });

  function send(type, data = null, clientSendTime) {
    var cache = [];
    var json = JSON.stringify({
      type: type,
      data: data,
      timestamp: new Date(),
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

    ws.send(json);
  }
});

const hrtimeMs = function() {
  let time = process.hrtime()
  return time[0] * 1000 + time[1] / 1000000
}

var fixedDeltaTime = 1 / 60;
const loopFPS = 60;
let previous = hrtimeMs();
let tickLengthMs = 1000 / loopFPS;

function loop() {
  setTimeout(loop, tickLengthMs)
  let now = hrtimeMs()
  let delta = (now - previous) / 1000;
  previous = now;

  var smallClients = {};
  for (var key in connectedClients) {
    var client = connectedClients[key];
    //var speed = client.gameData.speed;

    client.gameData.velocity.y -= 18 * fixedDeltaTime;

    if (client.gameData.position.y < -30) {
      client.gameData.position = {x: 10, y: 3, z: 10};
      client.gameData.velocity = Vector.zero();
    }

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
        client.gameData.position.y += 0.2;
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

    client.gameData.position = Vector.add(client.gameData.position, Vector.multiply(client.gameData.velocity, fixedDeltaTime));

    solveCollision(client);

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

  clientHistory.push({
    timestamp: new Date(),
    clientPositions: smallClients
  });
  if (clientHistory.length > 500) clientHistory.shift();

}

function solveCollision(client) {
  var hit = Raycast(octree, Vector.add(client.gameData.position, {x: 0, y: 1, z: 0}), {x: 0, y: -1, z: 0}).firstHit;
  if (hit && hit.point && hit.distance < 1.1) {
    client.gameData.position.y = hit.point.y;
    client.gameData.velocity.y = 0;
    client.gameData.isGrounded = true;
  }

  var hw = 0.2;
  var directions = [{x: -1, y: 0, z: 0}, {x: 1, y: 0, z: 0}, {x: 0, y: 0, z: -1}, {x: 0, y: 0, z: 1}]
  for (var i = 0; i < 4; i++) {
    var hit = Raycast(octree, Vector.add(client.gameData.position, {x: 0, y: 1.1, z: 0}), directions[i]).firstHit;
    if (hit && hit.point && hit.distance < hw) {
      var p = Vector.add(client.gameData.position, Vector.add(Vector.multiply(directions[i], hw), {x: 0, y: 1.1, z: 0}));
      client.gameData.position = Vector.add(client.gameData.position, Vector.multiply(hit.normal, Math.abs(Vector.dot(hit.normal, Vector.subtract(hit.point, p)))));
      client.gameData.velocity = Vector.projectOnPlane(client.gameData.velocity, hit.normal);
    }
  }
}

function Raycast(octree, origin, direction) {
  var outArray = [];

  var q = octree.query(origin, direction);
  if (q) {
    var smallestDistance = Infinity;
    var normal;
    var point;

    for (var k = 0; k < q.length; k++) {
      var hitPoint = rayToTriangle(origin, direction, q[k][0], q[k][1], q[k][2]);
      if (hitPoint && hitPoint.distance < smallestDistance) {
        smallestDistance = hitPoint.distance;
        normal = getTriangleNormal(q[k]);
        point = hitPoint.point;
      }
    }

    if (point) {
      outArray.push({
        distance: smallestDistance,
        normal: normal,
        point: point
      });
    }
  }

  var smallestDistance = Infinity;
  var smallestElement;
  for (var i = 0; i < outArray.length; i++) {
    var d = outArray[i].distance;
    if (d < smallestDistance) {
      smallestDistance = d;
      smallestElement = outArray[i];
    }
  }

  return {
    firstHit: smallestElement,
    allHits: outArray
  };
}

function rayToTriangle(rayOrigin, rayVector, a, b, c) {
  var EPSILON = 0.0000001;
  var vertex0 = a;
  var vertex1 = b;
  var vertex2 = c;

  var h, s, q;
  var a,f,u,v;

  var edge1 = Vector.subtract(vertex1, vertex0);
  var edge2 = Vector.subtract(vertex2, vertex0);
  var h = Vector.cross(rayVector, edge2);
  var a = Vector.dot(edge1, h);

  if (a > -EPSILON && a < EPSILON)
    return false;

  var f = 1 / a;
  var s = Vector.subtract(rayOrigin, vertex0);
  var u = Vector.dot(s, h) * f;
  if (u < 0.0 || u > 1.0)
    return false;

  var q = Vector.cross(s, edge1);
  var v = f * Vector.dot(rayVector, q);
  if (v < 0.0 || u + v > 1.0)
    return false;

  var t = f * Vector.dot(edge2, q);
  if (t > EPSILON) {
    return {
      point: Vector.add(rayOrigin, Vector.multiply(rayVector, t)),
      distance: t
    };
  }
  else
    return false;
}

function getTriangleNormal(triangle) {
  return Vector.normalize(Vector.cross(Vector.subtract(triangle[1], triangle[0]), Vector.subtract(triangle[2], triangle[0])));
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

function sendGlobal(client, type, data = null) {
  var cache = [];
  var json = JSON.stringify({
    type: type,
    data: data,
    timestamp: new Date()
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

function inverseLerp(a, b, t) {
  return (t - a) / (b - a);
}

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}