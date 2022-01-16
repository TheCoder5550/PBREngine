import Renderer, { Scene, GameObject, Transform, AudioListener3D, Camera } from "./engine/renderer.js";
import { 
  AABB,
  PhysicsEngine,
  Rigidbody
} from "./engine/physics.js";
import Vector from "./engine/vector.js";
import Quaternion from "./engine/quaternion.js";
import Matrix from "./engine/matrix.js";
import {
  clamp,
  lerp,
  inverseLerp,
  watchGlobal,
  fadeOutElement,
  hideElement,
  showElement
} from "./engine/helper.js";
import {
  AABBToAABB,
  closestPointToTriangle,
  closestPointOnPlane,
  closestPointOnTriangle,
  rayToTriangle,
  rayToPlane,
  AABBToTriangle,
  rayToAABB,
  getTriangleNormal,
  sphereToTriangle,
  capsuleToTriangle,
  ClosestPointOnLineSegment
} from "./engine/algebra.js";
import { WEAPONENUMS, updateBulletTrails, Weapon } from "./weapon.js";
import OrbitCamera from "./engine/orbitCamera.js";

/*

https://wickedengine.net/2020/04/26/capsule-collision-detection/

*/

/* HTML */

// var fc = new FakeConsole();

console.log("Page loaded");

var ammoCounter = document.querySelector(".gameUI .bottomRight .ammo");

var healthBarReal = document.querySelector(".gameUI .bottomLeft .healthContainer .currentHealth");
var healthBarAnimation = document.querySelector(".gameUI .bottomLeft .healthContainer .healthAnimation");

function setHealth(health) {
  var t = (1 - health) * 100 + "%";
  healthBarReal.style.right = t;
  healthBarAnimation.style.right = t;
}

var killAlert = document.querySelector(".gameUI .killAlert");
var killAlertSpecial = document.querySelector(".gameUI .killAlert .special");
var killAlertPlayer = document.querySelector(".gameUI .killAlert .player");

var killsSpans = [
  document.querySelector(".gameUI .killAlert .kills"),
  document.querySelector(".gameUI .topRight .kills")
]

watchGlobal("kills", function() {
  killsSpans[0].innerText = kills + " kills";
  killsSpans[1].innerText = kills + " kills";
});
kills = 0;

var loadingDiv = document.getElementsByClassName("loading")[0];
var loadingStatus = document.getElementById("loadingStatus");
var loadingInterval;

var gamepadManager = new GamepadManager();

/* Canvas classes */

var stats = new Stats();
document.body.appendChild(stats.dom);

var ui = new GameCanvas({publicMethods: false});
ui.canvas.classList.add("ingameUI");

var renderer = new Renderer();
renderer.onError = function() {
  clearInterval(loadingInterval);
  loadingStatus.innerText = "WebGL 2 not supported";
};
renderer.onContextLost = function() {
  running = false;
  loadingStatus.innerText = "WebGL context lost";
  showElement(loadingStatus);
  ws.close();
};

/* Debug */

if (false) {
  var counters = {};
  for (var i in gl) {
    if (typeof gl[i] == "function") {
      var functionMaker = function(i) {
        var oldFn = gl[i].bind(gl);

        return function() {
          if (!counters[i]) {
            counters[i] = {
              nrCalls: 0,
              lines: {}
            }
          }
          counters[i].nrCalls++;

          // var lineNumber = getLineNumber();
          
          // if (!counters[i].lines[lineNumber]) {
          //   counters[i].lines[lineNumber] = 0;
          // }
          // counters[i].lines[lineNumber]++;  

          return oldFn.apply(gl, arguments);
        }
      }

      gl[i] = functionMaker(i);
    }
  }

  window.printCounters = function() {
    // for (var key in counters) {
    //   var c = counters[key];
    //   var output = key + ": " + c.nrCalls + " - ";
    //   // for (var lineKey in c.lines) {
    //   //   output += lineKey + ": " + c.lines[lineKey] + " - ";
    //   // }
    //   console.log(output, c.lines);
    // }

    console.table(counters);
  }

  function getLineNumber() {
    function getErrorObject(){
      try { throw Error('') } catch(err) { return err; }
    }

    var err = getErrorObject();
    var split = err.stack.split("\n");
    var caller_line = split[split.length - 1];
    var index = caller_line.indexOf(".js:");
    var clean = caller_line.slice(index + 4, caller_line.indexOf(":", index + 5));

    return clean;
  }
}

/* ---------------------------------------- */

var running = false;
var disconnected = false;

const urlParams = new URLSearchParams(window.location.search);
var playerId = parseInt(urlParams.get('id')) || Math.floor(Math.random() * 1e6);

// Settings
var LERP_DELAY = 200;
var SERVER_SEND_FPS = 15;
var CORRECTION_SIM_STEPS = 5;
var SIMULATED_PING = () => Math.random() * 30 + 70;
//

var actionQueue = [];
var oldActionQueues = [];
var sendDataInterval;
var multiplayerCharacters = {};
var latencies = [];
var swat;

var ws = new WebSocket("ws://localhost:8080");

ws.onopen = function() {
  console.log("Connected to server");
  sendMessage("login", {id: playerId});
}

ws.onerror = function() {
  // setup();
  // displayWSError();
}

ws.onclose = function() {
  if (running) {
    displayWSError();
  }
}

ws.onmessage = websocketOnMessage;

loadingStatus.innerText = "Connecting";

var hasLoaded = false;

var audioListener = new AudioListener3D();

// var source = new AudioSource3D(audioListener, "./assets/sound/drumGun.wav");
// source.audioElement.loop = true;
// source.play();

var scene = new Scene("Main scene");

var orbitCamera;
var mainCamera = new Camera({position: new Vector(0, 0, -3), near: 0.1, far: 300, layer: 0, fov: 23});
var weaponCamera = new Camera({near: 0.005, far: 20, layer: 1, fov: 32});
var cameras = [mainCamera, weaponCamera];

var defaultFov = 40;//45;//37;
var targetFov = defaultFov;
var currentFov = defaultFov;

var litSkinned;

var crosshair = new Crosshair();
var hitmarker = new Hitmarker();
window.player = null;

var physicsEngine = new PhysicsEngine(scene);
var colliders = [];

var time = 0;
var dt;
var lastUpdate = performance.now();
var fpsHistory = [];

var car;
var bulletHoles;
var sparks;

setup();

