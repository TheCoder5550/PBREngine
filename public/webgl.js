import Renderer, { Scene, GameObject, Transform, AudioListener3D, Camera, Light, FindMaterials } from "./engine/renderer.js";
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
  ClosestPointOnLineSegment,
  AABBTriangleToAABB
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

var gamepadManager = new GamepadManager();

/* Canvas classes */

var stats = new Stats();
document.body.appendChild(stats.dom);

var ui = new GameCanvas({publicMethods: false});
ui.canvas.classList.add("ingameUI");

var renderer = new Renderer();
renderer.on("error", function() {
  loadingStatus.innerText = "WebGL 2 not supported";
});
renderer.on("contextlost", function() {
  running = false;
  loadingStatus.innerText = "WebGL context lost";
  showElement(loadingStatus);
  ws.close();
});

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

loadingStatus.innerText = "Connecting";
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

// var hasLoaded = false;

var audioListener = new AudioListener3D();

// var source = new AudioSource3D(audioListener, "./assets/sound/drumGun.wav");
// source.audioElement.loop = true;
// source.play();

var scene = new Scene("Main scene");

var orbitCamera;
var mainCamera = new Camera({position: new Vector(0, 0, -3), near: 0.1, far: 300, layer: 0, fov: 23});
var weaponCamera = new Camera({near: 0.005, far: 20, layer: 1, fov: 23});

var defaultFov = 40;//45;//37;
window.targetFov = defaultFov;
var currentFov = defaultFov;

var crosshair = new Crosshair();
var hitmarker = new Hitmarker();
window.player = null;

var physicsEngine = new PhysicsEngine(scene, new AABB({x: -100, y: -50.33, z: -150}, {x: 100, y: 50, z: 300}));
// var physicsEngine = new PhysicsEngine(scene, new AABB({x: -20, y: -1.33, z: -30}, {x: 20, y: 15, z: 30}));
// var colliders = [];

var time = 0;
var fpsHistory = [];

var bulletHoles;
var sparks;
var captureZoneManager = new CaptureZoneManager();

