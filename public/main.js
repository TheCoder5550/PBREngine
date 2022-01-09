var gc = new GameCanvas({element: document.getElementById("mainCanvas")});

var ws = new WebSocket("ws://localhost:8080");
var sendDataInterval;

const urlParams = new URLSearchParams(window.location.search);
var id = parseInt(urlParams.get('id')) || Math.floor(Math.random() * 1e6);

var player = new Player(id);
var actionQueue = [];
var oldActionQueues = [];
var snapshotHistory = [];

var hit = false;
var bloodAmount = 0;

ws.onmessage = function(msg) {
  setTimeout(function() {
  var parsed;
  try {
    parsed = JSON.parse(msg.data);
  }
  catch(e) {
    return;
  }

  if (parsed.hasOwnProperty("type") && parsed.hasOwnProperty("data")) {
    //console.log(parsed);

    if (parsed.type == "ping") {
      console.log(parsed.data);
    }
    else if (parsed.type == "login") {
      if (parsed.data == "success") {
        console.log("Logged in!");
        sendDataInterval = setInterval(function() {
          if (ws.readyState == ws.OPEN) {
            sendMessage("actionQueue", {
              id: oldActionQueues.length,
              actionQueue
            });
            oldActionQueues.push(actionQueue);
            actionQueue = [];
            sendMessage("getAllPlayers");
          }
        }, 1000 / 15);
      }
    }
    else if (parsed.type == "getAllPlayers") {
      //if (!snapshotHistory[snapshotHistory.length - 1] || new Date(parsed.timestamp) > snapshotHistory[snapshotHistory.length - 1].serverTimestamp) {
        parsed.serverTimestamp = new Date(parsed.timestamp);
        parsed.timestamp = new Date();

        snapshotHistory.push(parsed);
        if (snapshotHistory.length > 50) {
          snapshotHistory.shift();
        }
      //}
    }
    else if (parsed.type == "getSelf") {
      var x = parsed.data.gameData.position.x;
      var y = parsed.data.gameData.position.y;

      var queues = oldActionQueues.concat([actionQueue]);

      var speed = player.speed;
      for (var i = parsed.data.lastActionId + 1; i < queues.length; i++) {
        var currentActionQueue = queues[i];
        if (currentActionQueue) {
          for (var j = 0; j < currentActionQueue.length; j++) {
            var action = currentActionQueue[j];

            x += action.direction.x * speed * action.dt;
            y += action.direction.y * speed * action.dt;

            if (x > 300) x = 300;
          }
        }
      }

      var error = Vector.distance({x, y}, {x: player.x, y: player.y});
      //console.log(error);

      player.x = x;
      player.y = y;
    }
    else if (parsed.type == "hit") {
      console.log("I got hit by " + parsed.data.by);
      bloodAmount = 1;
    }
  }
}, 200 /*Math.random() * 30 + 70*/);
}

ws.onopen = function() {
  sendMessage("login", {id: player.id});
}

ws.onclose = function() {
  console.log("Connection lost!");
  if (sendDataInterval) {
    clearInterval(sendDataInterval);
  }
}