async function setup() {
  console.log("Setup start");
  console.time("setup");

  loadingInterval = animateLoading(loadingStatus, "Loading");

  console.time("renderer.setup");
  await renderer.setup({version: 2});
  renderer.postprocessing.exposure = -1.5;
  renderer.add(scene);
  renderer.logGLError();
  console.timeEnd("renderer.setup");
  console.time("loadEnvironment")
  await scene.loadEnvironment({ hdrFolder: "./assets/hdri/wide_street_01_1k_precomputed" });
  console.timeEnd("loadEnvironment");
  renderer.logGLError();

  orbitCamera = new OrbitCamera(renderer, {position: new Vector(0, 0, -3), near: 0.1, far: 300, layer: 0, fov: 23});

  mainCamera.setAspect(renderer.aspect);
  weaponCamera.setAspect(renderer.aspect);

  physicsEngine.fixedUpdate = function(dt) {
    player.fixedUpdate(dt);
  }

  // Create programs / shaders
  // var litParallax = await renderer.createProgramFromFile("./assets/shaders/litParallax");
  var solidColorInstanceProgram = await renderer.createProgramFromFile("./assets/shaders/custom/webgl2/solidColor");
  // var unlitInstanced = await createProgram("./assets/shaders/unlit/vertexInstanced.glsl", "./assets/shaders/unlit/fragment.glsl");
  // var foliage = await createProgram("./assets/shaders/foliage");
  // var waterShader = await createProgram("./assets/shaders/water");

  var bulletHole = renderer.loadTexture("./assets/textures/bullethole.png");
  var bulletTrail = renderer.loadTexture("./assets/textures/bulletTrail.png");
  // var leaves = loadTexture("./assets/textures/leaves.png");
  // var waterNormal = loadTexture("./assets/textures/water-normal.png");

  // Materials
  // var foliageMat = new Material(foliage, [
  //   {type: "1i", name: "useTexture", arguments: [1]},
  //   {type: "1i", name: "albedoTexture", arguments: [0]},
  //   {type: "3f", name: "sunDirection", arguments: [sunDirection.x, sunDirection.y, sunDirection.z]},
  //   {type: "3f", name: "albedo", arguments: [1, 1, 1]}
  // ], [leaves]);

  // var waterMaterial = new Material(waterShader, [
  //   {type: "1i", name: "useNormalMap", arguments: [1]},
  //   {type: "1i", name: "normalTexture", arguments: [0]},
  //   {type: "2f", name: "uvScale", arguments: [20, 20]},
  //   {type: "3f", name: "sunDirection", arguments: [sunDirection.x, sunDirection.y, sunDirection.z]},
  // ], [waterNormal]);

  // var helmet = scene.add(await renderer.loadGLTF("./assets/models/DamagedHelmet.glb"))[0];

  // car = new Car();
  // await car.setup();

  // var rock = (await CreateGameObjectFromGLTF("./assets/models/rock.glb"))[0];
  // rock.position = new Vector(4, 0, 0);
  // rock.scale = new Vector(2, 2, 4);
  // scene.add(rock);

  // var s = await renderer.loadGLTF("./assets/models/ironPlane.glb");

  // var mat = s.children[0].meshRenderer.materials[0];
  // mat.textures.push(renderer.loadTexture("./assets/textures/rustyIron/heightmap.png"));
  // mat.createUniform("heightmapTexture", "1i", [mat.textures.length - 1]);
  // mat.setProgram(litParallax);

  // s.rotation = new Vector(0, Math.PI, 0);
  // s.position = new Vector(4, 1, 0);
  // scene.add(s);

  // var ball = (await CreateGameObjectFromGLTF("./assets/models/primitives/uvSphere.glb"))[0];
  // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "albedo").arguments = [1, 1, 1];
  // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "roughness").arguments[0] = 0.01;
  // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "metallic").arguments[0] = 0.99;
  // // ball.position = new Vector(0, 3, 0);
  // ball.addComponent(new Rigidbody());
  // ball.findComponents("Rigidbody")[0].position = new Vector(0, 5, 5.5);
  // scene.add(ball);

  // Vegetation
  // var bush = (await CreateGameObjectFromGLTF("./assets/models/bush.glb"))[0];
  // bush.position = {x: 20, y: 0.2, z: 14};
  // bush.scale = Vector.fill(0.7);
  // bush.children[0].meshRenderer.materials[0] = foliageMat;
  // scene.add(bush);

  // var tree = (await CreateGameObjectFromGLTF("./assets/models/tree.glb"))[0];
  // tree.position = {x: 22, y: 0.2, z: 14};
  // tree.scale = Vector.fill(0.7);
  // tree.children[0].children[0].meshRenderer.materials[0] = tree.children[0].children[1].meshRenderer.materials[0] = foliageMat;
  // scene.add(tree);

  // AABB visualizer
  scene.add(new GameObject("AABB", {
    meshRenderer: new renderer.MeshInstanceRenderer([new renderer.Material(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
    castShadows: false
  }));

  // Load map
  // var map = scene.add(await renderer.loadGLTF("./assets/models/city/model.glb"));
  // var mapCollider = await renderer.loadGLTF("./assets/models/city/collider.glb");
  var map = scene.add(await renderer.loadGLTF("./assets/models/warehouse/model.glb"));
  var mapCollider = await renderer.loadGLTF("./assets/models/warehouse/collider.glb");

  // map.getChild("Plane").meshRenderer.materials[0].setUniform("doNoTiling", 1);

  console.time("addMeshToOctree");
  physicsEngine.addMeshToOctree(mapCollider);
  console.timeEnd("addMeshToOctree");

  // physicsEngine.octree.render();

  // var w = map.getChild("Water");
  // if (w) w.meshRenderer.materials[0] = waterMaterial;

  bulletHoles = scene.add(new GameObject("HitObject", {
    meshRenderer: new renderer.MeshInstanceRenderer([renderer.CreateLitMaterial({albedoTexture: bulletHole}, renderer.litInstanced)], [new renderer.MeshData(await renderer.loadObj("./assets/models/plane.obj"))]),
    castShadows: false
  }));

  scene.add(new GameObject("BulletTrail", {
    meshRenderer: new renderer.MeshInstanceRenderer([renderer.CreateLitMaterial({albedoColor: [40, 5, 5, 1], albedoTexture: bulletTrail}, renderer.litInstanced)], [new renderer.MeshData(await renderer.loadObj("./assets/models/bulletTrail.obj"))]),
    castShadows: false
  }));

  var sparksObject = new GameObject("Particles");
  sparks = new renderer.ParticleSystem(new renderer.MeshData(await renderer.loadObj("./assets/models/bulletTrail.obj")));
  sparksObject.addComponent(sparks);
  scene.add(sparksObject);

  // await createPBRGrid(7, 7);

  // scene.add(await renderer.loadGLTF("./assets/models/test/normalmapTest.glb"));

  // var albedo = renderer.loadTexture("./assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_COL_1K_METALNESS.jpg", {internalFormat: renderer.gl.SRGB8_ALPHA8});
  // var normal = renderer.loadTexture("./assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_NRM_1K_METALNESS.jpg");
  // var metalRoughness = renderer.loadMetalRoughness("./assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_METALNESS_1K_METALNESS.jpg", "./assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_ROUGHNESS_1K_METALNESS.jpg");
  
  // var material = renderer.CreateLitMaterial({
  //   albedoTexture: albedo,
  //   normalMap: normal,
  //   metallicRoughnessTexture: metalRoughness
  // });
  // var meshData = new renderer.MeshData(renderer.getPlaneData());
  // var meshRenderer = new renderer.MeshRenderer(material, meshData);
  
  // var gameObject = new GameObject();
  // gameObject.rotation = new Vector(-Math.PI / 2, 0, 0);
  // gameObject.meshRenderer = meshRenderer;
  // scene.add(gameObject);
  // physicsEngine.addMeshToOctree(gameObject);

  // Reflection probe
  // var cubemap = renderer.captureReflectionCubemap(new Vector(0, 4, 0));
  // window.reflectionCubemap = cubemap;
  // var mat = new renderer.Material(await renderer.createProgramFromFile("./assets/shaders/cubemapVis"), [
  //   {type: "1i", name: "cubemap", arguments: [0]}
  // ], [{type: renderer.gl.TEXTURE_CUBE_MAP, texture: cubemap}]);

  // var cube = new GameObject("Cubemap", {
  //   meshRenderer: new renderer.MeshRenderer(mat, new renderer.MeshData(renderer.getCubeData())),
  //   castShadows: false
  // });
  // cube.scale = Vector.fill(3);
  // cube.position = new Vector(0, 4, 0);
  // scene.add(cube);
  

  // swat = scene.add(await renderer.loadGLTF("./assets/models/swatOptimizedRunning.glb"));
  // swat.rotation = new Vector(0, Math.PI / 2, 0);
  // swat.animationController.loop = true;
  // scene.add(swat.copy());

  // var dancingMonster = scene.add(await renderer.loadGLTF("./assets/models/dancingMonster.glb"));
  // dancingMonster.animationController.loop = true;
  // Matrix.transform([
  //   ["translate", {x: 0, y: 0, z: -10}]
  // ], dancingMonster.matrix);

  //colliders.push(new AABBCollider({x: -50, y: 0, z: -50}, {x: 50, y: 50, z: 50}, Matrix.identity(), true))

  // scene.add(await CreateGameObjectFromGLTF("./assets/models/test/transformHirTest.glb"))[0];

  /*
    Weapons models
  */
  var pistolGameObject = scene.add(await renderer.loadGLTF("./assets/models/pistolSuppressor.glb", {gameObjectOptions: {castShadows: false}}));
  pistolGameObject.setLayer(1, true);
  for (var animation of pistolGameObject.animationController.animations) {
    if (animation.name.indexOf("Reload") != -1) {
      animation.speed = 0.9;
    }
    else if (animation.name.indexOf("Fire") != -1) {
      animation.speed = 2;
    }
  }

  // var sks = scene.add(await CreateGameObjectFromGLTF("./assets/models/sks.glb", {gameObjectOptions: {castShadows: false}}))[0];
  // sks.visible = false;

  var shotgun = scene.add(await renderer.loadGLTF("./assets/models/shotgun.glb", {gameObjectOptions: {castShadows: false}}));
  shotgun.setLayer(1, true);
  shotgun.visible = false;
  shotgun.animationController.speed = 2.5;

  // var ar15 = scene.add(await CreateGameObjectFromGLTF("./assets/models/AR15.glb", {gameObjectOptions: {castShadows: false}}))[0];
  // ar15.setLayer(1, true);
  // ar15.visible = false;
  // ar15.scale = Vector.fill(0.1);

  // for (var animation of ar15.animationController.animations) {
  //   if (animation.name.indexOf("Fire") != -1) {
  //     animation.speed = 2;
  //   }
  // }

  var ak47 = scene.add(await renderer.loadGLTF("./assets/models/ak47Hands.glb", { loadMaterials: false,/*maxTextureSize: 128, */gameObjectOptions: {castShadows: false}}));
  ak47.children[0].transform.rotation = Quaternion.euler(0, Math.PI, 0);
  ak47.transform.scale = Vector.fill(2 / 20);
  ak47.setLayer(1, true);
  ak47.visible = false;
  // ak47.animationController.loop = true;
  ak47.animationController.speed = 2.5;

  /*
    Weapon settings
  */
  var weapons = {
    ak47: () => new Weapon({weaponObject: ak47, ADSFOV: 30, ADSMouseSensitivity: 0.8, weaponModelOffset: new Vector(-0.2, 0.22, 0.5), weaponModelADSOffset: Vector.zero(), reloadTime: 2700, magSize: 30, fireMode: WEAPONENUMS.FIREMODES.AUTO, roundsPerSecond: 10, recoil: function() {
      return {x: -1.2, y: (Math.random() - 0.5) * 1, z: 0};
    }}),
    // ar15: () => new Weapon({weaponObject: ar15, ADSFOV: 7, ADSMouseSensitivity: 0.2, weaponModelADSOffset: new Vector(0.0014, -0.062, -0.3), reloadTime: 1200, magSize: 30, fireMode: WEAPONENUMS.FIREMODES.AUTO, roundsPerSecond: 11.5, recoil: function() {
    //   return {x: -0.9, y: (Math.random() - 0.5) * 0.3, z: 0};
    // }}),
    pistol: () => new Weapon({weaponObject: pistolGameObject, reloadTime: 1200, weaponModelOffset: new Vector(-0.15, 0.1, 0.25)}),
    // sks: () => new Weapon({weaponObject: sks, sniperScope: true, ADSFOV: 10, ADSMouseSensitivity: 0.3, roundsPerSecond: 1, magSize: 5, fireMode: WEAPONENUMS.FIREMODES.SINGLE, fireSoundBufferSize: 40, recoil: function() {
    //   return {x: -3, y: (Math.random() - 0.5) * 0.1, z: 0};
    // }}),
    // overpowered: () => new Weapon({weaponObject: pistolGameObject, roundsPerSecond: 1000, magSize: 5000, fireMode: WEAPONENUMS.FIREMODES.AUTO, recoil: function() {
    //   return Vector.zero();
    // }}),
    shotgun: () => new Weapon({weaponObject: shotgun, reloadTime: 400, magSize: 6, roundsPerSecond: 2, bulletsPerShot: 10, ADSBulletSpread: 1, crosshairType: 1, sequentialReloading: true, recoil: function() {
      return {x: -5, y: (Math.random() - 0.5) * 0.2, z: 0};
    }, fireSound: "./assets/sound/shotgun/fire.wav", reloadSound: "./assets/sound/shotgun/insertShell.wav", doneReloadingSound: "./assets/sound/shotgun/reloadEnd.wav"}),
  };


  /*
    Player setup
  */
  player = new Player({x: 10, y: 3, z: 10});
  player.weapons = [
    // weapons.ar15(),
    // weapons.ak47(),
    weapons.pistol(),
    // weapons.sks(),
    // weapons.overpowered(),
    weapons.shotgun(),
    weapons.ak47()
  ];

  player.getCurrentWeapon().weaponObject.visible = true;

  scene.root.traverse(function(gameObject) {
    if (gameObject.meshRenderer && gameObject.meshRenderer.skin) {
      gameObject.meshRenderer.skin.updateMatrixTexture();
    }
  });

  SetupEvents();

  sendDataInterval = setInterval(function() {
    if (ws.readyState == ws.OPEN) {
      sendMessage("actionQueue", {
        id: oldActionQueues.length,
        actionQueue
      });
      oldActionQueues.push(actionQueue);
      actionQueue = [];

      // if (player) {
      //   sendMessage("updatePlayer", {
      //     position: player.position,
      //     angle: camera.ry
      //   });
      // }
      sendMessage("getAllPlayers");
    }
  }, 1000 / SERVER_SEND_FPS);

  hasLoaded = true;
  clearInterval(loadingInterval);

  if (!disconnected) {
    hideElement(loadingDiv);
    running = true;
    requestAnimationFrame(loop);
  }
  else {
    loadingStatus.innerText = "Connection lost";
  }

  renderer.disableCulling();

  window.renderer = renderer;
  window.scene = scene;
  window.physicsEngine = physicsEngine;
  window.mainCamera = mainCamera;
  window.bulletHoles = bulletHoles;
  window.sparks = sparks;
  window.targetFov = targetFov;
  window.defaultFov = defaultFov;

  console.timeEnd("setup");
}

// function loop() {
//   counters = {};
  
//   var now = performance.now();
//   dt = (now - lastUpdate) / 1000;
//   lastUpdate = now;
//   time += dt;

//   fpsHistory.push(1 / dt);
//   if (fpsHistory.length > 50) {
//     fpsHistory.shift();
//   }

//   for (var key in multiplayerCharacters) {
//     multiplayerCharacters[key].update(dt);
//   }

//   currentFov += (targetFov - currentFov) / 3;
//   // Matrix.setPerspectiveFov(perspectiveMatrix, canvas.width / canvas.height, currentFov * Math.PI / 180);
//   mainCamera.setFOV(currentFov);

//   // player.update(dt);
//   var rot = player.getHeadRotation();
//   // camera.rx = -rot.x;
//   // camera.ry = -rot.y;
//   // camera.rz = rot.z;
//   // camera.position = Vector.add(Vector.compMultiply(player.position, {x: 1, y: 1, z: -1}), {x: 0, y: 1.6, z: 0});

//   mainCamera.rotation = new Vector(-rot.x, -rot.y, rot.z);
//   mainCamera.position = Vector.add(Vector.compMultiply(player.position, {x: 1, y: 1, z: -1}), {x: 0, y: 1.6, z: 0});
//   mainCamera.updateMatrices();

//   weaponCamera.rotation = mainCamera.rotation;
//   weaponCamera.position = mainCamera.position;
//   weaponCamera.updateMatrices();

//   // cameraMatrix = Matrix.transform([
//   //   ["translate", {
//   //     x: camera.position.x,
//   //     y: camera.position.y,
//   //     z: -camera.position.z
//   //   }],
//   //   ["rz", camera.rz],
//   //   ["ry", camera.ry],
//   //   ["rx", camera.rx],
//   // ]);
//   // viewMatrix = Matrix.inverse(cameraMatrix);
//   // inverseViewMatrix = Matrix.inverse(viewMatrix);

//   crosshair.spacing = clamp(Vector.length(player.velocity) * 10, 25, 80);

//   physicsEngine.update();

//   player.updateWeapon(dt);

//   updateBulletTrails();

//   scene.root.update(dt);

//   // audioListener.setPosition(player.position);
//   // var playerMatrix = player.getHandMatrix();
//   // audioListener.setDirection(Matrix.getForward(playerMatrix), Matrix.getUp(playerMatrix));

//   // shadowCascades.renderShadowmaps(Vector.compMultiply(mainCamera.position, {x: 1, y: 1, z: -1}));

//   gl.bindFramebuffer(gl.FRAMEBUFFER, postprocessing.framebuffer);
//   gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
//   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

//   // gl.bindFramebuffer(gl.FRAMEBUFFER, bloom.originalRender.framebuffer);
//   // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
//   // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

//   // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
//   // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
//   // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

//   renderScene(mainCamera);
//   gl.clear(gl.DEPTH_BUFFER_BIT);
//   renderScene(weaponCamera);
//   // renderScene(perspectiveMatrix, viewMatrix);

//   // bloom.render();
//   postprocessing.draw();

//   renderUI(dt);

//   if (running) {
//     requestAnimationFrame(loop);
//   }
// }

function loop() {
  counters = {};

  // Lag
  if (renderer.getKey(81)) {
    var x = 0;
    for (var i = 0; i < 3e7; i++) {
      x += i * i;
    }
  }

  var now = performance.now();
  var frameTime = (now - lastUpdate) / 1000;
  lastUpdate = now;
  
  dt = physicsEngine.dt;
  time += dt;

  for (var key in multiplayerCharacters) {
    multiplayerCharacters[key].update(dt);
  }

  // player.update(dt);
  // player.fixedUpdate(dt);

  var x = gamepadManager.getAxis("RSHorizontal");
  var y = gamepadManager.getAxis("RSVertical");
  x = (Math.abs(x) > 0.08 ? x : 0);
  y = (Math.abs(y) > 0.08 ? y : 0);

  var currentWeapon = player.getCurrentWeapon();
  var weaponSens = currentWeapon ? currentWeapon.getCurrentSensitivity() : 1;
  player.rotation.x += Math.abs(y) * y * 0.07 * weaponSens;
  player.rotation.y += Math.abs(x) * x * 0.07 * weaponSens;

  // Fly camera
  // flyCamera(renderer, mainCamera, dt);
  // player.position = Vector.add(Vector.compMultiply(mainCamera.position, {x: 1, y: 1, z: -1}), {x: 0, y: -1.6, z: 0});

  // car.update(dt);

  physicsEngine.update();
  player.update(dt);
  scene.update(dt);

  crosshair.spacing = clamp(Vector.length(player.velocity) * 10, 25, 80);

  renderer.render(mainCamera, [weaponCamera]);
  renderUI(dt);

  updateBulletTrails();

  stats.update();
  requestAnimationFrame(loop);
}

function renderUI(dt) {
  ui.clearScreen();

  var currentWeapon = player.getCurrentWeapon();
  if (currentWeapon) {
    if (currentWeapon.mode != WEAPONENUMS.GUNMODES.ADS) {
      crosshair.render();
    }

    if (currentWeapon.mode == WEAPONENUMS.GUNMODES.ADS && currentWeapon.sniperScope) {
      ui.save();
      ui.background("black");
      ui.ctx.beginPath();
      ui.ctx.arc(ui.width / 2, ui.height / 2, ui.height * 0.45, 0, Math.PI * 2);
      ui.ctx.clip();
      ui.clearScreen();

      var middleRadius = ui.height / 7;
      ui.line(ui.width / 2, 0, ui.width / 2, ui.height, "black", 1);
      ui.line(ui.width / 2, 0, ui.width / 2, ui.height / 2 - middleRadius, "black", 6);
      ui.line(ui.width / 2, ui.height, ui.width / 2, ui.height / 2 + middleRadius, "black", 6);

      ui.line(0, ui.height / 2, ui.width, ui.height / 2, "black", 1);
      ui.line(0, ui.height / 2, ui.width / 2 - middleRadius, ui.height / 2, "black", 6);
      ui.line(ui.width, ui.height / 2, ui.width / 2 + middleRadius, ui.height / 2, "black", 6);
      ui.restore();
    }

    ammoCounter.innerText = `${currentWeapon.roundsInMag} / ${currentWeapon.magSize}`;

    // ui.text(`${currentWeapon.roundsInMag} / ${currentWeapon.magSize}`, 10, ui.height - 10, 60, "white", "black", 1);
  }

  hitmarker.render();

  // DrawGuage(Math.abs(car.engine.rpm), car.engine.minRPM, car.engine.maxRPM, ui.width / 2, ui.height - 125, 100);

  // // Stats
  // ui.setFont("monospace");

  // var averageFPS = Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length);
  // var minFPS = 100 - Math.round(Math.min(...fpsHistory) / averageFPS * 100);
  // var maxFPS = Math.round(Math.max(...fpsHistory) / averageFPS * 100) - 100;
  // ui.text(averageFPS + " FPS", 5, 20, 15, "lime");
  // ui.text("-" + minFPS + "%", 75, 20, 15, "lime");
  // ui.text("+" + maxFPS + "%", 115, 20, 15, "lime");

  // var averageLatency = Math.round(latencies.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) / latencies.length);
  // var color = (averageLatency < 100 ? "lime" : averageLatency < 150 ? "yellow" : "red");
  // ui.text(averageLatency + "ms", 5, 40, 15, color);

  // ui.setFont("Arial");
}

async function createPBRGrid(w = 10, h = 10) {
  var meshData = (await renderer.loadGLTF("./assets/models/primitives/uvSphere.glb")).children[0].meshRenderer.meshData[0];

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var material = renderer.CreateLitMaterial({
        roughness: x / (w - 1),
        metallic: y / (h - 1)
      });
      var meshRenderer = new renderer.MeshRenderer(material, meshData);
      
      var gameObject = new GameObject();
      gameObject.position = new Vector(x * 2.1, y * 2.1, 0);
      gameObject.meshRenderer = meshRenderer;
      scene.add(gameObject);
    }
  }
}

function Crosshair() {
  this.lineLength = 15;
  this.spacing = 20;
  this.thickness = 2;
  this.color = "white";
  this.backgroundColor = "black";
  this.type = 0;
  
  this.render = function() {
    if (this.type === 0) {
      this.drawCrosshair(this.backgroundColor, this.thickness);
      this.drawCrosshair(this.color, this.thickness - 1);
    }
    else if (this.type == 1) {
      this.shotgunCrosshair(this.backgroundColor, this.thickness);
      this.shotgunCrosshair(this.color, this.thickness - 0.5);
    }
  }

  this.drawCrosshair = function(color, thickness) {
    ui.line(ui.width / 2, ui.height / 2 - this.spacing - this.lineLength, ui.width / 2, ui.height / 2 - this.spacing, color, thickness);
    ui.line(ui.width / 2, ui.height / 2 + this.spacing + this.lineLength, ui.width / 2, ui.height / 2 + this.spacing, color, thickness);
    ui.line(ui.width / 2 - this.spacing - this.lineLength, ui.height / 2, ui.width / 2 - this.spacing, ui.height / 2, color, thickness);
    ui.line(ui.width / 2 + this.spacing + this.lineLength, ui.height / 2, ui.width / 2 + this.spacing, ui.height / 2, color, thickness);
    ui.rectangle(ui.width / 2 - thickness  * 2, ui.height / 2 - thickness * 2, thickness, thickness, color);
  }

  this.shotgunCrosshair = function(color, thickness) {
    for (var i = 0; i < 4; i++) {
      ui.ctx.beginPath();
      ui.ctx.arc(ui.width / 2, ui.height / 2, this.spacing, i * Math.PI / 2 - 0.6, i * Math.PI / 2 + 0.6);
      ui.ctx.strokeStyle = color;
      ui.ctx.lineWidth = thickness;
      ui.ctx.stroke();
    }
  }
}

function Hitmarker() {
  this.size = 10;
  this.spacing = 3;
  this.colors = {
    "body": [255, 255, 255],
    "head": [255, 50, 50]
  };
  this.color = this.colors.body;
  this.timeOffset = time;

  this.markHit = function(type) {
    this.color = this.colors[type];
    this.timeOffset = time;
  }

  this.render = function() {
    if (time - this.timeOffset < 0.5) {
      var alpha = 8 * (this.timeOffset - time + 0.5);
      this.drawHitmarker(`rgba(0, 0, 0, ${alpha})`, 3);
      this.drawHitmarker(`rgba(${this.color[0]}, ${this.color[1]}, ${this.color[2]}, ${alpha})`, 2);
    }
  }

  this.drawHitmarker = function(color, lineWidth) {
    for (var i = 0; i < 4; i++) {
      var xDir = Math.floor(i / 2) * 2 - 1;
      var yDir = Math.floor(((i + 1) % 4) / 2) * 2 - 1;
      ui.line(ui.width / 2 + xDir * this.spacing, ui.height / 2 + yDir * this.spacing, ui.width / 2 + xDir * (this.spacing + this.size), ui.height / 2 + yDir * (this.spacing + this.size), color, lineWidth);
    }
  }
}

function Player(pos = Vector.zero()) {
  this.rotation = Vector.zero();
  this.position = pos;
  this.startPosition = pos;
  this.velocity = Vector.zero();

  this.height = 1.6;

  this.walkSpeed = 5;

  this.walkAcceleration = 150 * 0.3;
  this.runningAcceleration = 225 * 0.3;
  this.currentAcceleration = this.walkAcceleration;
  this.friction = 10;

  this.grounded = false;
  var realGroundNormal;

  this.weapons = [];
  this.currentWeapon = 0;

  this.handRotation = this.rotation;

  this.handOffset = {x: 0.3, y: -0.25, z: -0.5};
  this.handRot = {x: 0, y: 0.1 * 0, z: 0};

  this.getHandMatrix = function(t = 0) {
    var rot = this.getHeadRotation();
    var ops = [
      ["translate", Vector.add(this.position, new Vector(0, this.height, 0))],
      ["rz", -rot.z],
      ["ry", -rot.y],
      ["rx", -rot.x],
      // ["translate", Vector.multiply(this.getCurrentWeapon().weaponObject.children[0].getChild("ADSOffset").position, -1 / 10)],
      // ["translate", {x: 0, y: 0, z: -0.1}]
      ["translate", Vector.multiply(this.handOffset, t)],
      ["rz", this.handRot.z * t],
      ["ry", this.handRot.y * t],
      ["rx", this.handRot.x * t],
      // ["translate", adsTranslate]
    ];

    // ops.push(["translate", Vector.multiply({x: 0.11, y: -0.1, z: -0.2}, t)]);

    // ops = ops.concat([
    //   ["rz", -(this.handRotation.z - rot.z) * t],
    //   ["ry", -(this.handRotation.y - rot.y) * t],
    //   ["rx", -(this.handRotation.x - rot.x) * t]
    // ]);

    var m = Matrix.transform(ops);

    var adsObject = this.getCurrentWeapon().weaponObject.getChild("ADSOffset", true);
    if (adsObject && t < 0.5) {
      // var weaponMatrix = this.getCurrentWeapon().weaponObject.getWorldMatrix();
      // var adsPos = Matrix.getPosition(adsObject.getWorldMatrix());
      // var localADSOffset = Matrix.transformVector(Matrix.inverse(weaponMatrix), adsPos);

      // m = Matrix.transform([["translate", new Vector(0, 0, -0.15)]], m);
      var localADSOffset = Matrix.inverse(adsObject.transform.getWorldMatrix(this.getCurrentWeapon().weaponObject));
      localADSOffset[12] *= 0.1;
      localADSOffset[13] *= 0.1;
      localADSOffset[14] *= 0.1;
      Matrix.setRotation(localADSOffset, Matrix.identity());
      m = Matrix.multiply(m, localADSOffset);

      // adsTranslate = Vector.add(Vector.multiply(localADSOffset, -0.1), new Vector(0, 0, -0.15));
      // adsTranslate = Vector.multiply(adsTranslate, 1 - t);
    }

    return m;
  }

  this.getCurrentWeapon = function() {
    return this.weapons[this.currentWeapon];
  }

  this.getHeadPos = function() {
    return Vector.add(this.position, {x: 0, y: this.height, z: 0});
  }

  this.getHeadRotation = function() {
    if (this.getCurrentWeapon())
      return Vector.add(this.rotation, this.getCurrentWeapon().recoilOffset);
    
    return this.rotation;
  }

  this.Fire = function() {
    if (this.getCurrentWeapon()) {
      this.weapons[this.currentWeapon].fire();
    }
  }

  this.switchWeapon = function(index) {
    if (index >= 0 && index < this.weapons.length) {
      if (index != this.currentWeapon) {
        var oldWeapon = this.weapons[this.currentWeapon];

        clearTimeout(oldWeapon.fireTimeout);
        oldWeapon.isFiring = false;
        oldWeapon.cancelReload();
        oldWeapon.mode = oldWeapon.GunModes.DEFAULT;
        targetFov = defaultFov;

        this.rotation = Vector.add(this.rotation, oldWeapon.recoilOffset);
        oldWeapon.recoilOffset = Vector.zero();
        oldWeapon.recoilOffsetTarget = Vector.zero();

        if (oldWeapon.weaponObject) {
          oldWeapon.weaponObject.visible = false;
        }
        
        var newWeapon = this.weapons[index];
        newWeapon.reloadAnimationTime = 1;
        newWeapon.fireAnimationTime = 1;
        if (newWeapon.weaponObject) {
          newWeapon.weaponObject.visible = true;
        }
        crosshair.type = newWeapon.crosshairType;
      }
    
      this.currentWeapon = index;
    }
  }

  this.update = function(dt) {
    if (this.getCurrentWeapon()) {
      this.getCurrentWeapon().update(dt);
    }

    mainCamera.setFOV(currentFov);

    mainCamera.transform.rotation = Quaternion.eulerVector(Vector.negate(this.getHeadRotation()));
    mainCamera.transform.position = Vector.add(this.position, {x: 0, y: 1.6, z: 0});
    // mainCamera.transform.position = Vector.add(Vector.compMultiply(this.position, {x: 1, y: 1, z: -1}), {x: 0, y: 1.6, z: 0});

    weaponCamera.transform.position = mainCamera.transform.position;
    weaponCamera.transform.rotation = mainCamera.transform.rotation;

    audioListener.setPosition(this.position);
    var playerMatrix = this.getHandMatrix();
    audioListener.setDirection(Matrix.getForward(playerMatrix), Matrix.getUp(playerMatrix));
  }

  this.fixedUpdate = function(dt) {
    this.handRotation = Vector.add(this.handRotation, Vector.multiply(Vector.subtract(this.getHeadRotation(), this.handRotation), 0.8));
    // this.handRotation = this.getHeadRotation();

    this.velocity.y -= 18 * dt;

    var vertical = (renderer.getKey(87) || 0) - (renderer.getKey(83) || 0);
    var horizontal = (renderer.getKey(65) || 0) - (renderer.getKey(68) || 0);

    if (vertical || horizontal) {
      var direction = Vector.rotateAround(Vector.normalize({
        x: vertical,
        y: 0,
        z: -horizontal
      }), {x: 0, y: 1, z: 0}, -this.rotation.y + Math.PI / 2);

      /*if (realGroundNormal) {
        direction = Vector.projectOnPlane(direction, realGroundNormal);
      }*/

      this.currentAcceleration = renderer.getKey(16) ? this.runningAcceleration : this.walkAcceleration;
      this.currentAcceleration *= (this.grounded ? 1 : 0.1);

      actionQueue.push({type: "movement", time: new Date(), direction: direction, speed: this.walkSpeed, dt: dt});

      // this.position = Vector.add(this.position, Vector.multiply(direction, this.walkSpeed * dt));
      this.velocity = Vector.add(this.velocity, Vector.multiply(direction, this.currentAcceleration * dt));
    }

    if (renderer.getKey(32) && this.grounded) {
      this.velocity.y = 6;
      this.position.y += 0.2;
      actionQueue.push({type: "jump", time: new Date()});
    }

    if (this.grounded) {
      var projectedVelocity = {x: this.velocity.x, y: 0, z: this.velocity.z};
      var speed = Vector.length(projectedVelocity);
      this.velocity = Vector.add(this.velocity, Vector.multiply(Vector.normalize(projectedVelocity), -speed * dt * this.friction));
    }

    this.position = Vector.add(this.position, Vector.multiply(this.velocity, dt));

    this.grounded = false;

    // AABB
    for (var j = 0; j < 3; j++) {
      for (var i = 0; i < colliders.length; i++) {
        var aabb = colliders[i];
  
        if (aabb.pointInside(this.position)) {
          var data = aabb.getNormal(this.position);

          if (Vector.dot(data.normal, {x: 0, y: 1, z: 0}) > 0.6) {
            realGroundNormal = {...data.normal};
            data.normal = {x: 0, y: 1, z: 0};
            this.grounded = true;
          }

          this.position = Vector.add(this.position, Vector.multiply(data.normal, data.distance / 2));
          this.velocity = Vector.projectOnPlane(this.velocity, data.normal);
        }
      }
    }

    // Ray - Mesh
    // var hit = Raycast(Vector.add(this.position, {x: 0, y: 1, z: 0}), {x: 0, y: -1, z: 0}).firstHit;
    // if (hit && hit.point && hit.distance < 1.1) {
    //   this.position.y = hit.point.y;
    //   this.velocity.y = 0;
    //   this.grounded = true;
    // }

    // var hit = Raycast(Vector.add(this.position, {x: 0, y: 1.5, z: 0}), {x: 0, y: -1, z: 0}).firstHit;
    // if (hit && hit.point && hit.distance < 0.3) {
    //   this.position.y = hit.point.y - 1.8;
    //   this.velocity.y = 0;
    // }

    // var hw = 0.2;
    // var directions = [{x: -1, y: 0, z: 0}, {x: 1, y: 0, z: 0}, {x: 0, y: 0, z: -1}, {x: 0, y: 0, z: 1}]
    // for (var i = 0; i < 4; i++) {
    //   var hit = Raycast(Vector.add(this.position, {x: 0, y: 1.1, z: 0}), directions[i]).firstHit;
    //   if (hit && hit.point && hit.distance < hw) {
    //     var p = Vector.add(this.position, Vector.add(Vector.multiply(directions[i], hw), {x: 0, y: 1.1, z: 0}));
    //     this.position = Vector.add(this.position, Vector.multiply(hit.normal, Math.abs(Vector.dot(hit.normal, Vector.subtract(hit.point, p)))));
    //     this.velocity = Vector.projectOnPlane(this.velocity, hit.normal);
    //   }
    // }

    // Capsule - mesh
    var radius = 0.5;
    var playerAABB = new AABB({x: this.position.x - radius, y: this.position.y, z: this.position.z - radius}, {x: this.position.x + radius, y: this.position.y + this.height, z: this.position.z + radius});
    var q = physicsEngine.octree.queryAABB(playerAABB);
    if (q) {
      for (var k = 0; k < q.length; k++) {
        // console.log(this.position, this.getHeadPos(), radius, q[k][0], q[k][1], q[k][2]);
        var triangleNormal = getTriangleNormal(q[k]);
        var col = capsuleToTriangle(this.position, this.getHeadPos(), radius, q[k][0], q[k][1], q[k][2], true);
        if (col) {
          var velocity_length = Vector.length(this.velocity);
          var velocity_normalized = Vector.normalize(this.velocity);
          var undesired_motion = Vector.multiply(col.normal, Vector.dot(velocity_normalized, col.normal));
          var desired_motion = Vector.subtract(velocity_normalized, undesired_motion);
          
          // this.velocity = Vector.multiply(desired_motion, velocity_length);

          // console.log(col.depth);
          this.position = Vector.add(this.position, Vector.multiply(col.normal, col.depth));
          this.velocity = Vector.projectOnPlane(this.velocity, col.normal/*triangleNormal*/);

          var isGround = Vector.dot(triangleNormal, Vector.up()) > 0.7;// && Vector.distance(this.position, col.point) < 0.5;
          if (isGround) {
            this.grounded = true;
            // this.velocity = Vector.zero();
          }
        }
      }
    }

    // Reset when out-of-bounds
    if (this.position.y < -30) {
      this.position = this.startPosition;
      this.velocity = Vector.zero();
    }

    if (this.getCurrentWeapon()) {
      this.getCurrentWeapon().fixedUpdate(dt);
    }

    currentFov += (targetFov - currentFov) / 3;
  }
}

function MultiplayerCharacter(gameObject) {
  this.id = -1;
  this.gameObject = gameObject;
  this.snapshotHistory = [];

  this.update = function(dt) {
    if (this.gameObject) {
      var data = this.getLerpedSnapshotData(new Date() - LERP_DELAY);
      if (data) {
        this.gameObject.animationController.speed = data.currentSpeed;

        var matrix = Matrix.transform([
          ["translate", data.position],
          ["ry", data.angle + Math.PI]
        ]);
        this.gameObject.matrix = matrix;
      }
    }
  }

  this.getLerpedSnapshotData = function(time) {
    var snapshotHistoryCopy = [...this.snapshotHistory];
    snapshotHistoryCopy.sort(function(a, b) {
      return b.timestamp - a.timestamp;
    });
  
    var neighbors;
    for (var i = 0; i < snapshotHistoryCopy.length; i++) {
      var snapshot = snapshotHistoryCopy[i];
      if (time > snapshot.timestamp) {
        neighbors = [snapshot, snapshotHistoryCopy[i + 1], snapshotHistoryCopy[i - 1]];
        break;
      }
    }

    if (neighbors && neighbors[1]) {
      var t = clamp(1 + inverseLerp(neighbors[0].timestamp, neighbors[1].timestamp, time), 0, 1);
      var lerpedData = {};

      for (var key in neighbors[0].data) {
        var func;
        if (typeof neighbors[0].data[key] == "boolean") {
          lerpedData[key] = neighbors[0].data[key];
          continue;
        }
        else if (typeof neighbors[0].data[key] == "number") {
          func = lerp;
        }
        else if ("x" in neighbors[0].data[key]) {
          func = Vector.lerp;
        }

        lerpedData[key] = func(neighbors[0].data[key], neighbors[1].data[key], t);
      }

      var sub = Vector.subtract(neighbors[0].data.position, neighbors[1].data.position);
      var forward = Vector.rotateAround({x: 0, y: 0, z: 1}, Vector.up(), lerpedData.angle + Math.PI);
      var speed = Vector.length({x: sub.x, y: 0, z: sub.z}) / ((neighbors[0].timestamp - neighbors[1].timestamp) / 1000) / 4;
      lerpedData.currentSpeed = speed * Math.sign(Vector.dot(forward, sub));

      return lerpedData;
    }
    // else if (neighbors[0]) {
    //   return neighbors[0].data;
    // }
  }
}

function Car() {
  var _this = this;

  var radPerSecToRPM = 30 / Math.PI;

  this.engine = new Engine();
  this.wheels = [];

  this.currentGear = 1;
  this.gearRatios = [2.66, 1.78, 1.3, 1, 0.74];
  this.reverseGearRatio = 2.9;
  this.allGearRatios = [this.reverseGearRatio, ...this.gearRatios];

  this.differentialRatio = 3.42;

  var activateAutoCountersteer = true;
  var autoCountersteerMinVel = 2;
  var autoCountersteer = 0.7;
  var autoCountersteerVelocityMultiplier = 0.3;
  
  this.setup = async function() {
    this.gameObject = scene.add(await renderer.loadGLTF("./assets/models/mustang.glb"));
    this.rb = new Rigidbody();
    this.rb.position = new Vector(4, 4, 0);
    this.rb.mass = 1500;
    this.rb.inertia = Vector.fill(1500);
    this.gameObject.addComponent(this.rb);

    this.wheels[0] = new Wheel(new Vector(1.1, -0.25, 1.7), scene.add(await renderer.loadGLTF("./assets/models/wheel.glb")));
    this.wheels[1] = new Wheel(new Vector(-1.1, -0.25, 1.7), scene.add(await renderer.loadGLTF("./assets/models/wheel.glb")));
    this.wheels[2] = new Wheel(new Vector(1.1, -0.25, -1.85), scene.add(await renderer.loadGLTF("./assets/models/wheel.glb")));
    this.wheels[3] = new Wheel(new Vector(-1.1, -0.25, -1.85), scene.add(await renderer.loadGLTF("./assets/models/wheel.glb")));
  
    this.wheels[0].turn = false;
    this.wheels[1].turn = false;
    this.wheels[2].drive = false;
    this.wheels[3].drive = false;
    this.wheels[2].ebrake = false;
    this.wheels[3].ebrake = false;

    this.wheels[0].modelAngleOffset = Math.PI;
    this.wheels[2].modelAngleOffset = Math.PI;
  }

  this.reset = function() {
    this.rb.position = new Vector(0, 4, 0);
    this.rb.velocity = Vector.zero();
    this.rb.angles = Vector.zero();
    this.rb.angularVelocity = Vector.zero();
  }

  this.update = function(dt) {
    var worldMatrix = this.gameObject.getWorldMatrix();
    var inverseWorldMatrix = Matrix.inverse(worldMatrix);
    var localVelocity = Matrix.transformVector(inverseWorldMatrix, this.rb.velocity);
    var localAngularVelocity = Matrix.transformVector(inverseWorldMatrix, this.rb.angularVelocity);

    var forward = Matrix.getForward(worldMatrix);
    var sideways = Matrix.getRight(worldMatrix);

    var forwardVelocity = Vector.dot(this.rb.velocity, forward);
    var sidewaysVelocity = Vector.dot(this.rb.velocity, sideways);

    var slipAngle = -Math.atan2(sidewaysVelocity, forwardVelocity);
    if (isNaN(slipAngle) || !isFinite(slipAngle)) slipAngle = 0;

    if (gamepadManager.getButtonDown("X")) {
      this.currentGear--;
    }
    if (gamepadManager.getButtonDown("Y")) {
      this.currentGear++;
    }
    this.currentGear = clamp(this.currentGear, 0, this.allGearRatios.length - 1);

    var driveInput = Math.abs(this.engine.rpm) < 8000 ? gamepadManager.getButton("RT") : 0;
    var brakeInput = gamepadManager.getButton("LT");
    var ebrakeInput = gamepadManager.getButton("A");

    var maxSteerAngle = 45;
    var steerInput = -gamepadManager.getAxis("LSHorizontal");
    var acs = activateAutoCountersteer /*&& Vector.length(Vector.projectOnPlane(localVelocity, Vector.up)) >= autoCountersteerMinVel*/ && forwardVelocity > 0.1 ? (-slipAngle) / (maxSteerAngle / 180 * Math.PI) * autoCountersteer : 0;

    steerInput = clamp(steerInput - acs, -1, 1);

    var driveTorque = driveInput * (this.currentGear == 0 ? 1 : -1) * this.engine.torqueLookup(this.engine.rpm) * this.engine.torque / 2 * this.allGearRatios[this.currentGear] * this.differentialRatio;

    for (var wheel of this.wheels) {
      var steerAngle = wheel.turn ? steerInput * maxSteerAngle * Math.PI / 180 : 0;

      var worldMatrix = this.gameObject.getWorldMatrix();
      var up = Matrix.getUp(worldMatrix);
      var forward = Matrix.getForward(worldMatrix);
      var sideways = Matrix.getRight(worldMatrix);

      var worldPos = Matrix.transformVector(worldMatrix, wheel.position);
      var wheelVelocity = this.rb.GetPointVelocity(worldPos);

      var ray = {origin: worldPos, direction: Vector.negate(up)};
      var hit = physicsEngine.Raycast(ray.origin, ray.direction).firstHit;
      var wheelIsGrounded = hit && hit.distance < wheel.suspensionTravel + wheel.radius;

      wheel.model.matrix = Matrix.transform([
        ["translate", Vector.add(ray.origin, Vector.multiply(ray.direction, wheelIsGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel))],
        ["rx", this.gameObject.rotation.x],
        ["rz", this.gameObject.rotation.z],
        ["ry", this.gameObject.rotation.y],
        ["ry", steerAngle + wheel.modelAngleOffset],
        ["rx", wheel.angle * (wheel.modelAngleOffset == Math.PI ? -1 : 1)]
      ]);

      if (wheelIsGrounded) {
        var rayDist = hit.distance;
        var contactPoint = hit.point;

        var normalForce = 0;
        var compressionAmount = 0;

        // Suspension
        var springError = wheel.suspensionTravel - (rayDist - wheel.radius);
        var currentSpringForce = Vector.multiply(ray.direction, springError * -wheel.suspensionForce);
        var currentDampingForce = Vector.multiply(Vector.project(Vector.subtract(wheelVelocity, Vector.projectOnPlane(this.rb.velocity, hit.normal)), up), -wheel.suspensionDamping);
        var totalForce = Vector.add(currentSpringForce, currentDampingForce);
        this.rb.AddForceAtPosition(totalForce, worldPos);

        wheel.normalForce = normalForce = Vector.length(totalForce);
        compressionAmount = clamp(springError / wheel.suspensionTravel, 0, 1);

        // Bottom out
        var furthestPoint = Vector.add(ray.origin, Vector.multiply(ray.direction, wheel.radius + wheel.stopLength));
        var C = -Vector.dot(Vector.subtract(contactPoint, furthestPoint), hit.normal);

        if (C < 0) {
          var r = Vector.cross(Vector.subtract(furthestPoint, this.rb.position), hit.normal);

          var jacobian = [
            hit.normal.x,
            hit.normal.y,
            hit.normal.z,
            r.x,
            r.y,
            r.z
          ];

          var JM = [
            jacobian[0] / this.rb.mass,
            jacobian[1] / this.rb.mass,
            jacobian[2] / this.rb.mass,
            jacobian[3] / this.rb.inertia.x,
            jacobian[4] / this.rb.inertia.y,
            jacobian[5] / this.rb.inertia.z
          ];

          var beta = 0.15;
          var bias = beta / dt * (C + 0.01);
          var JMJ = multiply1DMatrices(JM, jacobian);

          var lambdaAccumulated = 0;

          for (var i = 0; i < 5; i++) {
            var velocityMatrix = [
              this.rb.velocity.x,
              this.rb.velocity.y,
              this.rb.velocity.z,
              this.rb.angularVelocity.x,
              this.rb.angularVelocity.y,
              this.rb.angularVelocity.z
            ];

            var JV = multiply1DMatrices(jacobian, velocityMatrix);
            var lambda = -(JV + bias) / JMJ;

            if (lambdaAccumulated + lambda < 0) {
              lambda = -lambdaAccumulated;
            }
            lambdaAccumulated += lambda;

            this.rb.velocity = Vector.add(this.rb.velocity, Vector.multiply(new Vector(jacobian[0], jacobian[1], jacobian[2]), lambda / this.rb.mass));
            this.rb.angularVelocity = Vector.add(this.rb.angularVelocity, divideVectorAndVector(Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda), this.rb.inertia));
          }
        }

        // Friction

        var torqueInput = wheel.drive ? driveTorque : 0;

        var iters = 5;
        var _dt = dt / iters;
        for (var count = 0; count < iters; count++) {
          wheelVelocity = this.rb.GetPointVelocity(worldPos);

          var forwardVelocity = Vector.dot(wheelVelocity, forward);
          var sidewaysVelocity = Vector.dot(wheelVelocity, sideways);

          var roadFriction = 1;

          wheel.angularVelocity += torqueInput / wheel.inertia * _dt;

          var slipAngle = -Math.atan(sidewaysVelocity / Math.abs(forwardVelocity)) - steerAngle * Math.sign(forwardVelocity);
          if (isNaN(slipAngle) || !isFinite(slipAngle)) slipAngle = 0;
          var a = slipAngle / wheel.slipAnglePeak;

          if (brakeInput != 0) {
            wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - brakeInput);
          }

          if (ebrakeInput != 0 && wheel.ebrake) {
            wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - ebrakeInput);
          }

          var driveForwardVector = forward;//Quaternion.AngleAxis(-90, sideways) * groundHit.normal;

          var slipRatio = -(wheel.angularVelocity * wheel.radius + forwardVelocity) / Math.abs(forwardVelocity) * Math.min(Math.abs(forwardVelocity) / 3, 1);
          if (isNaN(slipRatio)) slipRatio = 0;
          if (!isFinite(slipRatio)) slipRatio = Math.sign(slipRatio);
          var s = slipRatio / wheel.slipRatioPeak;

          var rho = Math.sqrt(s * s + a * a);

          var Fx = (_slipRatio) => {
            return magicFormula(_slipRatio, wheel.slipRatioCoeffs) * roadFriction * wheel.friction;
          }
          var Fy = ( _slipAngle) => {
            return magicFormula(_slipAngle * 180 / Math.PI - wheel.camberAngle * wheel.camberAngleCoeff, wheel.slipAngleCoeffs) * roadFriction * wheel.friction;
          }

          var finalForceX = s / rho * Fx(rho * wheel.slipRatioPeak) * normalForce;
          var finalForceY = a / rho * Fy(rho * wheel.slipAnglePeak) * normalForce;

          // if (!count) console.log(slipRatio);

          if (!isNaN(finalForceX)) {
            var contactVelocity = (wheel.angularVelocity * wheel.radius + forwardVelocity);
            var maxForceToResolveFriction = Math.abs(contactVelocity / (wheel.radius * wheel.radius) * wheel.inertia / _dt);
            var maxFriction = Math.abs(finalForceX);
            var frictionForce = Math.min(maxFriction, maxForceToResolveFriction) * -Math.sign(finalForceX);
            wheel.angularVelocity -= (frictionForce * wheel.radius) / wheel.inertia * _dt;
          }
          
          if (!isNaN(finalForceX)) this.rb.AddImpulseAtPosition(Vector.multiply(driveForwardVector, finalForceX * _dt), contactPoint);
          if (!isNaN(finalForceY)) this.rb.AddImpulseAtPosition(Vector.multiply(sideways, finalForceY * _dt), contactPoint);
        }
      }

      wheel.angle += wheel.angularVelocity * dt;
    }

    updateEngineRPM();
  }

  function updateEngineRPM() {
    var angularVelocities = 0;
    for (var wheel of _this.wheels) {
      if (wheel.drive) {
        angularVelocities += Math.abs(wheel.angularVelocity);
      }
    }

    var driveWheels = 2;
    _this.engine.rpm = angularVelocities / driveWheels * _this.allGearRatios[_this.currentGear] * _this.differentialRatio * radPerSecToRPM;
    // _this.engine.rpm = clamp(_this.engine.rpm, _this.engine.minRPM, _this.engine.maxRPM);
  }

  function Engine() {
    this.torque = 700;
    this.rpm = 0;
    this.minRPM = 0;
    this.maxRPM = 8000;

    this.torqueLookup = function(rpm) {
      return (-Math.pow(Math.abs((rpm - 4600) / 145), 1.4) + 309) / 309;
    }
  }

  function Wheel(position = Vector.zero(), model) {
    this.position = position;
    this.model = model;
    this.modelAngleOffset = 0;

    this.friction = 1;
    this.radius = 0.47;
    this.camberAngle = 0;
    this.camberAngleCoeff = 1;

    this.stopLength = 0.05;
    this.suspensionTravel = 0.35;
    this.suspensionDamping = 3500;
    this.suspensionForce = 50000;

    this.angle = 0;
    this.angularVelocity = 0;
    this.mass = 20;
    this.inertia = this.mass * this.radius * this.radius / 2;

    this.slipRatioCoeffs = [16, 1.5, 1.1, -1.4];
    this.slipAngleCoeffs = [0.1, 1.5, 1.1, -1.4];

    this.slipRatioPeak = findPeak(x => {
      return magicFormula(x, this.slipRatioCoeffs);
    });

    this.slipAnglePeak = findPeak(x => {
      return magicFormula(x * 180 / Math.PI - this.camberAngle * this.camberAngleCoeff, this.slipAngleCoeffs);
    });

    this.drive = true;
    this.turn = true;
    this.ebrake = true;

    this.wheelIsGrounded = false;
    this.normalForce = 0;
  }

  function divideVectorAndVector(a, b) {
    return new Vector(a.x / b.x, a.y / b.y, a.z / b.z);
  }

  function multiply1DMatrices(m1, m2) {
    if (m1.length != m2.length) {
      throw new Error("Matrices have to be the same length!");
    }

    var sum = 0;
    for (var i = 0; i < m1.length; i++) {
      sum += m1[i] * m2[i];
    }

    return sum;
  }

  function magicFormula(x, coeffs) {
    var b = coeffs[0];
    var c = coeffs[1];
    var d = coeffs[2];
    var e = coeffs[3];
    return d * Math.sin(c * Math.atan(b * x - e * (b * x - Math.atan(b * x))));
  }

  function findPeak(f, maxX = 10, stepsize = 0.001) {
    for (var x = 0; x < maxX; x += stepsize) {
      var fx = f(x);
      if (fx > f(x - stepsize) && fx > f(x + stepsize)) {
        return x;
      }
    }

    throw new Error("No peak found!");
  }
}