setup();
async function setup() {
  console.log("Setup start");
  console.time("setup");

  loadingStatus.innerText = "Setting up renderer";
  console.time("renderer.setup");
  await renderer.setup({
    version: 2,
    shadowSizes: [4, 45],
    renderScale: 0.9
  });
  renderer.postprocessing.exposure = -0.5;
  renderer.settings.enableShadows = false;
  renderer.add(scene);
  console.timeEnd("renderer.setup");

  loadingStatus.innerText = "Loading environment";
  console.time("loadEnvironment");
  // scene.smoothSkybox = true;
  scene.environmentIntensity = 0.7;
  scene.sunIntensity = Vector.fill(5);
  await scene.loadEnvironment({ hdrFolder: "./assets/hdri/wide_street_01_1k_precomputed" });
  console.timeEnd("loadEnvironment");

  orbitCamera = new OrbitCamera(renderer, {position: new Vector(0, 0, -3), near: 0.1, far: 300, layer: 0, fov: 23});

  var resizeEvent = function() {
    mainCamera.setAspect(renderer.aspect);
    weaponCamera.setAspect(renderer.aspect);
  }
  renderer.on("resize", resizeEvent);
  resizeEvent();

  // Create programs / shaders
  loadingStatus.innerText = "Loading assets";
  var reddotProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("./assets/shaders/custom/webgl2/reddot"));
  var litParallax = new renderer.ProgramContainer(await renderer.createProgramFromFile("./assets/shaders/custom/webgl2/litParallax"));
  var solidColorInstanceProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("./assets/shaders/custom/webgl2/solidColor"));
  // var foliage = await createProgram("./assets/shaders/foliage");
  // var waterShader = await createProgram("./assets/shaders/water");

  var bulletHole = renderer.loadTexture("./assets/textures/bullethole.png");
  var bulletTrail = renderer.loadTexture("./assets/textures/bulletTrail.png");
  var reddotTexture = renderer.loadTexture("./assets/textures/reddot.png", { TEXTURE_WRAP_S: renderer.gl.CLAMP_TO_EDGE, TEXTURE_WRAP_T: renderer.gl.CLAMP_TO_EDGE });
  // var leaves = loadTexture("./assets/textures/leaves.png");
  // var waterNormal = loadTexture("./assets/textures/water-normal.png");

  // Materials
  var reddotMaterial = new renderer.Material(reddotProgram);
  reddotMaterial.setUniform("albedoTexture", reddotTexture);
  reddotMaterial.setUniform("textureScale", 0.2);

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

  // AABB visualizer
  scene.add(new GameObject("AABB", {
    meshRenderer: new renderer.MeshInstanceRenderer([new renderer.Material(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
    castShadows: false
  }));

  // Bullet holes
  bulletHoles = scene.add(new GameObject("HitObject", {
    meshRenderer: new renderer.MeshInstanceRenderer([renderer.CreateLitMaterial({opaque: 0, albedoTexture: bulletHole}, renderer.litInstancedContainer)], [new renderer.MeshData(await renderer.loadObj("./assets/models/plane.obj"))]),
    castShadows: false
  }));

  // Bullet trails
  scene.add(new GameObject("BulletTrail", {
    meshRenderer: new renderer.MeshInstanceRenderer([renderer.CreateLitMaterial({opaque: 0, emissiveFactor: [40, 5, 5], emissiveTexture: bulletTrail, albedo: [0, 0, 0, 1], albedoTexture: bulletTrail}, renderer.litInstancedContainer)], [new renderer.MeshData(await renderer.loadObj("./assets/models/bulletTrail.obj"))]),
    castShadows: false
  }));

  // Bullet metal hit sparks
  var sparksObject = new GameObject("Particles");
  sparks = new renderer.ParticleSystem(new renderer.MeshData(await renderer.loadObj("./assets/models/bulletTrail.obj")));
  sparksObject.addComponent(sparks);
  scene.add(sparksObject);

  // Load map
  loadingStatus.innerText = "Loading map";
  // var map = scene.add(await renderer.loadGLTF("./assets/models/city/model.glb"));
  // var mapCollider = await renderer.loadGLTF("./assets/models/city/collider.glb");
  // var map = scene.add(await renderer.loadGLTF("./assets/models/test/playerArea.glb"));
  // var mapCollider = await renderer.loadGLTF("./assets/models/test/playerArea.glb");
  var map = await renderer.loadGLTF("./assets/models/warehouse/model.glb", { loadMaterials: true, maxTextureSize: 1024 });
  scene.add(renderer.BatchGameObject(map));
  // map.getChild("Plane").meshRenderer.materials[0].setUniform("doNoTiling", 1);

  loadingStatus.innerText = "Generating collider";
  var mapCollider = await renderer.loadGLTF("./assets/models/warehouse/collider.glb", { loadMaterials: false, loadNormals: false, loadTangents: false });

  console.time("addMeshToOctree");
  window.AABBToTriangleCalls = 0;
  physicsEngine.addMeshToOctree(mapCollider);
  console.log("Calls:", window.AABBToTriangleCalls);
  console.timeEnd("addMeshToOctree");
  // physicsEngine.octree.render(scene);

  var z1 = new CaptureZone();
  await z1.setup();
  var z2 = new CaptureZone(new Vector(0, 0, -15), z1.gameObject);
  await z2.setup();

  captureZoneManager.add(z1);
  captureZoneManager.add(z2);

  physicsEngine.fixedUpdate = function(dt) {
    player.fixedUpdate(dt);
  }

  // var rock = (await CreateGameObjectFromGLTF("./assets/models/rock.glb"))[0];
  // rock.position = new Vector(4, 0, 0);
  // rock.scale = new Vector(2, 2, 4);
  // scene.add(rock);

  // Parallax mapping
  // var s = await renderer.loadGLTF("./assets/models/ironPlane.glb");

  // var mat = s.children[0].meshRenderer.materials[0];
  // mat.textures.push(renderer.loadTexture("./assets/textures/rustyIron/heightmap.png"));
  // mat.createUniform("heightmapTexture", "1i", [mat.textures.length - 1]);
  // mat.setProgram(litParallax);

  // s.transform.rotation = Quaternion.eulerVector(new Vector(0, Math.PI, 0));
  // s.transform.position = new Vector(4, 1, 0);
  // scene.add(s);

  // Rigidbody sphere
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

  // Metal plane
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
  // gameObject.transform.rotation = Quaternion.eulerVector(new Vector(-Math.PI / 2, 0, 0));
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
  
  // Skinning
  // swat = scene.add(await renderer.loadGLTF("./assets/models/swatOptimizedRunning.glb"));
  // swat.transform.rotation = Quaternion.eulerVector(new Vector(0, Math.PI / 2, 0));
  // swat.animationController.loop = true;

  // var dancingMonster = scene.add(await renderer.loadGLTF("./assets/models/dancingMonster.glb"));
  // dancingMonster.animationController.loop = true;
  // Matrix.transform([
  //   ["translate", {x: 0, y: 0, z: -10}]
  // ], dancingMonster.matrix);

  //colliders.push(new AABBCollider({x: -50, y: 0, z: -50}, {x: 50, y: 50, z: 50}, Matrix.identity(), true))

  /*
    Weapons models
  */

  loadingStatus.innerText = "Loading weapons";

  var weaponModels = {
    pistol: scene.add(await renderer.loadGLTF("./assets/models/pistolSuppressor.glb", {gameObjectOptions: {castShadows: false}})),
    AK12: scene.add(await renderer.loadGLTF("./assets/models/weapons/AK12.glb", { gameObjectOptions: {castShadows: false}})),
    sniper: scene.add(renderer.BatchGameObject(await renderer.loadGLTF("./assets/models/weapons/sniper.glb", {gameObjectOptions: {castShadows: false}}))),

    // ak47: scene.add(await renderer.loadGLTF("./assets/models/ak47Hands.glb", { loadMaterials: true, maxTextureSize: 256, gameObjectOptions: {castShadows: false}})),
    // shotgun: scene.add(await renderer.loadGLTF("./assets/models/shotgun.glb", {gameObjectOptions: {castShadows: false}})),
    // sks: scene.add(await renderer.loadGLTF("./assets/models/sks.glb", { loadMaterials: false, gameObjectOptions: {castShadows: false}}))
  };

  for (var key in weaponModels) {
    var w = weaponModels[key];
    w.setLayer(1, true);
    w.visible = false;

    // Red dot
    var s = w.getChild("Reddot", true);
    if (s) {
      s.meshRenderer.materials[0] = reddotMaterial;
    }
  }
  
  for (var animation of weaponModels.pistol.animationController.animations) {
    if (animation.name.indexOf("Reload") != -1) {
      animation.speed = 0.9;
    }
    else if (animation.name.indexOf("Fire") != -1) {
      animation.speed = 2;
    }
  }

  weaponModels.AK12.transform.scale = Vector.fill(0.1);

  // var ak47 = weaponModels.ak47;
  // ak47.children[0].transform.rotation = Quaternion.euler(0, Math.PI, 0);
  // ak47.transform.scale = Vector.fill(2 / 20);
  // ak47.animationController.speed = 2.5;

  // shotgun.animationController.speed = 2.5;

  /*
    Weapon settings
  */
  var weapons = {
    AK12: () => new Weapon({
      weaponObject: weaponModels.AK12,
      ADSFOV: 30,
      ADSMouseSensitivity: 0.8,
      weaponModelADSOffset: Vector.zero(),
      reloadTime: 2700,
      magSize: 30,
      fireMode: WEAPONENUMS.FIREMODES.AUTO,
      roundsPerSecond: 10,
      recoil: function() {
        return {x: -1.2, y: (Math.random() - 0.5) * 1, z: 0};
      }
    }),
    pistol: () => new Weapon({
      weaponObject: weaponModels.pistol,
      reloadTime: 1200,
      weaponModelOffset: new Vector(-0.15, 0.1, 0.25)
    }),
    sniper: () => new Weapon({
      weaponObject: weaponModels.sniper,
      sniperScope: true,
      ADSFOV: 8.5,
      ADSMouseSensitivity: 0.2,
      roundsPerSecond: 1,
      magSize: 5,
      reloadTime: 1500,
      fireMode: WEAPONENUMS.FIREMODES.SINGLE,
      fireSoundBufferSize: 1,
      recoil: function() {
        return {x: -3, y: (Math.random() - 0.5) * 0.1, z: 0};
      }
    }),

    // ak47: () => new Weapon({
    //   weaponObject: weaponModels.ak47,
    //   ADSFOV: 30,
    //   ADSMouseSensitivity: 0.8,
    //   weaponModelOffset: new Vector(-0.2, 0.22, 0.5),
    //   weaponModelADSOffset: Vector.zero(),
    //   reloadTime: 2700,
    //   magSize: 30,
    //   fireMode: WEAPONENUMS.FIREMODES.AUTO,
    //   roundsPerSecond: 10,
    //   recoil: function() {
    //     return {x: -1.2, y: (Math.random() - 0.5) * 1, z: 0};
    //   }
    // }),
    // overpowered: () => new Weapon({weaponObject: pistolGameObject, roundsPerSecond: 1000, magSize: 5000, fireMode: WEAPONENUMS.FIREMODES.AUTO, recoil: function() {
    //   return Vector.zero();
    // }}),
    // shotgun: () => new Weapon({weaponObject: shotgun, reloadTime: 400, magSize: 6, roundsPerSecond: 2, bulletsPerShot: 10, ADSBulletSpread: 1, crosshairType: 1, sequentialReloading: true, recoil: function() {
    //   return {x: -5, y: (Math.random() - 0.5) * 0.2, z: 0};
    // }, fireSound: "./assets/sound/shotgun/fire.wav", reloadSound: "./assets/sound/shotgun/insertShell.wav", doneReloadingSound: "./assets/sound/shotgun/reloadEnd.wav"}),
  };


  /*
    Player setup
  */
  player = new Player({x: 10, y: 3, z: 10});
  player.setWeapons([
    weapons.pistol(),
    weapons.sniper(),
    weapons.AK12()
  ]);

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

  // hasLoaded = true;

  if (!disconnected) {
    hideElement(loadingDiv);
    running = true;

    window.renderer = renderer;
    window.scene = scene;
    window.physicsEngine = physicsEngine;
    window.mainCamera = mainCamera;
    window.bulletHoles = bulletHoles;
    window.sparks = sparks;
    window.defaultFov = defaultFov;

    // window.Debug = new GLDebugger();

    scene.updateLights();

    renderer.on("renderloop", renderloop);
  }
  else {
    loadingStatus.innerText = "Connection lost";
  }

  console.timeEnd("setup");

  function renderloop(frameTime, timeSinceStart) {
    time = timeSinceStart;
    counters = {};

    // Lag
    if (renderer.getKey(81)) {
      var x = 0;
      for (var i = 0; i < 3e7; i++) {
        x += i * i;
      }
    }
  
    for (var key in multiplayerCharacters) {
      multiplayerCharacters[key].update(physicsEngine.dt);
    }
  
    // player.update(dt);
    // player.fixedUpdate(dt);
  
    // var x = gamepadManager.getAxis("RSHorizontal");
    // var y = gamepadManager.getAxis("RSVertical");
    // x = (Math.abs(x) > 0.08 ? x : 0);
    // y = (Math.abs(y) > 0.08 ? y : 0);
  
    // var currentWeapon = player.getCurrentWeapon();
    // var weaponSens = currentWeapon ? currentWeapon.getCurrentSensitivity() : 1;
    // player.rotation.x += Math.abs(y) * y * 0.07 * weaponSens;
    // player.rotation.y += Math.abs(x) * x * 0.07 * weaponSens;
  
    // Fly camera
    // flyCamera(renderer, mainCamera, dt);
    // player.position = Vector.add(Vector.compMultiply(mainCamera.position, {x: 1, y: 1, z: -1}), {x: 0, y: -1.6, z: 0});
  
    physicsEngine.update();
    player.update(frameTime);
    scene.update(frameTime);
    captureZoneManager.update(frameTime);
    updateBulletTrails(physicsEngine.dt);
  
    crosshair.spacing = clamp(Vector.length(player.velocity) * 10, 25, 80);
  
    renderer.render(mainCamera, [weaponCamera]);
    // renderer.render(orbitCamera.camera);
    renderUI(frameTime);
  
    stats.update();
  }
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

function renderUI(dt) {
  ui.clearScreen();

  if (player.closestZone) {
    captureZoneManager.renderZoneUI(player.closestZone);
  }

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

  this.crouching = false;
  this.standHeight = 2;
  this.crouchHeight = 1.1;
  this.height = this.standHeight;
  this.colliderRadius = 0.5;

  // this.walkSpeed = 5;

  this.walkAcceleration = 150 * 0.3;
  this.runningAcceleration = 225 * 0.3;
  this.friction = 10;
  this.coyoteTime = 0.11;
  var groundCounter = 0;

  this.collisionIterations = 3;
  this.grounded = false;
  this.fakeGroundNormal = Vector.zero();
  this.realGroundNormal = Vector.zero();

  this.weapons = [];
  this.currentWeapon = 0;

  this.handRotation = this.rotation;

  this.handOffset = {x: 0.3, y: -0.25, z: -0.5};
  this.handRotOffset = {x: 0, y: 0.1 * 0, z: 0};

  // this.getHandMatrix = function(t = 0) {
  //   var rot = this.getHeadRotation();
  //   var ops = [
  //     ["translate", Vector.add(this.position, new Vector(0, this.height - 0.1, 0))],
  //     ["rz", -rot.z],
  //     ["ry", -rot.y],
  //     ["rx", -rot.x],
  //     // ["translate", Vector.multiply(this.getCurrentWeapon().weaponObject.children[0].getChild("ADSOffset").position, -1 / 10)],
  //     // ["translate", {x: 0, y: 0, z: -0.1}]
  //     ["translate", Vector.multiply(this.handOffset, t)],
  //     ["rz", this.handRotOffset.z * t],
  //     ["ry", this.handRotOffset.y * t],
  //     ["rx", this.handRotOffset.x * t],
  //     // ["translate", adsTranslate]
  //   ];

  //   // ops.push(["translate", Vector.multiply({x: 0.11, y: -0.1, z: -0.2}, t)]);

  //   // ops = ops.concat([
  //   //   ["rz", -(this.handRotation.z - rot.z) * t],
  //   //   ["ry", -(this.handRotation.y - rot.y) * t],
  //   //   ["rx", -(this.handRotation.x - rot.x) * t]
  //   // ]);

  //   var m = Matrix.transform(ops);

  //   var adsObject = this.getCurrentWeapon().weaponObject.getChild("ADSOffset", true);
  //   if (adsObject && t < 0.5) {
  //     // var weaponMatrix = this.getCurrentWeapon().weaponObject.getWorldMatrix();
  //     // var adsPos = Matrix.getPosition(adsObject.getWorldMatrix());
  //     // var localADSOffset = Matrix.transformVector(Matrix.inverse(weaponMatrix), adsPos);

  //     // m = Matrix.transform([["translate", new Vector(0, 0, -0.15)]], m);
  //     var localADSOffset = Matrix.inverse(adsObject.transform.getWorldMatrix(this.getCurrentWeapon().weaponObject));
  //     localADSOffset[12] *= 0.1;
  //     localADSOffset[13] *= 0.1;
  //     localADSOffset[14] *= 0.1;
  //     Matrix.setRotation(localADSOffset, Matrix.identity());
  //     m = Matrix.multiply(m, localADSOffset);

  //     // adsTranslate = Vector.add(Vector.multiply(localADSOffset, -0.1), new Vector(0, 0, -0.15));
  //     // adsTranslate = Vector.multiply(adsTranslate, 1 - t);
  //   }

  //   return m;
  // }

  this.setWeapons = function(weapons) {
    this.weapons = weapons;

    if (this.getCurrentWeapon()) {
      this.getCurrentWeapon().weaponObject.visible = true;
    }
  }

  this.getCurrentWeapon = function() {
    return this.weapons[this.currentWeapon];
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

  this.getHeadPos = function() {
    return Vector.add(this.position, {x: 0, y: this.height - 0.1, z: 0});
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

  this.update = function(dt) {
    this.crouching = renderer.getKey(67);
    this.height = this.crouching ? this.crouchHeight : this.standHeight;

    if (this.getCurrentWeapon()) {
      this.getCurrentWeapon().update(dt);
    }

    mainCamera.setFOV(currentFov);

    mainCamera.transform.rotation = Quaternion.eulerVector(Vector.negate(this.getHeadRotation()));
    mainCamera.transform.position = this.getHeadPos();//Vector.add(this.position, {x: 0, y: this.height - 0.1, z: 0});
    // mainCamera.transform.position = Vector.add(Vector.compMultiply(this.position, {x: 1, y: 1, z: -1}), {x: 0, y: 1.6, z: 0});

    weaponCamera.transform.position = mainCamera.transform.position;
    weaponCamera.transform.rotation = mainCamera.transform.rotation;

    // var rot = this.getHeadRotation();
    // var m = Matrix.transform([
    //   ["translate", this.getHeadPos()],
    //   ["rz", -rot.z],
    //   ["ry", -rot.y],
    //   ["rx", -rot.x]
    // ]);
    // audioListener.setDirection(Matrix.getForward(m), Vector.up());
    // audioListener.setPosition(this.position);
  }

  // bruh 200kb memory
  this.fixedUpdate = function(dt) {
    // this.handRotation = Vector.add(this.handRotation, Vector.multiply(Vector.subtract(this.getHeadRotation(), this.handRotation), 0.8));
    this.handRotation = this.getHeadRotation();

    // Gravity
    this.velocity.y -= 18 * dt;

    var vertical = (renderer.getKey(87) || 0) - (renderer.getKey(83) || 0);
    var horizontal = (renderer.getKey(65) || 0) - (renderer.getKey(68) || 0);

    if (vertical || horizontal) {
      var direction = Vector.rotateAround({
        x: vertical,
        y: 0,
        z: -horizontal
      }, {x: 0, y: 1, z: 0}, -this.rotation.y + Math.PI / 2);

      if (this.grounded) {
        direction = Vector.normalize(Vector.projectOnPlane(direction, this.realGroundNormal));
      }

      var currentAcceleration = renderer.getKey(16) ? this.runningAcceleration : this.walkAcceleration;
      currentAcceleration *= (this.grounded ? 1 : 0.1);

      actionQueue.push({type: "movement", time: new Date(), direction: direction, speed: this.walkSpeed, dt: dt});
      // this.position = Vector.add(this.position, Vector.multiply(direction, this.walkSpeed * dt));

      this.velocity = Vector.add(this.velocity, Vector.multiply(direction, currentAcceleration * dt));
    }

    // Jumping
    // if (renderer.getKey(32) && this.grounded) {
    //   this.velocity.y = 6;
    //   this.position.y += 0.2;
    //   actionQueue.push({type: "jump", time: new Date()});
    // }

    if (this.grounded) {
      groundCounter = this.coyoteTime;
    }

    if (renderer.getKey(32) && groundCounter > 0) {
      this.velocity.y = 6;
      groundCounter = 0;
      actionQueue.push({type: "jump", time: new Date()});
    }

    groundCounter -= dt;

    // Ground friction/drag
    if (this.grounded) {
      var projectedVelocity = Vector.projectOnPlane(this.velocity, this.fakeGroundNormal);//{x: this.velocity.x, y: 0, z: this.velocity.z};
      var speed = Vector.length(projectedVelocity);
      this.velocity = Vector.add(this.velocity, Vector.multiply(Vector.normalize(projectedVelocity), -speed * dt * this.friction));

      // Sliding / turning
      if (this.crouching) {
        var v = Vector.rotateAround({
          x: Vector.length(Vector.projectOnPlane(this.velocity, this.fakeGroundNormal)),
          y: 0,
          z: 0
        }, this.fakeGroundNormal, -this.rotation.y + Math.PI / 2);
        
        this.velocity.x = v.x;
        this.velocity.z = v.z;
      }
    }

    this.position = Vector.add(this.position, Vector.multiply(this.velocity, dt));

    // Collision solving
    this.grounded = false;

    var radiusOffset = new Vector(0, this.colliderRadius, 0);
    var playerAABB = new AABB(
      {x: this.position.x - this.colliderRadius * 2, y: this.position.y - this.colliderRadius * 2,               z: this.position.z - this.colliderRadius * 2},
      {x: this.position.x + this.colliderRadius * 2, y: this.position.y + this.colliderRadius * 2 + this.height, z: this.position.z + this.colliderRadius * 2}
    );
    var q = physicsEngine.octree.queryAABB(playerAABB);

    for (var iter = 0; iter < this.collisionIterations; iter++) {
      if (q) {
        for (var k = 0; k < q.length; k++) {
          if (!AABBTriangleToAABB(q[k][0], q[k][1], q[k][2], playerAABB)) {
            continue;
          }

          var col = capsuleToTriangle(Vector.add(this.position, radiusOffset), Vector.subtract(Vector.add(this.position, new Vector(0, this.height, 0)), radiusOffset), this.colliderRadius, q[k][0], q[k][1], q[k][2], true);
          
          if (col && !Vector.equal(col.normal, Vector.zero(), 0.001)) {
            var dp = Vector.dot(Vector.up(), col.normal);
            var normal = dp > 0.8 ? Vector.up() : col.normal;
            var depth = col.depth / Vector.dot(normal, col.normal);

            this.position = Vector.add(this.position, Vector.multiply(normal, depth));
            this.velocity = Vector.projectOnPlane(this.velocity, normal);

            var isGround = Vector.dot(normal, Vector.up()) > 0.7;
            if (isGround) {
              this.fakeGroundNormal = normal;
              this.realGroundNormal = col.normal;
              this.grounded = true;
            }
          }
        }
      }
    }

    // // Extend grounded collision
    // if (!this.grounded) {
    //   var hit = physicsEngine.Raycast(this.position, Vector.down());
    //   if (hit && hit.firstHit && hit.firstHit.distance < this.height / 2 + 0.01) {
    //     this.grounded = true;
    //     this.realGroundNormal = hit.firstHit.normal;

    //     // bruh copy code
    //     var dp = Vector.dot(Vector.up(), this.realGroundNormal);
    //     var normal = dp > 0.8 ? Vector.up() : this.realGroundNormal;
    //     this.fakeGroundNormal = normal;
    //   }
    // }

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

function CaptureZoneManager() {
  this.zones = [];

  this.add = function(zone) {
    this.zones.push(zone);
  }

  this.update = function(dt) {
    player.closestZone = null;

    for (var zone of this.zones) {
      zone.update(dt);
    }
  }

  this.renderZoneUI = function(zone) {
    ui.rectangle(ui.width / 2 - 100, ui.height - 50, 200, 20, "white");
    ui.rectangle(ui.width / 2 - 100, ui.height - 50, zone.timer * 200, 20, glColorToRGB(zone.getColor()));
  }

  function glColorToRGB(color) {
    var v = Vector.normalize(Vector.fromArray(color))
    return `rgb(${v.x * 255}, ${v.y * 255}, ${v.z * 255})`;
  }
}

function CaptureZone(position = Vector.zero(), zoneInstance) {
  var teamHolding = 0;
  var teamHoldingTimer = 0;
  var teamColors = [
    [50, 50, 50], // White
    [10, 25, 50], // Blue
    [50, 20, 2]   // Orange
  ];
  
  this.captureSpeed = 1 / 4;
  this.timer = 0;
  this.radius = 5;

  this.setup = async function() {
    if (zoneInstance) {
      this.gameObject = scene.add(zoneInstance.copy());
    }
    else {
      this.gameObject = scene.add(await renderer.loadGLTF("./assets/models/captureZone.glb"));
      this.gameObject.children[0].castShadows = false;

      var zoneProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("./assets/shaders/custom/webgl2/captureZone"));
      var mat = this.gameObject.children[0].meshRenderer.materials[0] = new renderer.Material(zoneProgram);
      mat.setUniform("color", [5, 5, 5]);
      mat.doubleSided = true;
      mat.opaque = false;

      var lightObject = this.gameObject.addChild(new GameObject("Light"));
      lightObject.transform.position = new Vector(0, 2, 0);
      var light = lightObject.addComponent(new Light());
      light.color = [50, 50, 50];
    }

    this.gameObject.transform.position = position;
    this.setTeam(0);
  }

  this.update = function(dt) {
    var playerTeam = player.team ?? 1;

    if (Vector.distanceSqr(player.position, this.gameObject.transform.position) < this.radius * this.radius) {
      if (this.noTeamHolding()) {
        if (teamHoldingTimer == playerTeam) {
          this.timer += this.captureSpeed * dt;
          if (this.timer >= 1) {
            this.setTeam(playerTeam);
          }
        }
        else {
          this.timer -= this.captureSpeed * dt;
          if (this.timer <= 0) {
            teamHoldingTimer = playerTeam;
            this.setTeam(0);
          }
        }
      }
      else {
        if (teamHolding != playerTeam) {
          this.timer -= this.captureSpeed * dt;
          if (this.timer <= 0) {
            teamHoldingTimer = playerTeam;
            this.setTeam(0);
          }
        }
      }

      player.closestZone = this;
    }

    this.timer = clamp(this.timer, 0, 1);
  }

  this.noTeamHolding = function() {
    return teamHolding === 0;
  }

  this.setTeam = function(index) {
    teamHolding = index;

    if (!this.noTeamHolding()) {
      this.timer = 1;
    }

    var color = teamColors[teamHolding];

    var mat = this.gameObject.children[0].meshRenderer.materials[0];
    mat.setUniform("color", getRingColor(color));

    var l = this.gameObject.getChild("Light", true) || this.gameObject.getChild("Light (Copy)", true);
    l.getComponents()[0].color = color;

    scene.updateLights();
  }

  this.getTeam = function() {
    return teamHolding;
  }

  this.getColor = function() {
    return teamColors[teamHoldingTimer];
  }

  function getRingColor(color) {
    return [
      color[0] / 10,
      color[1] / 10,
      color[2] / 10
    ];
  }
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

// bruh performance intensive
// bruh add to renderer class
function GLDebugger() {
  this.index = 0;
  this.cubes = [];
  for (var i = 0; i < 50; i++) {
    var c = this.cubes[i] = scene.add(renderer.CreateShape("cube"));
    c.transform.position.y = -100;
    c.castShadows = false;

    var m = FindMaterials("", c)[0];
    m.setUniform("albedo", [0, 0, 0, 1]);
    m.setUniform("emissiveFactor", [Math.random(), Math.random(), Math.random()]);
  }

  this.clear = function() {
    this.index = 0;
    for (var cube of this.cubes) {
      cube.transform.position.y = -100;
    }
  }

  this.Vector = function(p, normal, size = 1, color) {
    var c = this.cubes[this.index];
    c.transform.matrix = Matrix.lookAt(Vector.add(p, Vector.multiply(normal, 0.5 * size)), Vector.add(p, normal), new Vector(0.1, 0.9, 0));
    c.transform.scale = new Vector(0.01, 0.01, 0.5 * size);

    if (color) {
      FindMaterials("", c)[0].setUniform("emissiveFactor", color);
    }

    this.index++;
    this.index = this.index % this.cubes.length;
  }

  this.Point = function(p, size = 0.2, color) {
    var c = this.cubes[this.index];
    c.transform.position = p;
    c.transform.scale = Vector.fill(size);

    if (color) {
      FindMaterials("", c)[0].setUniform("emissiveFactor", color);
    }

    this.index++;
    this.index = this.index % this.cubes.length;
  }
}