var lastUpdate = Date.now();
var dt = 1/60;
loop();
function loop() {
  var now = Date.now();
  dt = (now - lastUpdate) / 1000;
  lastUpdate = now;

  clearScreen();
  rectangle(width / 2 - 100, height / 2 - 100, 200, 200, "orange");

  var origin = {x: player.x, y: player.y};
  var ray = {
    origin,
    direction: Vector.normalize(Vector.subtract({x: mouse.x - width / 2, y: mouse.y - height / 2}, origin))
  }
  hit = false;

  var currentTime = new Date() - 100;
  var snapshots = getSnapshotsAtTime(currentTime);

  if (snapshots) {
    for (var i = 0; i < snapshots[0].data.length; i++) {
      var id = snapshots[0].data[i].id;
      if (snapshots[1]) {
        var t = clamp(1 + inverseLerp(snapshots[0].timestamp, snapshots[1].timestamp, currentTime), 0, 1);
        if (snapshots[0].data[i].data.position) {
          var x;
          var y;

          if (snapshots[1].data[i].data.position) {
            x = lerp(snapshots[0].data[i].data.position.x, snapshots[1].data[i].data.position.x, t);
            y = lerp(snapshots[0].data[i].data.position.y, snapshots[1].data[i].data.position.y, t);
          }
          else {
            x = snapshots[0].data[i].data.position.x;
            y = snapshots[0].data[i].data.position.y;

            console.log("Ex");

            //x = lerp(snapshots[2].data[i].data.position.x, snapshots[0].data[i].data.position.x, t);
            //y = lerp(snapshots[2].data[i].data.position.y, snapshots[0].data[i].data.position.y, t);
          }

          /*var dist = getDist({x: player.x, y: player.y}, {x, y});
          if (dist != 0 && dist < 40) {
            var error = 40 - dist;
            var normal = norm(subtract(player, {x, y}));
  
            player.x += normal.x * error;
            player.y += normal.y * error;
          }*/

          var hitDist = rayToCircle({x, y}, 20, ray);
          if (hitDist > 0) {
            /*hit = {
              x: ray.origin.x + ray.direction.x * hitDist,
              y: ray.origin.y + ray.direction.y * hitDist
            };*/
            hit = {
              position: {x, y},
              id: snapshots[1].data[i].id,
              serverTimestamp: lerp(new Date(snapshots[0].serverTimestamp), new Date(snapshots[1].serverTimestamp), t)
            };
          }

          circle(width / 2 + x, height / 2 + y, 20, "blue");
          setTextAlignX("center");
          text(id, width / 2 + x, height / 2 + y - 20, 20, "black");

          /*x = snapshots[0].data[i].data.position.x;
          y = snapshots[0].data[i].data.position.y;

          circle(width / 2 + x, height / 2 + y, 20, "rgba(0, 255, 0, 0.3)");

          if (snapshots[1]) {
            x = snapshots[1].data[i].data.position.x;
            y = snapshots[1].data[i].data.position.y;

            circle(width / 2 + x, height / 2 + y, 20, "rgba(255, 0, 0, 0.3)");
          }*/
        }
      }
    }
  }

  line(player.x + width / 2, player.y + height / 2, player.x + width / 2 + ray.direction.x * 1e3, player.y + height / 2 + ray.direction.y * 1e3, hit ? "lime" : "red", 2);

  player.update(dt);
  player.render();

  var grd = gc.ctx.createRadialGradient(width / 2, height / 2, 200, width / 2, height / 2, 700);
  grd.addColorStop(0, "transparent");
  grd.addColorStop(1, "rgba(255, 0, 0, " + bloodAmount + ")");
  background(grd);
  bloodAmount -= dt / 3;
  if (bloodAmount < 0) bloodAmount = 0;

  requestAnimationFrame(loop);
}

function OnMouseDown() {
  if (hit) {
    sendMessage("hit", {
      hit: hit,
      timestamp: new Date()
    });
    console.log("hit");
    console.log(hit);
  }
}

function getSnapshotsAtTime(time) {
  var snapshotHistoryCopy = [...snapshotHistory];
  snapshotHistoryCopy.sort(function(a, b) {
    return b.timestamp - a.timestamp;
  });

  for (var i = 0; i < snapshotHistoryCopy.length; i++) {
    var snapshot = snapshotHistoryCopy[i];
    if (time > snapshot.timestamp) {
      return [snapshot, snapshotHistoryCopy[i + 1], snapshotHistoryCopy[i - 1]];
    }
  }
}

function inverseLerp(a, b, t) {
  return (t - a) / (b - a);
}

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

function sendMessage(type, data = null) {
  if (ws.readyState == ws.OPEN) {
    ws.send(JSON.stringify({
      type: type,
      data: data
    }));
  }
}

function Player(id) {
  this.id = id;
  this.x = 0;
  this.y = 0;
  this.rotation = 0;
  this.speed = 300;

  this.update = function(dt = 1) {
    this.rotation = Math.PI + getAngle(mouse.x - width / 2, mouse.y - height / 2, this.x, this.y);

    var vertical = key(87) - key(83);
    var horizontal = key(65) - key(68);

    if (vertical || horizontal) {
      var localDirection = Vector.normalize({
        x: horizontal,
        y: vertical
      });

      var worldDirection = Vector.rotate2D(localDirection, this.rotation - Math.PI / 2);

      actionQueue.push({direction: worldDirection, dt: dt});

      this.x += worldDirection.x * this.speed * dt;
      this.y += worldDirection.y * this.speed * dt;
    }

    if (this.x > 300) this.x = 300;
  }

  this.render = function() {
    circle(width / 2 + this.x, height / 2 + this.y, 20, "red");
  }
}

function rayToCircle(center, radius, r) {
  var oc = Vector.subtract(r.origin, center);
  var a = Vector.dot(r.direction, r.direction);
  var b = 2 * Vector.dot(oc, r.direction);
  var c = Vector.dot(oc, oc) - radius * radius;
  var discriminant = b * b - 4 * a * c;
  if (discriminant < 0){
    return false;
  }
  else {
    return (-b - Math.sqrt(discriminant)) / (2 * a);
  }
}