function animateLoading(element, text) {
  var dots = 0;
  return setInterval(() => {
    dots++;
    dots = dots % 4;
    element.innerText = text + ".".repeat(dots);
  }, 500);
}

function showKillAlert(player, special = "") {
  killAlertPlayer.innerText = "You killed " + player;
  killAlertSpecial.innerText = special;
  showElement(killAlert);

  setTimeout(function() {
    fadeOutElement(killAlert);
  }, 3000);
}

// WebSocket
function sendMessage(type, data = null) {
  if (ws.readyState == ws.OPEN) {
    ws.send(JSON.stringify({
      type: type,
      data: data,
      clientSendTime: new Date()
    }));
  }
}

function websocketOnMessage(msg) {
  setTimeout(function() {
    var parsed;
    try {
      parsed = JSON.parse(msg.data);
    }
    catch(e) {
      return;
    }

    latencies.push(new Date() - new Date(parsed.clientSendTime));
    if (latencies.length > 50) {
      latencies.shift();
    }

    if (parsed.hasOwnProperty("type") && parsed.hasOwnProperty("data")) {
      //console.log(parsed);

      if (parsed.type == "ping") {
        console.log(parsed.data);
      }
      else if (parsed.type == "login") {
        if (parsed.data == "success") {
          console.log("Logged in!");
          setup();
        }
        else {
          console.log("Error loggin in!");
        }
      }
      else if (parsed.type == "getAllPlayers") {
        //if (!snapshotHistory[snapshotHistory.length - 1] || new Date(parsed.timestamp) > snapshotHistory[snapshotHistory.length - 1].serverTimestamp) {
          parsed.serverTimestamp = new Date(parsed.timestamp);
          parsed.timestamp = new Date();

          for (var entity of parsed.data) {
            var found = multiplayerCharacters[entity.id];
            if (!found) {
              var gameObject = scene.add(swat.copy());
              found = new MultiplayerCharacter(gameObject);
              found.id = entity.id;
              multiplayerCharacters[entity.id] = found;
            }

            found.snapshotHistory.push({
              //serverTimestamp: parsed.serverTimestamp,
              timestamp: parsed.serverTimestamp,
              data: entity.data
            });

            if (found.snapshotHistory.length > 50) {
              found.snapshotHistory.shift();
            }
          }
        //}
      }
      else if (parsed.type == "getSelf") {
        return;

        var pos = parsed.data.gameData.position;
        var vel = parsed.data.gameData.velocity;
        var grounded = parsed.data.gameData.isGrounded;

        function solveCollision(skipEdge = false) {
          var hit = Raycast(Vector.add(pos, {x: 0, y: 1, z: 0}), {x: 0, y: -1, z: 0}).firstHit;
          if (hit && hit.point && hit.distance < 1.1) {
            pos.y = hit.point.y;
            vel.y = 0;
            grounded = true;
          }

          if (!skipEdge) {
            var hw = 0.2;
            var directions = [{x: -1, y: 0, z: 0}, {x: 1, y: 0, z: 0}, {x: 0, y: 0, z: -1}, {x: 0, y: 0, z: 1}]
            for (var i = 0; i < 4; i++) {
              var hit = Raycast(Vector.add(pos, {x: 0, y: 1.1, z: 0}), directions[i]).firstHit;
              if (hit && hit.point && hit.distance < hw) {
                var p = Vector.add(pos, Vector.add(Vector.multiply(directions[i], hw), {x: 0, y: 1.1, z: 0}));
                pos = Vector.add(pos, Vector.multiply(hit.normal, Math.abs(Vector.dot(hit.normal, Vector.subtract(hit.point, p)))));
                vel = Vector.projectOnPlane(vel, hit.normal);
              }
            }
          }
        }

        function runSimulation(dt) {
          for (var k = 0; k < CORRECTION_SIM_STEPS; k++) {
            vel.y -= 18 * dt;
            pos = Vector.add(pos, Vector.multiply(vel, dt));

            solveCollision(true);
          }
        }

        var queues = oldActionQueues.concat([actionQueue]);

        var lastTime;
        for (var i = parsed.data.lastActionId + 1; i < queues.length; i++) {
          var currentActionQueue = queues[i];
          if (currentActionQueue) {
            for (var j = 0; j < currentActionQueue.length; j++) {
              var action = currentActionQueue[j];

              var dt = (new Date(action.time) - (lastTime ? lastTime : new Date(parsed.data.serverTime))) / 1000 / CORRECTION_SIM_STEPS;
              lastTime = new Date(action.time);
              runSimulation(dt);

              if (action.type == "movement") {
                pos = Vector.add(pos, Vector.multiply(Vector.normalize(action.direction), action.speed * action.dt));
              }
              else if (action.type == "jump" && grounded) {
                vel.y = 6;
                pos.y += 0.2;
                grounded = false;
              }

              // collision detection + resolve
              solveCollision();
            }
          }
        }

        var dt = (new Date() - (lastTime ? lastTime : new Date(parsed.data.serverTime))) / 1000 / CORRECTION_SIM_STEPS;
        runSimulation(dt);

        player.position = pos;
        player.velocity = vel;
      }
      else if (parsed.type == "hit") {
        console.log("I got hit by " + parsed.data.by);
      }
    }
   }, SIMULATED_PING());
}

function displayWSError() {
  console.log("Connection lost!");
  loadingStatus.innerText = "Connection lost";
  if (sendDataInterval) {
    clearInterval(sendDataInterval);
  }

  disconnected = true;
  running = false;
  showElement(loadingStatus);
  // loadingDiv.style.removeProperty("display");
}
//

function SetupEvents() {
  // window.onresize = function() {
  //   canvas.width = innerWidth;
  //   canvas.height = innerHeight;

  //   gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  //   gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  //   gl.bindFramebuffer(gl.FRAMEBUFFER, postprocessing.framebuffer);
  //   gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  // }

  renderer.on("mousedown", function(e) {
    if (running) {
      renderer.lockPointer();

      switch (e.button) {
        case 0:
          if (player) {
            player.Fire();
          }
          break;
        case 2:
          if (player && player.getCurrentWeapon()) {
            player.getCurrentWeapon().ADS();
          }
          break;
      }

      // Breaks in iframe
      //e.preventDefault();
    }
  });

  renderer.gl.canvas.addEventListener('contextmenu', event => event.preventDefault());

  renderer.on("mouseup", function(e) {
    if (running) {
      switch (e.button) {
        case 2:
          if (player && player.getCurrentWeapon()) {
            player.getCurrentWeapon().unADS();
          }
          break;
      }
    }
  });

  renderer.on("mousemove", function(e) {
    if (running && player && renderer.isPointerLocked()) {
      var currentWeapon = player.getCurrentWeapon();
      var weaponSens = currentWeapon ? currentWeapon.getCurrentSensitivity() : 1;
      player.rotation.x += e.movementY * 0.002 * weaponSens;
      player.rotation.y += e.movementX * 0.002 * weaponSens;
    }
  });

  renderer.on("keydown", function(e) {
    if (running) {
      if (player) {
        if (player.getCurrentWeapon() && e.keyCode == 82) {
          player.getCurrentWeapon().reload();
        }

        if (e.keyCode >= 49 && e.keyCode <= 57) {
          player.switchWeapon(e.keyCode - 49);
        }
      }
    }
  });

  var canScroll = true;

  document.onwheel = function(e) {
    if (running) {
      if (player && canScroll) {
        function wrapAround(t, m) {
          return (m + t) % m;
        }

        var next = wrapAround(player.currentWeapon + Math.sign(e.deltaY), player.weapons.length);
        player.switchWeapon(next);

        canScroll = false;
        setTimeout(function() {
          canScroll = true;
        }, 200);
      }
    }
  }
}