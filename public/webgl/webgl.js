import Renderer, { Scene, GameObject, Transform, AudioListener3D, Camera, Light, FindMaterials, flyCamera, IK, AnimationController, AnimationBlend } from "../engine/renderer.mjs";
import { 
  AABB,
  PhysicsEngine,
  Rigidbody,
  GetMeshAABB
} from "../engine/physics.mjs";
import Vector from "../engine/vector.mjs";
import Quaternion from "../engine/quaternion.mjs";
import Matrix from "../engine/matrix.mjs";
import {
  roundToPlaces,
  mapValue,
  clamp,
  lerp,
  inverseLerp,
  watchGlobal,
  fadeOutElement,
  hideElement,
  showElement,
  roundNearest,
  resetAnimations,
  cloneTemplate,
  removeChildren
} from "../engine/helper.mjs";
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
} from "../engine/algebra.mjs";
import { WEAPONENUMS, updateBulletTrails, Weapon, Scope, BulletTrail, bulletTrails } from "./weapon.js";
import OrbitCamera from "../engine/orbitCamera.mjs";
import PlayerPhysicsBase from "../playerPhysicsBase.mjs";
import * as brokenPlasterSource from "../assets/shaders/custom/brokenPlaster.glsl.mjs";

var perlin = new Perlin();

/*

https://wickedengine.net/2020/04/26/capsule-collision-detection/

Multiplayer:
https://github.com/MFatihMAR/Game-Networking-Resources
https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html
https://www.codersblock.org/blog/client-side-prediction-in-unity-2018
https://github.com/spectre1989/unity_physics_csp/blob/d0a1f2e5642e5833d373d8b2c1ce2ac5eb438b3b/Assets/Logic.cs#L314
https://gafferongames.com/post/networked_physics_2004/

Database security:
https://www.vaadata.com/blog/how-to-securely-store-passwords-in-database/

Inspiration:
https://www.youtube.com/watch?v=flf20FZHT3M&t=8s


*/

/* HTML */

// var fc = new FakeConsole();

var LS_BASE = "com.tc5550.webgl";
var LS_USERNAME = LS_BASE + ".username";
var LS_SELECTEDCLASS = LS_BASE + ".selectedClass";
var LS_SETTINGS = LS_BASE + ".settings";

console.log("Page loaded");

var lobbyTabs = document.querySelectorAll(".lobbyUI input[type='radio']");

var lobbyUI = document.querySelector(".lobbyUI");
var deployButton = lobbyUI.querySelector("#deploy");
deployButton.addEventListener("click", deploy);

var usernameInput = lobbyUI.querySelector("#username");
usernameInput.value = localStorage.getItem(LS_USERNAME);
usernameInput.addEventListener("input", function() {
  localStorage.setItem(LS_USERNAME, usernameInput.value);
});

var loadoutUI = document.querySelector(".loadout");
var selectClassButton = loadoutUI.querySelector(".selectClass");
selectClassButton.addEventListener("click", function() {
  var c = selectClassButton.getAttribute("data-targetClass");
  if (c) {
    selectClass(c);
  }
})

var gameUI = document.querySelector(".gameUI");

var ammoCounter = document.querySelector(".gameUI .bottomRight .ammo");
var currentAmmoSpan = ammoCounter.querySelector(".current");
var maxAmmoSpan = ammoCounter.querySelector(".max");

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
];

var loadingDiv = document.getElementsByClassName("loading")[0];
var loadingStatus = document.getElementById("loadingStatus");

var deathScreen = document.querySelector(".deathScreen");

var gamepadManager = new GamepadManager();

/* Canvas classes */

// var stats = new Stats();
// document.body.appendChild(stats.dom);

var ui = new GameCanvas({publicMethods: false});
ui.canvas.classList.add("ingameUI");

var renderer;

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

var running = true;
var disconnected = false;

// const urlParams = new URLSearchParams(window.location.search);
// var playerId = parseInt(urlParams.get('id')) || Math.floor(Math.random() * 1e6);

// Settings
var LERP_DELAY = 200 * 2;
var SERVER_SEND_FPS = 15;
// var CORRECTION_SIM_STEPS = 5;
var SIMULATED_PING = () => 0;//Math.random() * 50 + 50;
//

var ws;
var stateBuffer = [];
var inputBuffer = [];
var inputsToSend = [];
var tick = 0;

// var actionQueue = [];
// var oldActionQueues = [];
var sendDataInterval;
var multiplayerCharacters = {};
var latencies = [];
var swat;

var mouse = { movementX: 0, movementY: 0 };

window.audioContext = new AudioContext();
window.masterVolume = audioContext.createGain();
masterVolume.gain.value = 50;
masterVolume.connect(audioContext.destination);

var audioListener = new AudioListener3D();
var leaderboard = new Leaderboard(document.querySelector(".leaderboard"));
var killfeed = new Killfeed();
var settings = new Settings();

// var source = new AudioSource3D(audioListener, "./assets/sound/drumGun.wav");
// source.audioElement.loop = true;
// source.play();

var scene;

var orbitCamera;
var mainCamera = new Camera({position: new Vector(0, 0, -3), near: 0.1, far: 300, layer: 0});
var weaponCamera = new Camera({near: 0.005, far: 20, layer: 1, fov: 23});
var lobbyWeaponCamera;

var defaultFov = 40;//45;//37;
window.targetFov = defaultFov;
var currentFov = defaultFov;

window.defaultWeaponFov = 32;
window.targetWeaponFov = defaultWeaponFov;
var currentWeaponFov = defaultWeaponFov;

var crosshair = new Crosshair();
window.hitmarker = new Hitmarker();
window.player = null;
var classes;
var selectedClass;
window.enemies = [];

// var physicsEngine = new PhysicsEngine(scene, new AABB({x: -100, y: -50.33, z: -150}, {x: 100, y: 50, z: 300})); // city collider size 
// var physicsEngine = new PhysicsEngine(scene, new AABB({x: -20, y: -1.33, z: -30}, {x: 20, y: 15, z: 30}));
var physicsEngine;
// var colliders = [];

var time = 0;
var fpsHistory = [];

var reddotMaterial;
var bulletHoles;
var sparks;
var captureZoneManager = new CaptureZoneManager();

setup();
async function setup() {
  console.log("Setup start");
  console.time("setup");

  /*
    Create renderer
  */

  loadingStatus.innerText = "Setting up renderer";
  console.time("renderer.setup");

  renderer = new Renderer({
    version: 2,
    clearColor: [0.02, 0.02, 0.02, 1],
    shadowSizes: [4, 30],
    shadowBiases: [-0.0003, -0.001],
    renderScale: 1,
    path: "../"
  });

  renderer.on("error", function() {
    loadingStatus.innerText = "WebGL 2 not supported";
  });
  renderer.on("contextlost", function() {
    running = false;
    loadingStatus.innerText = "WebGL context lost";
    showElement(loadingStatus);
    ws.close();
  });

  renderer.settings.loadTextures = false;
  renderer.postprocessing.exposure = -0.5;
  console.timeEnd("renderer.setup");

  /*
    Create scenes
  */

  loadingStatus.innerText = "Loading environment";
  console.time("loadEnvironment");

  scene = new Scene("Main scene");
  renderer.add(scene);

  scene.environmentIntensity = 0.8//0.4;
  scene.sunIntensity = Vector.fill(4);
  // await scene.loadEnvironment();
  // await scene.loadEnvironment({ hdrFolder: "../assets/hdri/sky_only" });
  // var oldSkybox = scene.skyboxCubemap;
  await scene.loadEnvironment({ hdrFolder: "../assets/hdri/wide_street_01_1k_precomputed" });
  // scene.skyboxCubemap = oldSkybox;

  console.timeEnd("loadEnvironment");

  // window.glDebugger = new GLDebugger();
  
  var menuScene = new Scene("Menu scene");
  renderer.add(menuScene);
  menuScene.copyEnvironment(scene);
  menuScene.sunIntensity = Vector.fill(3);
  menuScene.environmentIntensity = 0.35;
  menuScene.sunDirection.z *= -1;

  /*
    Cameras
  */

  // orbitCamera = new OrbitCamera(renderer, {position: new Vector(0, 0, -3), near: 0.1, far: 300, layer: 0, fov: 23});
  lobbyWeaponCamera = new OrbitCamera(renderer, {near: 0.01, far: 100, layer: 0, fov: 20}, { translate: false, scale: true, stylePointer: false });
  lobbyWeaponCamera.distance = 3;
  // lobbyWeaponCamera.rotation = new Vector(0, -Math.PI / 2, 0);
  lobbyWeaponCamera.setCenter(new Vector(0, 1.1, 0));

  var resizeEvent = function() {
    mainCamera.setAspect(renderer.aspect);
    weaponCamera.setAspect(renderer.aspect);
  }
  renderer.on("resize", resizeEvent);
  resizeEvent();

  /*
    Create programs / shaders
  */

  loadingStatus.innerText = "Loading programs";
  var reddotProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/reddot"));
  // var litParallax = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/litParallax"));
  var solidColorInstanceProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/solidColor"));
  var foliage = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/foliage"));
  var brokenPlasterProgram = new renderer.ProgramContainer(await renderer.createProgram(brokenPlasterSource.webgl2.vertex, brokenPlasterSource.webgl2.fragment));
  // var waterShader = await createProgram("./assets/shaders/water");

  /*
    Load textures
  */

  loadingStatus.innerText = "Loading textures";
  var bulletHole = renderer.loadTexture("../assets/textures/bullethole.png");
  var bulletTrail = renderer.loadTexture("../assets/textures/bulletTrail.png");
  var reddotTexture = renderer.loadTexture("../assets/textures/reddot2.png", { TEXTURE_WRAP_S: renderer.gl.CLAMP_TO_EDGE, TEXTURE_WRAP_T: renderer.gl.CLAMP_TO_EDGE });
  var leaves = renderer.loadTexture("../assets/textures/leaves.png");
  // var waterNormal = loadTexture("../assets/textures/water-normal.png");

  /*
    Materials
  */

  reddotMaterial = new renderer.Material(reddotProgram);
  reddotMaterial.setUniform("albedoTexture", reddotTexture);
  reddotMaterial.setUniform("textureScale", 0.2 * 0.3);
  reddotMaterial.setUniform("scopeColor", [20, 0.1, 0.1]);

  var foliageMat = new renderer.Material(foliage);
  foliageMat.doubleSided = true;
  foliageMat.setUniform("useTexture", 1);
  foliageMat.setUniform("albedoTexture", leaves);

  // var waterMaterial = new Material(waterShader, [
  //   {type: "1i", name: "useNormalTexture", arguments: [1]},
  //   {type: "1i", name: "normalTexture", arguments: [0]},
  //   {type: "2f", name: "uvScale", arguments: [20, 20]},
  //   {type: "3f", name: "sunDirection", arguments: [sunDirection.x, sunDirection.y, sunDirection.z]},
  // ], [waterNormal]);

  /*
    AABB visualizer
  */

  var aabbVis = scene.add(new GameObject("AABB", {
    meshRenderer: new renderer.MeshInstanceRenderer([new renderer.Material(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
    castShadows: false
  }));

  // Bullet holes
  bulletHoles = scene.add(new GameObject("HitObject", {
    meshRenderer: new renderer.MeshInstanceRenderer([renderer.CreateLitMaterial({opaque: 0, albedoTexture: bulletHole}, renderer.programContainers.litInstanced)], [await renderer.loadObj("../assets/models/plane.obj")]),
    castShadows: false
  }));

  // Bullet trails
  scene.add(new GameObject("BulletTrail", {
    meshRenderer: new renderer.MeshInstanceRenderer([renderer.CreateLitMaterial({opaque: 0, emissiveFactor: [40, 5, 5], emissiveTexture: bulletTrail, albedo: [0, 0, 0, 1], albedoTexture: bulletTrail}, renderer.programContainers.litInstanced)], [await renderer.loadObj("../assets/models/bulletTrail.obj")]),
    castShadows: false
  }));

  // Bullet metal hit sparks
  var sparksObject = new GameObject("Spark particles");

  sparks = new renderer.ParticleSystem();
  sparks.orientation = "faceCamera";
  sparks.gravityScale = -0.1;
  sparks.drag = 1;
  sparks.startSize = Vector.fill(0.04);
  sparks.endSize = Vector.fill(0.15);

  var mat = renderer.CreateLitMaterial({
    albedoTexture: renderer.loadTexture(renderer.path + "assets/textures/smoke.png"),
    albedoColor: [1, 1, 1, 1],
  }, renderer.programContainers.particle);
  mat.doubleSided = true;
  sparks.material = mat;

  sparksObject.addComponent(sparks);
  scene.add(sparksObject);

  // Muzzle flash
  var muzzleFlashObject = new GameObject("Muzzle flash particles");
  muzzleFlashObject.setLayer(1, true);
  var muzzleFlash = new renderer.ParticleSystem(await renderer.loadObj("../assets/models/bulletTrail.obj"));
  muzzleFlash.emitPosition = Vector.zero();
  muzzleFlash.emitVelocity = () => new Vector(1 * (Math.random() - 0.5), 1 * (Math.random() - 0.5), -3);
  muzzleFlash.startSize = new Vector(2.5, 0.25, 0.25);
  muzzleFlash.emitHealth = 0.25;
  muzzleFlash.gravityScale = 0;
  muzzleFlash.wind = () => Vector.zero();
  muzzleFlashObject.addComponent(muzzleFlash);

  var mat = renderer.CreateLitMaterial({
    albedoTexture: renderer.loadTexture(renderer.path + "assets/textures/muzzleFlashParticle.png"),
    albedoColor: [20, 5, 2, 1],
  }, renderer.programContainers.particle);
  mat.doubleSided = true;
  muzzleFlash.material = mat;

  scene.add(muzzleFlashObject);

  window.muzzleFlashEnabled = false;

  // Menu map
  var menuMap = menuScene.add(await renderer.loadGLTF("../assets/models/maps/menu/model.glb"));

  var hedge = menuScene.add(await renderer.loadGLTF("../assets/models/hedge.glb"));
  hedge.transform.rotation = Quaternion.euler(0, Math.PI / 2, 0);
  hedge.transform.position.z = -3;
  hedge.children[0].meshRenderer.materials[0] = foliageMat;

  // menuScene.add(await renderer.loadGLTF("../assets/models/DamagedHelmet.glb"));

  // Load map
  loadingStatus.innerText = "Loading map";

  var mapPath = "../assets/models/maps/dust2/dust2.glb";
  var colliderPath = "../assets/models/maps/dust2/dust2.glb";

  // var map = scene.add(await renderer.loadGLTF("../assets/models/city/model.glb"));
  // var mapCollider = await renderer.loadGLTF("../assets/models/city/collider.glb");
  // var map = scene.add(await renderer.loadGLTF("../assets/models/test/playerArea.glb"));
  // var mapCollider = await renderer.loadGLTF("../assets/models/test/playerArea.glb");
  var map = await renderer.loadGLTF(mapPath, { loadMaterials: true, maxTextureSize: 1024 });
  // scene.add(renderer.BatchGameObject(map));
  scene.add(map);

  // map.getChild("Plane").meshRenderer.materials[0].setUniform("doNoTiling", 1);

  map.getChildrenWithCustomData("foliage").forEach(o => {
    o.meshRenderer.materials[0] = foliageMat;
  });

  loadingStatus.innerText = "Generating collider";
  var mapCollider = await renderer.loadGLTF(colliderPath, { loadMaterials: false, loadNormals: false, loadTangents: false });

  physicsEngine = new PhysicsEngine(scene);
  physicsEngine.addMeshCollider(mapCollider);
  physicsEngine.setupMeshCollider();
  // physicsEngine.octree.render(scene);

  // var terrain = scene.add(new GameObject("Terrain"));
  // var chunkSize = 100;
  // var chunkRes = 100;
  // var material = renderer.CreateLitMaterial();
  // material.setUniform("albedo", [0.2, 0.7, 0.1, 1]);
  // terrain.meshRenderer = new renderer.MeshRenderer(material, createTerrainData(chunkSize, chunkSize, chunkRes, 30, Vector.zero(), 0.01, 600));

  // physicsEngine = new PhysicsEngine(scene);
  // physicsEngine.addMeshCollider(terrain);
  // physicsEngine.setupMeshCollider();

  physicsEngine.fixedUpdate = function(dt) {
    player.fixedUpdate(dt);
    player.update(dt);
  }

  // console.time("addMeshToOctree");
  // window.AABBToTriangleCalls = 0;
  // physicsEngine.addMeshToOctree(mapCollider);
  // console.log("Calls:", window.AABBToTriangleCalls);
  // console.timeEnd("addMeshToOctree");
  // physicsEngine.octree.render(scene);

  loadingStatus.innerText = "Loading meshes";

  // // King of the hill zone
  // var hill = await CreateCaptureZone(Vector.zero());
  // captureZoneManager.add(hill);

  // enemies.push(new Enemy(map.getChild("Target", true)));
  // enemies.push(new Enemy(map.getChild("Target.001", true)));
  // enemies.push(new Enemy(map.getChild("Target.002", true)));

  // // Loadout light
  // var lightObject = scene.add(new GameObject("Light"));
  // lightObject.transform.position = new Vector(1, 0.1, 1);
  // var light = lightObject.addComponent(new Light());
  // light.color = [50, 34, 20];

  // // IK test
  // var soldier = scene.add(await renderer.loadGLTF("../assets/models/running/skin.glb", { disableAnimations: true }));
  // // soldier.setLayer(1, true);
  // soldier.transform.scale = Vector.fill(1.17);
  // // soldier.transform.scale = Vector.fill(0.067);
  // // soldier.transform.position.z = 7;

  // var rightArm = soldier.addComponent(new IK([
  //   soldier.getChild("mixamorig:RightArm", true),
  //   soldier.getChild("mixamorig:RightForeArm", true),
  //   soldier.getChild("mixamorig:RightHand", true)
  // ]));

  // var leftArm = soldier.addComponent(new IK([
  //   soldier.getChild("mixamorig:LeftArm", true),
  //   soldier.getChild("mixamorig:LeftForeArm", true),
  //   soldier.getChild("mixamorig:LeftHand", true)
  // ]));
  // leftArm.controlAngle = Math.PI * 1.25;

  // for (var bone of rightArm.bones) {
  //   renderer.gizmos.visualize(bone);
  // }

  // // leftArm.endObject.setParent(rightArm.endObject);
  // // leftArm.endObject.transform.matrix = Matrix.identity();
  // // leftArm.endObject.transform.position.z += 6;
  // // leftArm.endObject.transform.position.y += 2;

  // // var startY = rightArm.endObject.transform.position.y;

  // // console.log(rightArm.endObject.transform.position, leftArm.endObject.transform.position)

  // // setInterval(function() {
  // //   var trailPos = Vector.add(Matrix.getPosition(soldier.transform.worldMatrix), new Vector(0, 1.5, 0));
  // //   var direction = Vector.negate(Matrix.getForward(soldier.transform.worldMatrix));
  // //   var trailVel = Vector.multiply(direction, 50);
  // //   var trail = new BulletTrail(trailPos, trailVel, direction);
  // //   bulletTrails.push(trail);
  // // }, 1000 / 6);

  // // var sc = scene.add(soldier.copy());
  // // sc.transform.position.x += 3;

  // // enemies.push(new Enemy(sc));
  // // enemies.push(new Enemy(soldier));

  // Parallax mapping
  // var s = await renderer.loadGLTF("../assets/models/ironPlane.glb");

  // var mat = s.children[0].meshRenderer.materials[0];
  // mat.textures.push(renderer.loadTexture("../assets/textures/rustyIron/heightmap.png"));
  // mat.createUniform("heightmapTexture", "1i", [mat.textures.length - 1]);
  // mat.setProgram(litParallax);

  // s.transform.rotation = Quaternion.eulerVector(new Vector(0, Math.PI, 0));
  // s.transform.position = new Vector(4, 1, 0);
  // scene.add(s);

  // Rigidbody sphere
  // var ball = (await CreateGameObjectFromGLTF("../assets/models/primitives/uvSphere.glb"))[0];
  // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "albedo").arguments = [1, 1, 1];
  // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "roughness").arguments[0] = 0.01;
  // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "metallic").arguments[0] = 0.99;
  // // ball.position = new Vector(0, 3, 0);
  // ball.addComponent(new Rigidbody());
  // ball.findComponents("Rigidbody")[0].position = new Vector(0, 5, 5.5);
  // scene.add(ball);

  // Vegetation
  // var bush = scene.add(await renderer.loadGLTF("../assets/models/bush.glb"));
  // bush.transform.position.x = 10;
  // bush.transform.scale = Vector.fill(1.3);
  // bush.children[0].meshRenderer.materials[0] = foliageMat;

  // var tree = scene.add(await renderer.loadGLTF("../assets/models/tree.glb"));
  // tree.transform.position = new Vector(17, 0, 3);
  // tree.children[0].children[0].meshRenderer.materials[0] = tree.children[0].children[1].meshRenderer.materials[0] = foliageMat;

  // for (var i = 0; i < 4; i++) {
  //   var hedge = scene.add(await renderer.loadGLTF("../assets/models/hedge.glb"));
  //   hedge.transform.position = new Vector(0, 0, -i * 4);
  //   hedge.transform.rotation = Quaternion.euler(0, i * Math.PI / 2, 0);
  //   hedge.children[0].meshRenderer.materials[0] = foliageMat;
  // }

  // Broken plaster
  var brokenPlasterObjects = map.getChildrenWithCustomData("brokenPlaster");
  if (brokenPlasterObjects) {
    var gl = renderer.gl;
    var sRGBInternalFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.SRGB8_ALPHA8;
    var sRGBFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.RGBA;
    
    var plasterAlbedo = await renderer.loadTextureAsync("../assets/textures/plaster17/Plaster17_COL_VAR2_3K.jpg", {maxTextureSize: 256, internalFormat: sRGBInternalFormat, format: sRGBFormat});
    var plasterNormal = await renderer.loadTextureAsync("../assets/textures/plaster17/Plaster17_NRM_3K.jpg", {maxTextureSize: 256});

    var brickAlbedo = await renderer.loadTextureAsync("../assets/textures/bricks01/Bricks01_COL_VAR1_3K.jpg", {maxTextureSize: 256, internalFormat: sRGBInternalFormat, format: sRGBFormat});
    var brickNormal = await renderer.loadTextureAsync("../assets/textures/bricks01/Bricks01_NRM_3K.jpg", {maxTextureSize: 256});

    var plasterMat = renderer.CreateLitMaterial({}, brokenPlasterProgram);
    plasterMat.setUniform("roughness", 1);
    plasterMat.setUniform("albedoTextures[0]", [ plasterAlbedo, brickAlbedo ]);
    plasterMat.setUniform("normalTextures[0]", [ plasterNormal, brickNormal ]);

    // var cube = scene.add(await renderer.loadGLTF("../assets/models/maps/1/brokenPlasterPillar.glb"));
    // cube.transform.position.z -= 3.4;
    // cube.children[0].meshRenderer.materials[0] = plasterMat;

    for (var obj of brokenPlasterObjects) {
      obj.meshRenderer.materials[0] = plasterMat;
    }
  }

  // Metal plane
  // var albedo = renderer.loadTexture("../assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_COL_1K_METALNESS.jpg", {internalFormat: renderer.gl.SRGB8_ALPHA8});
  // var normal = renderer.loadTexture("../assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_NRM_1K_METALNESS.jpg");
  // var metalRoughness = renderer.loadMetalRoughness("../assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_METALNESS_1K_METALNESS.jpg", "../assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_ROUGHNESS_1K_METALNESS.jpg");
  
  // var material = renderer.CreateLitMaterial({
  //   albedoTexture: albedo,
  //   normalTexture: normal,
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
  // var mat = new renderer.Material(await renderer.createProgramFromFile("../assets/shaders/cubemapVis"), [
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
  swat = await renderer.loadGLTF("../assets/models/running/skinWithGun.glb");
  swat.transform.scale = Vector.fill(1.17);
  // swat.transform.scale = Vector.fill(0.067);
  // swat.animationController.loop = true;

  var idle = await renderer.loadGLTF("../assets/models/running/rifleIdle.glb");
  idle.animationController.animations[0].transfer(idle, swat);

  var crouchIdle = await renderer.loadGLTF("../assets/models/running/crouchIdle.glb");
  crouchIdle.animationController.animations[0].transfer(crouchIdle, swat);

  var forward = await renderer.loadGLTF("../assets/models/running/forward.glb");
  forward.animationController.animations[0].transfer(forward, swat);

  var left = await renderer.loadGLTF("../assets/models/running/left.glb");
  left.animationController.animations[0].transfer(left, swat);

  var right = await renderer.loadGLTF("../assets/models/running/right.glb");
  right.animationController.animations[0].transfer(right, swat);

  var ac = swat.animationController = new AnimationController();
  ac.speed = 1.5;
  ac.animations = [
    idle.animationController.animations[0],
    forward.animationController.animations[0],
    left.animationController.animations[0],
    right.animationController.animations[0],
    crouchIdle.animationController.animations[0],
  ];
  ac.loop = true;
  ac.weightsHandler = new AnimationBlend([
    {
      animation: ac.animations[0],
      coords: new Vector(0, 0, 0)
    },
    {
      animation: ac.animations[4],
      coords: new Vector(0, 0, -1)
    },
    {
      animation: ac.animations[2],
      coords: new Vector(1, 0, 0)
    },
    {
      animation: ac.animations[3],
      coords: new Vector(-1, 0, 0)
    },
    {
      animation: ac.animations[1],
      coords: new Vector(0, 1, 0)
    }
  ]);

  // var dancingMonster = scene.add(await renderer.loadGLTF("../assets/models/dancingMonster.glb"));
  // dancingMonster.animationController.loop = true;
  // Matrix.transform([
  //   ["translate", {x: 0, y: 0, z: 5}]
  // ], dancingMonster.transform.matrix);

  // var c = scene.add(dancingMonster.copy());
  // c.animationController.speed = 0.5;
  // Matrix.transform([
  //   ["translate", {x: 3, y: 0, z: 0}],
  //   ["scale", Vector.fill(1.5)]
  // ], c.transform.matrix);

  //colliders.push(new AABBCollider({x: -50, y: 0, z: -50}, {x: 50, y: 50, z: 50}, Matrix.identity(), true))

  // // Reflection probe
  // var oldSkybox = scene.skyboxCubemap;
  // var cubemap = renderer.captureReflectionCubemap(new Vector(0, 6, 0));
  // await scene.loadEnvironment({ cubemap });
  // // scene.skyboxCubemap = oldSkybox;
  // scene.environmentIntensity = 1;

  await setupWeapons();

  /*
    Player setup
  */
  // {x: 10, y: 3, z: 10}
  player = new Player();
  player.state = player.STATES.IN_LOBBY;
  player.physicsEngine = physicsEngine;
  player.setWeapons(classes[selectedClass].weapons);

  setupWebsocket();

  SetupEvents();

  if (!disconnected) {
    hideElement(loadingDiv);
    showElement(lobbyUI);

    running = true;

    window.renderer = renderer;
    window.scene = scene;
    window.physicsEngine = physicsEngine;
    window.mainCamera = mainCamera;
    window.bulletHoles = bulletHoles;
    window.sparks = sparks;
    window.defaultFov = defaultFov;

    scene.updateLights();

    scene.root.traverse(function(gameObject) {
      if (gameObject.meshRenderer && gameObject.meshRenderer.skin) {
        gameObject.meshRenderer.skin.updateMatrixTexture();
      }
    });

    renderer.on("renderloop", renderloop);
  }
  else {
    loadingStatus.innerText = "Connection lost";
  }

  console.timeEnd("setup");

  function renderloop(frameTime, timeSinceStart) {
    time = timeSinceStart;
    counters = {};

    fpsHistory.push(1 / frameTime);
    if (fpsHistory.length > 20) {
      fpsHistory.shift();
    } 

    // Lag
    if (renderer.getKey(81)) {
      var x = 0;
      for (var i = 0; i < 3e7; i++) {
        x += i * i;
      }
    }

    // glDebugger.clear();
  
    // var x = gamepadManager.getAxis("RSHorizontal");
    // var y = gamepadManager.getAxis("RSVertical");
    // x = (Math.abs(x) > 0.08 ? x : 0);
    // y = (Math.abs(y) > 0.08 ? y : 0);
  
    // var currentWeapon = player.getCurrentWeapon();
    // var weaponSens = currentWeapon ? currentWeapon.getCurrentSensitivity() : 1;
    // player.rotation.x += Math.abs(y) * y * 0.07 * weaponSens;
    // player.rotation.y += Math.abs(x) * x * 0.07 * weaponSens;

    // rightArm.endObject.transform.position.y = startY + Math.sin(timeSinceStart) * 4;
    // soldier.transform.position.x = Math.sin(timeSinceStart) * 4;
    // soldier.transform.rotation = Quaternion.euler(0, timeSinceStart, 0);

    // if (enemies[1].gameObject) enemies[1].gameObject.transform.position.z = 6;
    // if (enemies[2].gameObject) enemies[2].gameObject.transform.position.z = -6;
    // if (enemies[0].gameObject) enemies[0].gameObject.transform.position.z = Math.sin(timeSinceStart * 2.5) * 3;
  
    if (renderer.activeScene() == scene) {
      physicsEngine.update();
    }

    for (var key in multiplayerCharacters) {
      multiplayerCharacters[key].update(physicsEngine.dt);
    }

    // player.update(frameTime);
    // flyCamera(renderer, mainCamera, player.rotation, physicsEngine.dt);
    // mainCamera.transform.rotation = Quaternion.eulerVector(player.rotation);
    // player.position = Vector.add(Vector.compMultiply(mainCamera.transform.position, {x: 1, y: 1, z: 1}), {x: 0, y: -(player.height - 0.1), z: 0});

    // scene.update(frameTime);
    captureZoneManager.update(frameTime);
    updateBulletTrails(physicsEngine.dt);
    killfeed.update(frameTime);
    crosshair.spacing = 4;// clamp(Vector.length(player.velocity) * 10, 25, 80);
  
    if (player.getCurrentWeapon()?.weaponObject?.getChild("MuzzleOffset", true)) {
      var m = Matrix.copy(player.getCurrentWeapon().weaponObject.getChild("MuzzleOffset", true).transform.worldMatrix);
      muzzleFlashObject.transform.matrix = m;

      // if (player.getCurrentWeapon()?.weaponObject?.getChild("LeftHandOffset", true)) {
      //   leftArm.endObject.transform.worldMatrix = Matrix.translate(Matrix.getPosition(player.getCurrentWeapon().weaponObject.getChild("LeftHandOffset", true).transform.worldMatrix));
      //   rightArm.endObject.transform.worldMatrix = Matrix.translate(Matrix.getPosition(player.getCurrentWeapon().weaponObject.getChild("RightHandOffset", true).transform.worldMatrix));
      // }
    }

    if (window.muzzleFlashEnabled) {
      muzzleFlash.emit(1);
    }

    renderer.update(frameTime);
    // scene.update(frameTime);
    // menuScene.update(frameTime);

    if (player.state == player.STATES.PLAYING) {
      renderer.render(mainCamera, [weaponCamera]);
    }
    else if (player.state == player.STATES.DEAD) {
      renderer.render(mainCamera);
    }
    else if (player.state == player.STATES.IN_LOBBY) {
      renderer.render(lobbyWeaponCamera.camera, null, { shadows: false });
    }
    // renderer.render(orbitCamera.camera);
    renderUI(frameTime);
  
    // stats.update();
  }
}

function renderUI(dt) {
  ui.clearScreen();

  if (player.state != player.STATES.IN_LOBBY) {
    if (player.closestZone) {
      captureZoneManager.renderZoneUI(player.closestZone);
    }

    var currentWeapon = player.getCurrentWeapon();
    if (currentWeapon) {
      if (currentWeapon.mode != WEAPONENUMS.GUNMODES.ADS) {
        crosshair.render();
      }

      if (currentWeapon.mode == WEAPONENUMS.GUNMODES.ADS && currentWeapon.scope.sniperScope) {
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

      if (currentWeapon.roundsInMag <= 0) {
        ammoCounter.querySelector(".current").classList.add("emptyMag");
      }
      else {
        ammoCounter.querySelector(".current").classList.remove("emptyMag");
      }

      currentAmmoSpan.textContent = currentWeapon.roundsInMag;
      maxAmmoSpan.textContent = currentWeapon.magSize;

      // ammoCounter.innerText = `${currentWeapon.roundsInMag} / ${currentWeapon.magSize}`;

      // ui.text(`${currentWeapon.roundsInMag} / ${currentWeapon.magSize}`, 10, ui.height - 10, 60, "white", "black", 1);
    }

    for (var i = 0; i < player.weapons.length; i++) {
      if (i == player.currentWeapon) {
        ui.rectangle(ui.width - 140, ui.height - 100 - (player.weapons.length - 1 - i) * 50, 120, 40, "rgba(0, 0, 0, 0.5)");
      }

      ui.clippedPicture(`../assets/textures/weaponIcons/${player.weapons[i].name}.png`, 0, 320 / 2 - 320 * 40 / 120 / 2, 320, 320 * 40 / 120, ui.width - 140, ui.height - 100 - (player.weapons.length - 1 - i) * 50, 120, 40);
    }

    hitmarker.render();
    killfeed.render();
  }

  // Stats
  ui.setFont("monospace");

  var averageFPS = Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length);
  var minFPS = 100 - Math.round(Math.min(...fpsHistory) / averageFPS * 100);
  var maxFPS = Math.round(Math.max(...fpsHistory) / averageFPS * 100) - 100;
  ui.text(averageFPS + " FPS", 5, 20, 15, "lime");
  ui.text("-" + minFPS + "%", 75, 20, 15, "lime");
  ui.text("+" + maxFPS + "%", 115, 20, 15, "lime");

  var averageLatency = Math.round(latencies.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) / latencies.length);
  var color = (averageLatency < 100 ? "lime" : averageLatency < 150 ? "yellow" : "red");
  ui.text(averageLatency + "ms", 5, 40, 15, color);

  ui.setFont("Arial");
}

function Crosshair() {
  this.lineLength = 10;
  this.spacing = 20;
  this.thickness = 2;
  this.color = "white";
  this.backgroundColor = "rgba(0, 0, 0, 0.3)";
  this.type = 0;
  
  this.render = function() {
    if (this.type === 0) {
      this.drawCrosshair(this.backgroundColor, this.thickness);
      this.drawCrosshair(this.color, this.thickness * 0.5);
    }
    else if (this.type == 1) {
      this.shotgunCrosshair(this.backgroundColor, this.thickness);
      this.shotgunCrosshair(this.color, this.thickness - 0.5);
    }
  }

  this.drawCrosshair = function(color, thickness) {
    var x = Math.round(ui.width / 2) + 0.5;
    var y = Math.round(ui.height / 2) + 0.5;

    ui.line(x, y - this.spacing - this.lineLength, x, y - this.spacing, color, thickness);
    ui.line(x, y + this.spacing + this.lineLength, x, y + this.spacing, color, thickness);
    ui.line(x - this.spacing - this.lineLength, y, x - this.spacing, y, color, thickness);
    ui.line(x + this.spacing + this.lineLength, y, x + this.spacing, y, color, thickness);
    
    // ui.rectangle(Math.round(ui.width / 2) - thickness, Math.round(ui.height / 2) - thickness, thickness * 2, thickness * 2, color);
    ui.circle(x - 0.5, y - 0.5, thickness, color);
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
  this.size = 8;
  this.spacing = 5;
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

function Enemy(gameObject, name = "Enemy") {
  function Collider(bl, tr, gameObject, type) {
    this.type = type ?? Collider.TYPES.BODY;
    this.gameObject = gameObject;
    this.matrix = Matrix.identity();
    this.aabb = new AABB(bl, tr);
  }
  Collider.TYPES = { BODY: 0, HEAD: 1, ARM: 2, LEG: 3 };

  this.gameObject = gameObject;
  this.colliders = [];

  if (this.gameObject) {
    var goColliders = this.gameObject.getChildren("Collider", true, false);
    if (goColliders.length > 0) {
      for (var g of goColliders) {
        var mr = g.meshRenderer;
        if (mr) {
          var aabb = new AABB();

          var md = mr.meshData[0];
          var buffer = md.data.position.bufferData;
          for (var i = 0; i < buffer.length; i += md.data.position.size) {
            var v = new Vector(buffer[i], buffer[i + 1], buffer[i + 2]);
            aabb.extend(v);
          }

          this.colliders.push(new Collider(aabb.bl, aabb.tr, g, g.name.indexOf("Head") !== -1 ? Collider.TYPES.HEAD : Collider.TYPES.BODY));
        }

        g.visible = false;
      }
    }
    else {
      this.colliders = [
        new Collider(new Vector(-0.5, 0, -0.05), new Vector(0.5, 1.4, 0.05), null, Collider.TYPES.BODY),
        new Collider(new Vector(-0.25, 1.4, -0.05), new Vector(0.25, 2, 0.05), null, Collider.TYPES.HEAD)
      ];
    }
  }

  this.dead = false;
  this.maxHealth = 100;
  this.health = this.maxHealth;
  this.headshotMultiplier = 1.75;
  this.name = name;

  this.onDeath = () => {};

  var createBillboard = () => {
    if (this.gameObject) {
      var meshData = renderer.getParticleMeshData();
      var material = renderer.CreateLitMaterial({
        opaque: false,
        albedoTexture: createTextTexture(this.name, 256)
      }, renderer.programContainers.litBillboard);

      material.doubleSided = true;
      var meshRenderer = new renderer.MeshRenderer(material, meshData);
      // meshRenderer.addInstance(Matrix.identity());

      var billboard = new GameObject("Billboard");
      billboard.meshRenderer = meshRenderer;
      this.gameObject.addChild(billboard);
      billboard.transform.position.y = 2.4//35;
    }
  }

  createBillboard();

  this.fireBullet = function(weapon, origin, direction, maxDistance = Infinity) {
    if (!this.dead) {
      for (var collider of this.colliders) {
        var m = Matrix.copy(this.gameObject.transform.worldMatrix);
        var colliderMatrix = collider.gameObject ? collider.gameObject.transform.getWorldMatrix(this.gameObject) : collider.matrix;
        Matrix.multiply(m, colliderMatrix, m);
        var minv = Matrix.inverse(m);

        var newOrigin = Matrix.transformVector(minv, origin);
        var newDirection = Vector.normalize(Matrix.transformDirection(minv, direction));

        var intersection = rayToAABB(newOrigin, newDirection, collider.aabb);

        if (intersection) {
          var localHitPoint = Vector.add(newOrigin, Vector.multiply(newDirection, intersection.min));
          var worldDist = Vector.distance(origin, Matrix.transformVector(m, localHitPoint));

          if (worldDist < maxDistance) {
            if (collider.type == Collider.TYPES.BODY) {
              this.takeDamage(weapon.bulletDamage);
            }
            else if (collider.type == Collider.TYPES.HEAD) {
              this.takeDamage(weapon.bulletDamage * weapon.bulletDamageHeadMultiplier);
            }

            return collider;
          }
        }
      }
    }
  }

  this.takeDamage = function(amount) {
    if (!this.dead) {
      this.health -= amount;
      this.health = Math.max(0, this.health);

      if (this.health <= 0) {
        this.die();
      }
    }
  }

  this.die = function() {
    this.dead = true;
    this.gameObject.visible = false;

    player.enemyKilled(this);
    this.onDeath();
  }

  this.respawn = function(position) {
    this.dead = false;
    this.health = this.maxHealth;
    this.gameObject.visible = true;

    if (position) {
      this.gameObject.transform.position = position;
    }
  }
}

function deploy() {
  lobbyUI.querySelector(".navigation").classList.add("slideOut");

  setTimeout(function() {
    if (!wsIsOpen(ws)) {
      player.state = player.STATES.PLAYING;
      return;
    }

    sendMessage("deploy");
  }, 500);
}

class Player extends PlayerPhysicsBase {
  constructor(pos = Vector.zero()) {
    super(pos);

    this.id = null;
    this.name = null;

    this.visualHeight = this.standHeight;

    this.weapons = [];
    this.currentWeapon = 0;

    this.handRotation = this.rotation;

    this.handOffset = {x: 0.3, y: -0.25, z: -0.5};
    this.handRotOffset = {x: 0, y: 0.1 * 0, z: 0};

    // Head bobbing
    this.headBobStrength = 0.06;
    this.headBobSpeed = 0.25;
    this.walkTime = 0;

    this.killedBy = null;
    this.killcamDir = null;

    this.killTimer = 0;
    this.streakNames = ["", "Doublekill", "Triplekill", "Quadkill", "Megakill"];

    this.leaderboardEntry = null;

    var _health = this.health;
    Object.defineProperty(this, "health", {
      get: function() {
        return _health;
      },
      set: function(val) {
        _health = val;
        setHealth(_health / this.maxHealth);
      }
    });

    var _state = this.state;
    Object.defineProperty(this, "state", {
      get: () => {
        return _state;
      },
      set: (val) => {
        _state = val;

        if (this.state == this.STATES.IN_LOBBY) {
          showElement(lobbyUI);
          lobbyUI.querySelector("#deploy").classList.remove("flashButton");
          lobbyUI.querySelector(".navigation").classList.remove("slideOut");

          hideElement(gameUI);
          hideElement(deathScreen);

          renderer.currentScene = 1;
          // scene.skyboxVisible = false;

          var t = this.getCurrentWeapon()?.weaponObject?.transform;
          if (t) {
            t.position = Vector.zero();
            t.rotation = Quaternion.identity();
          }
        }
        else if (this.state == this.STATES.PLAYING) {
          showElement(gameUI);
          hideElement(lobbyUI);
          // hideElement(loadoutUI);

          renderer.currentScene = 0;
          // scene.skyboxVisible = true;

          ApplySettings();
        }
        else if (this.state == this.STATES.DEAD) {
          showElement(gameUI);
          showElement(deathScreen);
          hideElement(lobbyUI);

          scene.skyboxVisible = true;
        }
      }
    });

    Object.defineProperty(this, "isPlaying", {
      get: () => {
        return this.state == this.STATES.PLAYING;
      }
    });
  }

  loginResponse(data) {
    this.id = data.id;
    this.name = data.name;

    this.leaderboardEntry = leaderboard.addPlayer();
    leaderboard.setItem(this.leaderboardEntry, ".name", this.name);
  }

  die() {
    this.state = this.STATES.DEAD;
    this.health = 0;

    this.killcamDir = Matrix.getForward(Matrix.fromQuaternion(Quaternion.eulerVector(Vector.negate(this.getHeadRotation()))));

    deathScreen.querySelector(".player").innerText = getPlayerNameByID(this.killedBy);

    // setTimeout(() => {
    //   this.respawn();
    // }, 3000);
  }

  gotoLobby() {
    this.state = this.STATES.IN_LOBBY;
    this.health = this.maxHealth;
  }

  enemyKilled(enemy) {
    this.killStreak++;
    this.killTimer = 3;
    this.kills++;
    showKillAlert(enemy.name, this.streakNames[Math.min(this.streakNames.length - 1, this.killStreak - 1)]);

    // if (leaderboardEntry) leaderboard.setItem(leaderboardEntry, ".kills", this.kills);
    killsSpans[0].innerText = this.kills + " kills";
    killsSpans[1].innerText = this.kills + " kills";
  }

  setWeapons(weapons) {
    for (var weapon of this.weapons) {
      if (weapon.weaponObject) {
        weapon.weaponObject.visible = false;
      }
    }

    this.weapons = weapons;

    for (var weapon of this.weapons) {
      weapon.onFire = (data) => {
        sendMessage("playerAction", {
          action: "fireWeapon",
          origin: data.origin,
          direction: data.direction,
          trailHealth: data.trailHealth
        });
      }
    }

    if (this.getCurrentWeapon()) {
      this.getCurrentWeapon().weaponObject.visible = true;
    }
  }

  getCurrentWeapon() {
    return this.weapons[this.currentWeapon];
  }

  switchWeapon(index) {
    if (!this.isPlaying) {
      return;
    }

    if (index >= 0 && index < this.weapons.length) {
      if (index != this.currentWeapon) {
        var oldWeapon = this.weapons[this.currentWeapon];

        window.muzzleFlashEnabled = false;

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

  getHeadPos() {
    return Vector.add(this.position, {x: 0, y: this.standHeight / 2 + this.visualHeight / 2 - 0.1 + Math.sin(this.walkTime) * this.headBobStrength, z: 0});
  }

  Fire() {
    if (this.isPlaying && this.getCurrentWeapon()) {
      this.weapons[this.currentWeapon].fire();
    }
  }

  update(dt) {
    if (this.state == this.STATES.IN_LOBBY) {
      // this.getCurrentWeapon().weaponObject.transform.rotation = Quaternion.euler(0, physicsEngine.time, 0);
      // weaponCamera.transform.position = new Vector(0, 0, -2);
      // weaponCamera.transform.rotation = Quaternion.euler(0, Math.PI, 0);

      // var a = physicsEngine.time * 0.1 + Math.PI;
      // var r = 40;
      // mainCamera.setFOV(30);
      // mainCamera.transform.matrix = Matrix.lookAt(new Vector(Math.cos(a) * r, 20, Math.sin(a) * r), Vector.zero());
    }
    else if (this.state == this.STATES.DEAD) {
      // mainCamera.setFOV(20);
      var m = multiplayerCharacters[this.killedBy];
      if (m && m.gameObject) {
        var m = Matrix.lookAt(this.getHeadPos(), Vector.add(m.gameObject.transform.position, new Vector(0, 1.8, 0)), Vector.up());
        this.killcamDir = Vector.slerp(this.killcamDir, Matrix.getForward(m), 0.1);
        mainCamera.transform.matrix = Matrix.lookAt(this.getHeadPos(), Vector.add(this.getHeadPos(), this.killcamDir));
      }
    }
    else if (this.state == this.STATES.PLAYING) {
      this.visualHeight += (this.height - this.visualHeight) * 0.4;

      if (this.getCurrentWeapon()) {
        this.getCurrentWeapon().update(dt);
      }

      this.clampRotation();

      mainCamera.setFOV(currentFov);
      weaponCamera.setFOV(currentWeaponFov);

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

      this.killTimer -= dt;
      if (this.killTimer <= 0) {
        this.killStreak = 0;
      }
    }
  }

  fixedUpdate(dt) {
    if (this.state == this.STATES.PLAYING) {
      var inputs = {
        forward: renderer.getKey(87),
        back: renderer.getKey(83),
        left: renderer.getKey(65),
        right: renderer.getKey(68),
        jump: renderer.getKey(32),
        crouching: renderer.getKey(16)
      };

      this.handRotOffset = Vector.lerp(
        this.handRotOffset,
        new Vector(
          clamp(mouse.movementY * 0.005, -0.2, 0.2),
          clamp(mouse.movementX * 0.005, -0.2, 0.2),
          0
        ),
        0.05
      );
      mouse.movementX *= 0.3;
      mouse.movementY *= 0.3;

      if (this.getCurrentWeapon()) {
        this.getCurrentWeapon().fixedUpdate(dt);
      }

      this.handRotation = this.getHeadRotation();
      // this.handRotation = Vector.lerp(this.handRotation, this.getHeadRotation(), 0.7);

      var oldPosition = Vector.copy(this.position);

      this.applyInputs(inputs, dt);
      this.simulatePhysicsStep(dt);

      // if (this.getCurrentWeapon()) {
      //   this.getCurrentWeapon().fixedUpdate(dt);
      // }

      if (this.grounded && (inputs.forward || inputs.back || inputs.left || inputs.right)) {
        var deltaPosition = Vector.distance(oldPosition, this.position);
        deltaPosition = clamp(deltaPosition / dt, 0, 1);

        var currentAcceleration = this.runningAcceleration;
        currentAcceleration *= (this.grounded ? this.crouching ? 0.5 : 1 : 0.1);
        if (this.getCurrentWeapon()) {
          currentAcceleration *= this.getCurrentWeapon().getSpeed();
        }

        this.walkTime += deltaPosition * currentAcceleration * this.headBobSpeed * dt;
      }
      else {
        this.walkTime += (roundNearest(this.walkTime, Math.PI) - this.walkTime) * 0.1;
      }

      var _adsFov = this.getCurrentWeapon().ADSSpeed;
      currentFov += (targetFov - currentFov) * _adsFov;
      currentWeaponFov += (targetWeaponFov - currentWeaponFov) * _adsFov;

      /*
        Send to server
      */

      var yRotation = this.rotation.y;

      inputBuffer[tick] = {
        localTime: new Date().getTime(),
        tick,
        inputs,
        yRotation
      };
      stateBuffer[tick] = {
        position: this.position,
        velocity: this.velocity
      };

      inputsToSend.push({...inputBuffer[tick]});
      // sendMessage("inputs", inputBuffer[tick]);

      tick++;
    }
  }

  clampRotation() {
    var w = this.getCurrentWeapon();
    var ro = w ? w.recoilOffset : 0;
    this.rotation.x = clamp(this.rotation.x, -Math.PI / 2 - ro.x, Math.PI / 2 - ro.x);
  }
}

// function PlayerOld(pos = Vector.zero()) {
//   this.id = null;
//   this.name = null;

//   this.rotation = Vector.zero();
//   this.position = pos;
//   this.startPosition = pos;
//   this.velocity = Vector.zero();

//   this.crouching = false;
//   this.standHeight = 2;
//   this.crouchHeight = 1.1;
//   var targetHeight = this.standHeight;
//   var visualHeight = this.standHeight;
//   this.height = targetHeight;
//   this.colliderRadius = 0.5;

//   this.walkSpeed = 5;

//   this.walkAcceleration = 150 * 0.3;
//   this.runningAcceleration = 225 * 0.3;
//   this.friction = 10;

//   this.coyoteTime = 0.11;
//   this.jumpBuffering = 0.08;
//   this.groundCounter = 0;
//   this.jumpCounter = 0;

//   this.collisionIterations = 3;
//   this.grounded = false;
//   this.fakeGroundNormal = Vector.zero();
//   this.realGroundNormal = Vector.zero();

//   this.weapons = [];
//   this.currentWeapon = 0;

//   this.handRotation = this.rotation;

//   this.handOffset = {x: 0.3, y: -0.25, z: -0.5};
//   this.handRotOffset = {x: 0, y: 0.1 * 0, z: 0};

//   // Head bobbing
//   this.headBobStrength = 0.06;
//   this.headBobSpeed = 0.25;
//   this.walkTime = 0;

//   // Health
//   this.maxHealth = 100;
//   var _health = this.maxHealth;
//   Object.defineProperty(this, "health", {
//     get: function() {
//       return _health;
//     },
//     set: function(val) {
//       _health = val;
//       setHealth(_health / this.maxHealth);
//     }
//   });

//   Object.defineProperty(this, "dead", {
//     get: function() {
//       return _health <= 0;
//     }
//   });

//   this.killedBy = null;
//   var killcamDir = null;

//   // Kills
//   this.kills = 0;
//   this.deaths = 0;

//   this.killStreak = 0;
//   this.killTimer = 0;
//   this.streakNames = ["", "Doublekill", "Triplekill", "Quadkill", "Megakill"];

//   var leaderboardEntry = null;

//   // this.getHandMatrix = function(t = 0) {
//   //   var rot = this.getHeadRotation();
//   //   var ops = [
//   //     ["translate", Vector.add(this.position, new Vector(0, this.height - 0.1, 0))],
//   //     ["rz", -rot.z],
//   //     ["ry", -rot.y],
//   //     ["rx", -rot.x],
//   //     // ["translate", Vector.multiply(this.getCurrentWeapon().weaponObject.children[0].getChild("ADSOffset").position, -1 / 10)],
//   //     // ["translate", {x: 0, y: 0, z: -0.1}]
//   //     ["translate", Vector.multiply(this.handOffset, t)],
//   //     ["rz", this.handRotOffset.z * t],
//   //     ["ry", this.handRotOffset.y * t],
//   //     ["rx", this.handRotOffset.x * t],
//   //     // ["translate", adsTranslate]
//   //   ];

//   //   // ops.push(["translate", Vector.multiply({x: 0.11, y: -0.1, z: -0.2}, t)]);

//   //   // ops = ops.concat([
//   //   //   ["rz", -(this.handRotation.z - rot.z) * t],
//   //   //   ["ry", -(this.handRotation.y - rot.y) * t],
//   //   //   ["rx", -(this.handRotation.x - rot.x) * t]
//   //   // ]);

//   //   var m = Matrix.transform(ops);

//   //   var adsObject = this.getCurrentWeapon().weaponObject.getChild("ADSOffset", true);
//   //   if (adsObject && t < 0.5) {
//   //     // var weaponMatrix = this.getCurrentWeapon().weaponObject.getWorldMatrix();
//   //     // var adsPos = Matrix.getPosition(adsObject.getWorldMatrix());
//   //     // var localADSOffset = Matrix.transformVector(Matrix.inverse(weaponMatrix), adsPos);

//   //     // m = Matrix.transform([["translate", new Vector(0, 0, -0.15)]], m);
//   //     var localADSOffset = Matrix.inverse(adsObject.transform.getWorldMatrix(this.getCurrentWeapon().weaponObject));
//   //     localADSOffset[12] *= 0.1;
//   //     localADSOffset[13] *= 0.1;
//   //     localADSOffset[14] *= 0.1;
//   //     Matrix.setRotation(localADSOffset, Matrix.identity());
//   //     m = Matrix.multiply(m, localADSOffset);

//   //     // adsTranslate = Vector.add(Vector.multiply(localADSOffset, -0.1), new Vector(0, 0, -0.15));
//   //     // adsTranslate = Vector.multiply(adsTranslate, 1 - t);
//   //   }

//   //   return m;
//   // }

//   this.loginResponse = function(data) {
//     this.id = data.id;
//     this.name = data.name;

//     leaderboardEntry = leaderboard.addPlayer();
//     leaderboard.setItem(leaderboardEntry, ".name", this.name);
//   }

//   this.die = function() {
//     this.health = 0;
//     killcamDir = Matrix.getForward(Matrix.fromQuaternion(Quaternion.eulerVector(Vector.negate(this.getHeadRotation()))));

//     deathScreen.querySelector(".player").innerText = getPlayerNameByID(this.killedBy);
//     showElement(deathScreen);

//     setTimeout(() => {
//       this.health = this.maxHealth;
//       hideElement(deathScreen);
//     }, 3000);
//   }

//   this.enemyKilled = function(enemy) {
//     this.killStreak++;
//     this.killTimer = 3;
//     this.kills++;
//     showKillAlert(enemy.name, this.streakNames[Math.min(this.streakNames.length - 1, this.killStreak - 1)]);

//     // if (leaderboardEntry) leaderboard.setItem(leaderboardEntry, ".kills", this.kills);
//     killsSpans[0].innerText = this.kills + " kills";
//     killsSpans[1].innerText = this.kills + " kills";
//   }

//   this.setWeapons = function(weapons) {
//     this.weapons = weapons;

//     for (var weapon of this.weapons) {
//       weapon.onFire = (data) => {
//         sendMessage("playerAction", {
//           action: "fireWeapon",
//           origin: data.origin,
//           direction: data.direction,
//           trailHealth: data.trailHealth
//         });
//       }
//     }

//     if (this.getCurrentWeapon()) {
//       this.getCurrentWeapon().weaponObject.visible = true;
//     }
//   }

//   this.getCurrentWeapon = function() {
//     return this.weapons[this.currentWeapon];
//   }

//   this.switchWeapon = function(index) {
//     if (this.dead) {
//       return;
//     }

//     if (index >= 0 && index < this.weapons.length) {
//       if (index != this.currentWeapon) {
//         var oldWeapon = this.weapons[this.currentWeapon];

//         clearTimeout(oldWeapon.fireTimeout);
//         oldWeapon.isFiring = false;
//         oldWeapon.cancelReload();
//         oldWeapon.mode = oldWeapon.GunModes.DEFAULT;
//         targetFov = defaultFov;

//         this.rotation = Vector.add(this.rotation, oldWeapon.recoilOffset);
//         oldWeapon.recoilOffset = Vector.zero();
//         oldWeapon.recoilOffsetTarget = Vector.zero();

//         if (oldWeapon.weaponObject) {
//           oldWeapon.weaponObject.visible = false;
//         }
        
//         var newWeapon = this.weapons[index];
//         newWeapon.reloadAnimationTime = 1;
//         newWeapon.fireAnimationTime = 1;
//         if (newWeapon.weaponObject) {
//           newWeapon.weaponObject.visible = true;
//         }
//         crosshair.type = newWeapon.crosshairType;
//       }
    
//       this.currentWeapon = index;
//     }
//   }

//   this.getHeadPos = function() {
//     return Vector.add(this.position, {x: 0, y: this.standHeight / 2 + visualHeight / 2 - 0.1 + Math.sin(this.walkTime) * this.headBobStrength, z: 0});
//   }

//   this.getHeadRotation = function() {
//     if (this.getCurrentWeapon()) {
//       return Vector.add(this.rotation, this.getCurrentWeapon().recoilOffset);
//     }
    
//     return this.rotation;
//   }

//   this.Fire = function() {
//     if (!this.dead && this.getCurrentWeapon()) {
//       this.weapons[this.currentWeapon].fire();
//     }
//   }

//   this.update = function(dt) {
//     if (this.dead) {
//       // mainCamera.setFOV(20);
//       var m = multiplayerCharacters[this.killedBy];
//       if (m && m.gameObject) {
//         var m = Matrix.lookAt(this.getHeadPos(), m.gameObject.transform.position, Vector.up());
//         killcamDir = Vector.slerp(killcamDir, Matrix.getForward(m), 0.1);
//         mainCamera.transform.matrix = Matrix.lookAt(this.getHeadPos(), Vector.add(this.getHeadPos(), killcamDir));
//       }
//     }
//     else {
//       targetHeight = this.crouching ? this.crouchHeight : this.standHeight;
//       this.height = targetHeight;
//       // this.height += (targetHeight - this.height) * 0.6;
//       visualHeight += (this.height - visualHeight) * 0.4;

//       if (renderer.getKeyDown(16) && this.grounded) {
//         this.position.y -= 0.5;
//       }

//       if (this.getCurrentWeapon()) {
//         this.getCurrentWeapon().update(dt);
//       }

//       this.clampRotation();

//       mainCamera.setFOV(currentFov);
//       weaponCamera.setFOV(currentWeaponFov);

//       mainCamera.transform.rotation = Quaternion.eulerVector(Vector.negate(this.getHeadRotation()));
//       mainCamera.transform.position = this.getHeadPos();//Vector.add(this.position, {x: 0, y: this.height - 0.1, z: 0});
//       // mainCamera.transform.position = Vector.add(Vector.compMultiply(this.position, {x: 1, y: 1, z: -1}), {x: 0, y: 1.6, z: 0});

//       weaponCamera.transform.position = mainCamera.transform.position;
//       weaponCamera.transform.rotation = mainCamera.transform.rotation;

//       // var rot = this.getHeadRotation();
//       // var m = Matrix.transform([
//       //   ["translate", this.getHeadPos()],
//       //   ["rz", -rot.z],
//       //   ["ry", -rot.y],
//       //   ["rx", -rot.x]
//       // ]);
//       // audioListener.setDirection(Matrix.getForward(m), Vector.up());
//       // audioListener.setPosition(this.position);

//       this.killTimer -= dt;
//       if (this.killTimer <= 0) {
//         this.killStreak = 0;
//       }
//     }
//   }

//   // bruh 200kb memory
//   this.fixedUpdate = function(dt) {
//     if (!this.dead) {
//       var inputs = {
//         forward: renderer.getKey(87),
//         back: renderer.getKey(83),
//         left: renderer.getKey(65),
//         right: renderer.getKey(68),
//         jump: renderer.getKey(32),
//         crouching: renderer.getKey(16)
//       };

//       // this.handRotation.x += Math.sign(this.handRotation.x - this.getHeadRotation().x) * 0.01;
//       // this.handRotation.y += Math.sign(this.handRotation.y - this.getHeadRotation().y) * 0.01;
//       // this.handRotation = Vector.lerp(this.handRotation, this.getHeadRotation(), 0.8);
//       // this.handRotation = Vector.add(this.handRotation, Vector.multiply(Vector.subtract(this.getHeadRotation(), this.handRotation), 0.9));
//       this.handRotation = this.getHeadRotation();

//       Player.applyInputs(this, inputs, dt);
//       this.simulatePhysicsStep(dt);

//       if (this.getCurrentWeapon()) {
//         this.getCurrentWeapon().fixedUpdate(dt);
//       }

//       /*
//         Send to server
//       */

//       var yRotation = this.rotation.y;

//       inputBuffer[tick] = {
//         tick,
//         inputs,
//         yRotation
//       };
//       stateBuffer[tick] = {
//         position: this.position,
//         velocity: this.velocity
//       };

//       sendMessage("inputs", inputBuffer[tick]);

//       tick++;
//     }
//   }

//   this.simulatePhysicsStep = function(dt) {
//     // Gravity
//     this.velocity.y -= 18 * dt;

//     // Jumping
//     if (this.grounded) {
//       player.groundCounter = this.coyoteTime;
//     }

//     player.groundCounter -= dt;
//     player.jumpCounter -= dt;

//     // Ground friction/drag
//     if (this.grounded) {
//       var projectedVelocity = Vector.projectOnPlane(this.velocity, this.fakeGroundNormal);//{x: this.velocity.x, y: 0, z: this.velocity.z};
//       var speed = Vector.length(projectedVelocity);
//       this.velocity = Vector.add(this.velocity, Vector.multiply(Vector.normalize(projectedVelocity), -speed * dt * this.friction));

//       // Sliding / turning
//       if (this.crouching && speed > 10) {
//         var v = Vector.rotateAround({
//           x: Vector.length(Vector.projectOnPlane(this.velocity, this.fakeGroundNormal)),
//           y: 0,
//           z: 0
//         }, this.fakeGroundNormal, -this.rotation.y + Math.PI / 2);
        
//         this.velocity.x = v.x;
//         this.velocity.z = v.z;
//       }
//     }

//     this.position = Vector.add(this.position, Vector.multiply(this.velocity, dt));

//     Player.solveCollisions(this);

//     // // Extend grounded collision
//     // if (!this.grounded) {
//     //   var hit = physicsEngine.Raycast(this.position, Vector.down());
//     //   if (hit && hit.firstHit && hit.firstHit.distance < this.height / 2 + 0.01) {
//     //     this.grounded = true;
//     //     this.realGroundNormal = hit.firstHit.normal;

//     //     // bruh copy code
//     //     var dp = Vector.dot(Vector.up(), this.realGroundNormal);
//     //     var normal = dp > 0.8 ? Vector.up() : this.realGroundNormal;
//     //     this.fakeGroundNormal = normal;
//     //   }
//     // }

//     // Reset when out-of-bounds
//     if (this.position.y < -30) {
//       this.position = this.startPosition;
//       this.velocity = Vector.zero();
//     }

//     currentFov += (targetFov - currentFov) / 3;
//     currentWeaponFov += (targetWeaponFov - currentWeaponFov) / 3;
//   }

//   this.clampRotation = function() {
//     var w = this.getCurrentWeapon();
//     var ro = w ? w.recoilOffset : 0;
//     this.rotation.x = clamp(this.rotation.x, -Math.PI / 2 - ro.x, Math.PI / 2 - ro.x);
//   }
// }
// Player.applyInputs = function(player, inputs, dt) {
//   var vertical = (inputs.forward || 0) - (inputs.back || 0);
//   var horizontal = (inputs.left || 0) - (inputs.right || 0);

//   if (vertical || horizontal) {
//     var direction = Vector.rotateAround({
//       x: vertical,
//       y: 0,
//       z: -horizontal
//     }, {x: 0, y: 1, z: 0}, -player.rotation.y + Math.PI / 2);

//     if (player.grounded) {
//       direction = Vector.normalize(Vector.projectOnPlane(direction, player.realGroundNormal));
//     }

//     var currentAcceleration = player.runningAcceleration;//renderer.getKey(16) ? this.runningAcceleration : this.walkAcceleration;
//     currentAcceleration *= (player.grounded ? player.crouching ? 0.5 : 1 : 0.1);
//     if (player.getCurrentWeapon()) {
//       currentAcceleration *= player.getCurrentWeapon().getSpeed();
//     }

//     if (player.grounded) {
//       player.walkTime += currentAcceleration * player.headBobSpeed * dt;
//     }

//     // actionQueue.push({type: "movement", time: new Date().getTime(), direction: direction, speed: this.walkSpeed, dt: dt});
    
//     player.position = Vector.add(player.position, Vector.multiply(direction, player.walkSpeed * dt));
//     // player.velocity = Vector.add(player.velocity, Vector.multiply(direction, currentAcceleration * dt));
//   }
//   else {
//     player.walkTime += (roundNearest(player.walkTime, Math.PI) - player.walkTime) * 0.1;
//   }

//   // Jumping
//   // if (renderer.getKeyDown(32)) {
//   if (inputs.jump) {
//     player.jumpCounter = player.jumpBuffering;
//   }

//   if (inputs.jump && player.jumpCounter > 0 && player.groundCounter > 0) {
//     player.velocity.y = 6;
//     player.position.y += 0.05;

//     player.jumpCounter = 0;
//     player.groundCounter = 0;
//   }

//   // Crouching
//   player.crouching = inputs.crouching;
// }

// Player.solveCollisions = function(player) {
//   player.grounded = false;

//   var radiusOffset = new Vector(0, player.colliderRadius, 0);
//   var playerAABB = new AABB(
//     {x: player.position.x - player.colliderRadius * 2, y: player.position.y - player.colliderRadius * 2,                 z: player.position.z - player.colliderRadius * 2},
//     {x: player.position.x + player.colliderRadius * 2, y: player.position.y + player.colliderRadius * 2 + player.height, z: player.position.z + player.colliderRadius * 2}
//   );
//   var q = physicsEngine.octree.queryAABB(playerAABB);

//   for (var iter = 0; iter < player.collisionIterations; iter++) {
//     if (q) {
//       for (var k = 0; k < q.length; k++) {
//         if (!AABBTriangleToAABB(q[k][0], q[k][1], q[k][2], playerAABB)) { // bruh redundant?
//           continue;
//         }

//         var col = capsuleToTriangle(
//           Vector.add(player.position, new Vector(0, player.standHeight / 2 - player.height * 0.5 + player.colliderRadius, 0)),
//           Vector.subtract(Vector.add(player.position, new Vector(0, player.standHeight / 2 + player.height / 2, 0)), radiusOffset),
//           player.colliderRadius,
//           q[k][0], q[k][1], q[k][2],
//           true
//         );
//         // var col = capsuleToTriangle(Vector.add(this.position, radiusOffset), Vector.subtract(Vector.add(this.position, new Vector(0, this.height, 0)), radiusOffset), this.colliderRadius, q[k][0], q[k][1], q[k][2], true);
        
//         if (col && !Vector.equal(col.normal, Vector.zero(), 0.001)) {
//           var dp = Vector.dot(Vector.up(), col.normal);
//           var normal = dp > 0.85 ? Vector.up() : col.normal;
//           var depth = col.depth / Vector.dot(normal, col.normal);

//           player.position = Vector.add(player.position, Vector.multiply(normal, depth));
//           player.velocity = Vector.projectOnPlane(player.velocity, normal);

//           var isGround = Vector.dot(normal, Vector.up()) > 0.7;
//           if (isGround) {
//             player.fakeGroundNormal = normal;
//             player.realGroundNormal = col.normal;
//             player.grounded = true;
//           }
//         }
//       }
//     }
//   }
// }

function MultiplayerCharacter(gameObject) {
  this.id = -1;
  this.gameObject = gameObject;
  this.snapshotHistory = [];

  this.update = function(dt) {
    if (this.gameObject) {
      var data = this.getLerpedSnapshotData(new Date() - LERP_DELAY);
      if (data) {
        // this.gameObject.animationController.speed = data.currentSpeed;
        if (!isNaN(data.animationX) && !isNaN(data.animationY) && !isNaN(data.animationZ)) {
          var wh = this.gameObject.animationController.weightsHandler;
          wh.x += (data.animationX - wh.x) / 2;
          wh.y += (data.animationY - wh.y) / 2;
          wh.z += (data.animationZ - wh.z) / 2;
        }

        this.gameObject.transform.position = data.position;
        this.gameObject.transform.rotation = Quaternion.euler(0, -data.rotation.y + Math.PI, 0);
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
        neighbors = [snapshot, snapshotHistoryCopy[i - 1], snapshotHistoryCopy[i + 1], i];
        break;
      }
    }

    if (!neighbors) {
      var i = snapshotHistoryCopy.length - 1;
      neighbors = [snapshotHistoryCopy[i], snapshotHistoryCopy[i - 1], snapshotHistoryCopy[i + 1]];
    }

    if (neighbors) {
      if (neighbors[1]) {
        var t = inverseLerp(neighbors[0].timestamp, neighbors[1].timestamp, time);
        // var t = clamp(1 + inverseLerp(neighbors[0].timestamp, neighbors[1].timestamp, time), 0, 1);
        var lerpedData = {};

        // if (neighbors[0].timestamp < neighbors[1].timestamp) {
        //   console.log(neighbors[0].timestamp - neighbors[1].timestamp, "ms");
        // }

        for (var key in neighbors[0].data) {
          var func;

          if (typeof neighbors[0].data[key] == "number") {
            func = lerp;
          }
          else if (Vector.isVectorIsh(neighbors[0].data[key])) {
            func = Vector.lerp;
          }
          else {
            lerpedData[key] = neighbors[0].data[key];
            continue;
          }

          lerpedData[key] = func(neighbors[0].data[key], neighbors[1].data[key], t);
        }

        // var sub = Vector.subtract(neighbors[0].data.position, neighbors[1].data.position);
        // var worldVelocity = Vector.divide(sub, (neighbors[0].timestamp - neighbors[1].timestamp) / 1000);
        var worldVelocity = Vector.divide(lerpedData.velocity, 4);
        worldVelocity = Vector.rotateAround(worldVelocity, Vector.up(), lerpedData.rotation.y + Math.PI);
        worldVelocity = Vector.clamp(worldVelocity, -1, 1);

        lerpedData.animationX = worldVelocity.x;
        lerpedData.animationY = worldVelocity.z;
        lerpedData.animationZ = lerpedData.crouching ? -1 : 0;

        if (lerpedData.crouching) {
          lerpedData.position.y += 0.4;
        }

        // console.log(worldVelocity, lerpedData.yRotation + Math.PI);

        // var forward = Vector.rotateAround({x: 0, y: 0, z: 1}, Vector.up(), lerpedData.yRotation + Math.PI);
        // var speed = Vector.length({x: sub.x, y: 0, z: sub.z}) / ((neighbors[0].timestamp - neighbors[1].timestamp) / 1000) / 4;
        // lerpedData.currentSpeed = speed * Math.sign(Vector.dot(forward, sub));

        if (isNaN(lerpedData.position.x)) {
          console.log(neighbors, t, snapshotHistoryCopy);
        }

        return lerpedData;
      }
      else if (neighbors[0]) {
        return neighbors[0].data;
      }
    }

    console.log(snapshotHistoryCopy.length, neighbors, new Date(time), snapshotHistoryCopy);
    console.warn("Skipped snapshot");
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
      this.gameObject = scene.add(await renderer.loadGLTF("../assets/models/captureZone.glb"));
      this.gameObject.children[0].castShadows = false;

      var zoneProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/captureZone"));
      var mat = this.gameObject.children[0].meshRenderer.materials[0] = new renderer.Material(zoneProgram);
      mat.setUniform("zoneColor", [5, 5, 5]);
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

    if (player.isPlaying && Vector.distanceSqr(player.position, this.gameObject.transform.position) < this.radius * this.radius) {
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
    mat.setUniform("zoneColor", getRingColor(color));

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

async function CreateCaptureZone(position = Vector.zero(), zoneInstance) {
  var z = new CaptureZone(position, zoneInstance);
  await z.setup();
  return z;
}

function createTerrainData(w = 20, h = 20, res = 5, heightFactor = 2, noiseOffset = Vector.zero(), noiseScale = 0.01, uvScale = 20) {
  function getHeight(i, j) {
    return Math.pow(LayeredNoise(i * noiseScale, j * noiseScale, 4), 2) * heightFactor;// * clamp((Vector.length(new Vector((i - (w - 1) / 2) * scale, (j - (h - 1) / 2) * scale)) - 10) * 0.05, 0, 1);
    // return perlin.noise(i * noiseScale, j * noiseScale) * scale * heightFactor * clamp((Vector.length(new Vector((i - (w - 1) / 2) * scale, (j - (h - 1) / 2) * scale)) - 10) * 0.05, 0, 1);
  }

  var uvs = [];
  var vertices = [];
  var triangles = [];
  var tangents = [];

  for (var i = 0; i < res; i++) {
    for (var j = 0; j < res; j++) {
      var x = mapValue(i, 0, res - 1, -w / 2, w / 2);
      var z = mapValue(j, 0, res - 1, -h / 2, h / 2);

      var vertex = new Vector(
        x,
        getHeight(x + noiseOffset.x, z + noiseOffset.y),
        z
      );
      vertices.push(vertex.x, vertex.y, vertex.z);
      uvs.push(i / (res - 1) * uvScale, j / (res - 1) * uvScale);
    }
  }

  var normals = new Array(vertices.length / 3);
  for (var i = 0; i < normals.length; i++) {
    normals[i] = [];
  }

  for (var i = 0; i < res - 1; i++) {
    for (var j = 0; j < res - 1; j++) {
      var ind = j + i * res;
      var indices = [
        ind,
        ind + 1,
        ind + res,

        ind + 1,
        ind + res + 1,
        ind + res
      ];
      triangles.push(...indices);

      var t1Normal = getTriangleNormal([Vector.fromArray(vertices, indices[0] * 3), Vector.fromArray(vertices, indices[1] * 3), Vector.fromArray(vertices, indices[2] * 3)]);
      var t2Normal = getTriangleNormal([Vector.fromArray(vertices, indices[3] * 3), Vector.fromArray(vertices, indices[4] * 3), Vector.fromArray(vertices, indices[5] * 3)]);

      normals[indices[0]].push(t1Normal);
      normals[indices[1]].push(t1Normal);
      normals[indices[2]].push(t1Normal);
      normals[indices[3]].push(t2Normal);
      normals[indices[4]].push(t2Normal);
      normals[indices[5]].push(t2Normal);
    }
  }

  var outNormals = [];
  for (var i = 0; i < normals.length; i++) {
    var normal = Vector.divide(normals[i].reduce((a, b) => {
      return Vector.add(a, b);
    }, Vector.zero()), normals[i].length);

    outNormals.push(normal.x, normal.y, normal.z);

    tangents.push(normal.y, normal.x, normal.z);
  }

  var meshData = new renderer.MeshData({
    indices: {
      bufferData: new Uint32Array(triangles),
      target: renderer.gl.ELEMENT_ARRAY_BUFFER
    },
    position: {
      bufferData: new Float32Array(vertices),
      size: 3
    },
    normal: {
      bufferData: new Float32Array(outNormals),
      size: 3
    },
    tangent: {
      bufferData: new Float32Array(tangents),
      size: 3
    },
    uv: {
      bufferData: new Float32Array(uvs),
      size: 2
    }
  });
  
  return meshData;
}

function LayeredNoise(x, y, octaves = 4) {
  var noise = 0;
  var frequency = 1;
  var factor = 1;

  var persistance = 0.4;
  var roughness = 3;

  for (var i = 0; i < octaves; i++) {
    noise += perlin.noise(x * frequency + i * 0.72354, y * frequency + i * 0.72354) * factor;
    factor *= persistance;
    frequency *= roughness;
  }

  return noise;
}

function Settings() {
  var defaultSettings = {
    "FOV": new Slider(45, 10, 80, 1),
    "Master volume": new Slider(1, 0, 2, 0.1)

    // "Master volume": new Slider(0.5, 0, 1),
    // "Colorblindness mode": new Dropdown(0, ["First", "second", "third"]),
    // "Toggle": new Toggle(true)
  }

  var _settings = copySettings(defaultSettings);

  this.getSetting = function(setting) {
    return _settings[setting]?.value;
  }

  function copySettings(settings) {
    var newSettings = {};
    for (var key in settings) {
      newSettings[key] = settings[key].copy();
    }

    return newSettings;
  }

  function resetSettings() {
    _settings = copySettings(defaultSettings);
    localStorage.removeItem(LS_SETTINGS);
  }

  function loadSettings() {
    var saved = localStorage.getItem(LS_SETTINGS);
    if (saved) {
      try {
        saved = JSON.parse(saved);
  
        for (var key in _settings) {
          if (key in saved) {
            _settings[key].value = _settings[key].validate(saved[key]);
          }
        }
      }
      catch (e) {
        console.error(e);
        console.warn("Invalid settings in local storage!");
      }
    }
  }

  function saveSettings() {
    var saveObject = {};
    for (var key in _settings) {
      saveObject[key] = _settings[key].value;
    }

    localStorage.setItem(LS_SETTINGS, JSON.stringify(saveObject));
  }

  var createSettingsElement = () => {
    var settingsList = document.querySelector(".settingsList");
    removeChildren(settingsList);

    for (var key in _settings) {
      var value = _settings[key];

      var item = settingsList.appendChild(document.createElement("div"));
      item.classList.add("item");

      var keyDiv = item.appendChild(document.createElement("div"));
      keyDiv.innerText = key;

      var valueDiv = item.appendChild(document.createElement("div"));
      value.createInputElement(valueDiv);
    }

    var resetButton = settingsList.appendChild(document.createElement("button"));
    resetButton.innerText = "Reset settings";
    resetButton.classList.add("AccentButton");
    resetButton.onclick = function() {
      if (confirm("Are you sure you want to reset all settings to their default values?")) {
        resetSettings();
        createSettingsElement();
      }
    }
  }

  function Toggle(value) {
    this.value = value;

    this.createInputElement = function(parent) {
      var toggleElement = document.createElement("label");
      toggleElement.classList.add("toggle");

      var checkbox = toggleElement.appendChild(document.createElement("input"));
      checkbox.setAttribute("type", "checkbox");
      checkbox.checked = this.value;

      var span = toggleElement.appendChild(document.createElement("span"));
      span.classList.add("slider", "round");

      parent.appendChild(toggleElement);

      checkbox.onchange = () => {
        this.value = checkbox.checked;

        saveSettings();
      }
    }

    this.validate = function(v) {
      return !!v;
    }

    this.copy = function() {
      return new Toggle(this.value);
    }
  }

  function Dropdown(currentIndex = 0, options = []) {
    this.currentIndex = currentIndex;
    this.options = options;
    this.value = this.options[this.currentIndex];

    this.createInputElement = function(parent) {
      var selectElement = document.createElement("select");

      for (var option of this.options) {
        var optionElement = document.createElement("option");
        optionElement.value = option;
        optionElement.innerText = option;
        selectElement.appendChild(optionElement);
      }

      var ind = this.options.indexOf(this.value);
      ind = Math.max(ind, 0);
      selectElement.selectedIndex = ind;
      this.currentIndex = ind;

      parent.appendChild(selectElement);

      selectElement.onchange = () => {
        this.value = this.options[selectElement.selectedIndex];
        this.currentIndex = selectElement.selectedIndex;

        saveSettings();
      }
    }

    this.validate = function(v) {
      return v;
    }

    this.copy = function() {
      return new Dropdown(this.currentIndex, this.options);
    }
  }

  function Slider(current, min, max, step = 0.1) {
    this.value = current;
    this.min = min;
    this.max = max;
    this.step = step;

    this.createInputElement = function(parent) {
      var slider = document.createElement("input");
      slider.setAttribute("type", "range");
      slider.setAttribute("min", this.min);
      slider.setAttribute("max", this.max);
      slider.setAttribute("step", this.step);
      slider.value = this.value;

      var minSpan = document.createElement("span");
      minSpan.style = `
        display: inline-block;
        width: 30px;
        text-align: right;
        padding-right: 0.5em;
      `;
      minSpan.innerText = this.min;

      var maxSpan = document.createElement("span");
      maxSpan.style = `
        display: inline-block;
        width: 30px;
        padding-left: 0.5em;
      `;
      maxSpan.innerText = this.max;

      var currentValueInput = document.createElement("input");
      currentValueInput.value = this.value;

      parent.appendChild(minSpan);
      parent.appendChild(slider);
      parent.appendChild(maxSpan);

      parent.appendChild(currentValueInput);

      var setValues = (input) => {
        var v = this.validate(input);

        slider.value = v;
        currentValueInput.value = v;
        this.value = v;

        saveSettings();
      }

      slider.onchange = () => {
        setValues(slider.value);
      }

      currentValueInput.onchange = () => {
        setValues(currentValueInput.value);
      }
    }

    this.validate = function(v) {
      if (typeof v == "string") {
        v = v.replace(",", ".");
      }

      v = parseFloat(v);

      if (isNaN(v)) {
        v = this.min;
      }

      v = clamp(v, this.min, this.max);
      v = roundNearest(v, this.step);
      v = roundToPlaces(v, 9);

      return v;
    }

    this.copy = function() {
      return new Slider(this.value, this.min, this.max, this.step);
    }
  }

  loadSettings();
  createSettingsElement();
}

function ApplySettings() {
  defaultFov = window.defaultFov = window.targetFov = currentFov = settings.getSetting("FOV");
  masterVolume.gain.value = settings.getSetting("Master volume");
}

function Leaderboard(element) {
  this.element = element;
  var list = this.element.querySelector(".list");
  var itemTemplate = this.element.querySelector(".itemTemplate");

  this.sort = function(querySel = ".kills") {
    var items = [...element.querySelectorAll(".list > div")];
    items.sort((a, b) => {
      return parseInt(a.querySelector(querySel).innerText) - parseInt(b.querySelector(querySel).innerText);
    });

    for (var i = 0; i < items.length; i++) {
      list.insertBefore(items[i], list.childNodes[i]);
    }
  }

  this.addPlayer = function() {
    var clone = itemTemplate.content.cloneNode(true);
    clone = list.appendChild(clone.children[0]);
    return clone;
  }

  this.incrementPlayerStat = function(playerName, stat, inc = 1) {
    var row = this.getPlayerRow(playerName);
    this.setItem(row, stat, parseFloat(this.getItem(row, stat)) + inc);
  }

  this.setPlayerStat = function(playerName, stat, value) {
    var row = this.getPlayerRow(playerName);
    this.setItem(row, stat, value);
  }

  this.getPlayerRow = function(playerName) {
    var xpath = `//span[text()='${playerName}']`;
    var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    return matchingElement.parentElement;
  }

  this.setItem = function(element, selector, value) {
    element.querySelector(selector).innerText = value;
  }

  this.getItem = function(element, selector) {
    return element.querySelector(selector).innerText;
  }

  this.show = function() {
    this.sort(".score");
    showElement(this.element);
  }

  this.hide = function() {
    hideElement(this.element);
  }
}

function Killfeed() {
  this.feed = [];
  this.y = 50;
  this.width = 400;
  this.offset = 0;

  this.removeItem = function() {
    this.feed.shift();
    this.offset = 1;
  }

  this.addItem = function(item) {
    this.feed.push(item);

    if (this.feed.length > 10) {
      this.removeItem();
    }
    else {
      setTimeout(() => {
        this.removeItem();
      }, 10000);
    }
  }

  this.update = function(dt) {
    if (this.offset > 0) {
      this.offset -= dt * 4;
    }
    this.offset = Math.max(0, this.offset);
  }

  this.render = function() {
    var killfeedGradient = ui.ctx.createLinearGradient(ui.width - this.width, 0, ui.width - this.width + 50, 0);
    killfeedGradient.addColorStop(0, "transparent");
    killfeedGradient.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  
    ui.setFont("Oswald");
    ui.ctx.textAlign = "right";
    ui.ctx.textBaseline = "middle";
  
    for (var i = 0; i < this.feed.length; i++) {
      var k = this.feed[i];
      var msg;
      if (!("killer" in k)) {
        msg = k.killed + " died";
      }
      else {
        msg = k.killer + " killed " + k.killed;
      }
      
      ui.rectangle(ui.width - this.width, this.y + (i + this.offset) * 30, this.width, 25, killfeedGradient);
      ui.text(msg, ui.width - 10, this.y + 25 / 2 + (i + this.offset) * 30, 16, "white");
    }
  
    ui.ctx.textAlign = "left";
    ui.ctx.textBaseline = "alphabetic";
  }
}

function createTextTexture(text, size = 256) {
  var canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext("2d");

  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 60);

  ctx.fillStyle = "white";
  ctx.font = "800 50px Arial";
  var textSize = ctx.measureText(text);

  var fontSize = Math.min(50, 0.9 * size / textSize.width * 50);
  ctx.font = "800 " + fontSize + "px Arial";
  var textSize = ctx.measureText(text);

  ctx.fillText(text, canvas.width / 2 - textSize.width / 2, canvas.height / 2 + textSize.actualBoundingBoxAscent / 2);

  return renderer.loadTexture(canvas.toDataURL());
}

window.showKillAlert = showKillAlert;
var killAlertTimeout;
function showKillAlert(player, special = "") {
  killAlertPlayer.innerText = "You killed " + player;
  killAlertSpecial.innerText = special;
  showElement(killAlert);

  resetAnimations(killAlert.querySelector("img"));

  clearTimeout(killAlertTimeout);
  killAlertTimeout = setTimeout(function() {
    fadeOutElement(killAlert);
  }, 2000);
}

window.flashButton = function(element) {
  element.classList.remove("flashButton");
  setTimeout(function() {
    element.classList.add("flashButton");
  });
}

// window.openLoadout = function() {
//   showElement(loadoutUI);
//   hideElement(lobbyUI);
// }

// window.closeLoadout = function() {
//   hideElement(loadoutUI);
//   showElement(lobbyUI);
// }

async function setupWeapons() {
  loadingStatus.innerText = "Loading weapons";

  var weaponModels = {
    pistol: scene.add(await renderer.loadGLTF("../assets/models/weapons/pistolSuppressor.glb", {gameObjectOptions: {castShadows: false}})),
    AK12: scene.add(await renderer.loadGLTF("../assets/models/weapons/AK12.glb", { gameObjectOptions: {castShadows: false}})),
    sniper: scene.add(renderer.BatchGameObject(await renderer.loadGLTF("../assets/models/weapons/sniper.glb", {gameObjectOptions: {castShadows: false}}))),

    // ak47: scene.add(await renderer.loadGLTF("../assets/models/ak47Hands.glb", { loadMaterials: true, maxTextureSize: 256, gameObjectOptions: {castShadows: false}})),
    shotgun: scene.add(await renderer.loadGLTF("../assets/models/weapons/shotgun.glb", {gameObjectOptions: {castShadows: false}})),
    // sks: scene.add(await renderer.loadGLTF("../assets/models/sks.glb", { loadMaterials: false, gameObjectOptions: {castShadows: false}}))
    LMG: scene.add(await renderer.loadGLTF("../assets/models/weapons/LMG.glb", {gameObjectOptions: {castShadows: false}})),
  };

  for (var key in weaponModels) {
    var w = weaponModels[key];
    w.setLayer(1, true);
    w.visible = false;
    w.setReceiveShadows(false, true);

    // Red dot
    var s = w.getChild("Reddot", true);
    if (s) {
      s.meshRenderer.materials[0] = reddotMaterial;
    }
  }

  // weaponModels.shotgun.transform.rotation = Quaternion.euler(0, Math.PI, 0);
  weaponModels.shotgun.animationController.speed = 2.5;
  
  for (var animation of weaponModels.pistol.animationController.animations) {
    if (animation.name.indexOf("Reload") != -1) {
      animation.speed = 0.9;
    }
    else if (animation.name.indexOf("Fire") != -1) {
      animation.speed = 2;
    }
  }

  weaponModels.AK12.transform.scale = Vector.fill(1 / 20);

  // var ak47 = weaponModels.ak47;
  // ak47.children[0].transform.rotation = Quaternion.euler(0, Math.PI, 0);
  // ak47.transform.scale = Vector.fill(2 / 20);
  // ak47.animationController.speed = 2.5;

  /*
    Weapon settings
  */
  var scopes = {
    reddot: new Scope({
      ADSFOV: 30,
      ADSMouseSensitivity: 0.8,

      ADSWeaponFOV: 5
    }),

    sniper: new Scope({
      sniperScope: true,
      ADSFOV: 8.5,
      ADSMouseSensitivity: 0.2
    }),
  }

  var weapons = {
    AK12: () => {
      var w = new Weapon({
        weaponObject: weaponModels.AK12,
        scope: scopes.reddot,
        weaponModelOffset: new Vector(-0.2, 0.12, 0.3),
        weaponModelADSOffset: new Vector(0, 0, -0.15),
        bulletDamage: 26,
        reloadTime: 1500,
        magSize: 30,
        fireMode: WEAPONENUMS.FIREMODES.AUTO,
        roundsPerSecond: 10,
        fireSound: "../assets/sound/AK12/fire.wav",
        recoil: function() {
          var m = (1 - player.crouching * 0.5);
          return {
            x: -0.9 * m,
            y: (Math.random() - 0.5) * 0.5 * m,
            z: 0
          };
        }
      });
      w.name = "AK12";

      // w.modelRecoil.fireForce.y = 0.1;
      // w.modelRecoil.fireTorque.x = 3;

      // w.modelRecoil.fireForce = new Vector(0, 0, 4);
      // w.modelRecoil.fireTorque = Vector.zero();
      // w.modelRecoil.fireTorque.z = 3;

      return w;
    },
    pistol: () => {
      var w = new Weapon({
        weaponObject: weaponModels.pistol,
        reloadTime: 1200,
        weaponModelOffset: new Vector(-0.2, 0.1, 0.25),
        weaponModelADSOffset: new Vector(0, -0.08, -0.2)
      });
      w.name = "Pistol";

      w.scope.ADSWepaonFOV = 32;
      w.modelRecoil.fireForce = Vector.zero();
      w.modelRecoil.fireTorque = Vector.zero();

      return w;
    },
    autoPistol: () => {
      var w = new Weapon({
        weaponObject: weaponModels.pistol,
        reloadTime: 1200,
        weaponModelOffset: new Vector(-0.2, 0.1, 0.25),
        weaponModelADSOffset: new Vector(0, -0.08, -0.2),
        fireMode: WEAPONENUMS.FIREMODES.AUTO,
        roundsPerSecond: 18,
        bulletSpread: 0.025
      });
      w.name = "Auto pistol";

      w.scope.ADSWepaonFOV = 32;
      w.modelRecoil.fireForce = Vector.zero();
      w.modelRecoil.fireTorque = Vector.zero();

      return w;
    },
    sniper: () => {
      var w = new Weapon({
        weaponObject: weaponModels.sniper,
        scope: scopes.sniper,
        roundsPerSecond: 1,
        magSize: 5,
        reloadTime: 1500,
        bulletDamage: 70,
        fireMode: WEAPONENUMS.FIREMODES.SINGLE,
        fireSoundBufferSize: 3,
        recoil: function() {
          return {x: -3, y: (Math.random() - 0.5) * 0.1, z: 0};
        }
      });
      w.name = "Sniper";

      w.modelRecoil.fireForce.z = 10;
      w.modelRecoil.translationReturn = -200;
      w.modelRecoil.translationDamping = -20;

      w.modelRecoil.fireTorque.x = 5;
      w.modelRecoil.rotationDamping = -15;
      w.modelRecoil.rotationReturn = -60;
      return w;
    },
    shotgun: () => {
      var w = new Weapon({
        weaponObject: weaponModels.shotgun,
        weaponModelOffset: {x: -0.2, y: 0.1, z: 0.25},
        reloadTime: 400,
        magSize: 6,
        roundsPerSecond: 2,
        bulletsPerShot: 10,
        ADSBulletSpread: 1,
        crosshairType: 1,
        sequentialReloading: true,
        bulletDamage: 10,
        recoil: function() {
          return {x: -5, y: (Math.random() - 0.5) * 0.2, z: 0};
        },
        fireSound: "../assets/sound/shotgun/fire.wav",
        reloadSound: "../assets/sound/shotgun/insertShell.wav",
        doneReloadingSound: "../assets/sound/shotgun/reloadEnd.wav"
      });
      w.name = "Shotgun";

      w.modelRecoil.fireForce = Vector.zero();
      w.modelRecoil.fireTorque = Vector.zero();

      return w;
    },

    ak47: () => new Weapon({
      weaponObject: weaponModels.ak47,
      scope: scopes.reddot,
      // ADSFOV: 30,
      // ADSMouseSensitivity: 0.8,
      weaponModelOffset: new Vector(-0.2, 0.22, 0.5),
      weaponModelADSOffset: Vector.zero(),
      reloadTime: 2700,
      magSize: 30,
      fireMode: WEAPONENUMS.FIREMODES.AUTO,
      roundsPerSecond: 10,
      recoil: function() {
        return {x: -1.2, y: (Math.random() - 0.5) * 1, z: 0};
      }
    }),

    LMG: () => {
      var w = new Weapon({
        weaponObject: weaponModels.LMG,
        scope: scopes.reddot,
        weaponModelOffset: new Vector(-0.2, 0.12, 0.3),
        weaponModelADSOffset: new Vector(0, 0, -0.15),
        bulletDamage: 26,
        reloadTime: 3000,
        magSize: 150,
        fireMode: WEAPONENUMS.FIREMODES.AUTO,
        roundsPerSecond: 16,
        ADSSpeed: 0.08,
        fireSound: "../assets/sound/AK12/fire.wav",
        recoil: function() {
          var m = (1 - player.crouching * 0.5);
          return {
            x: -1.5 * m,
            y: (Math.random() - 0.5) * 1 * m,
            z: 0
          };
        }
      });
      w.name = "LMG";

      // w.modelRecoil.fireForce.y = 0.1;
      // w.modelRecoil.fireTorque.x = 3;

      // w.modelRecoil.fireForce = new Vector(0, 0, 4);
      // w.modelRecoil.fireTorque = Vector.zero();
      // w.modelRecoil.fireTorque.z = 3;

      return w;
    },

    // overpowered: () => new Weapon({weaponObject: pistolGameObject, roundsPerSecond: 1000, magSize: 5000, fireMode: WEAPONENUMS.FIREMODES.AUTO, recoil: function() {
    //   return Vector.zero();
    // }}),
  };

  classes = {
    AR: {
      name: "Pew pew pew",
      weapons: [
        weapons.AK12(),
        weapons.pistol(),
        weapons.autoPistol()
      ]
    },
    sniper: {
      name: "Quickscope",
      weapons: [
        weapons.sniper(),
        weapons.pistol(),
        weapons.autoPistol()
      ],
    },
    shotgun: {
      name: "Toxic",
      weapons: [
        weapons.shotgun(),
        weapons.pistol(),
        weapons.autoPistol()
      ]
    },
    LMG: {
      name: "LMG go brrr",
      weapons: [
        weapons.LMG(),
        weapons.pistol(),
        weapons.autoPistol()
      ]
    }
  }

  selectedClass = getSavedSelectedClass();

  for (var key in classes) {
    var button = document.createElement("button");
    button.setAttribute("data-className", key);
    button.innerText = classes[key].name;
    button.onclick = (function(button) {
      return () => {
        updateClassPreview(button);
      };
    })(button);

    loadoutUI.querySelector(".classSelect").appendChild(button);
  }

  updateClassPreview(selectedClass);
}

async function renderWeaponIcons() {
  var whiteMat = new renderer.Material(renderer.programContainers.unlit);
  whiteMat.setUniform("albedo", [1, 1, 1, 1]);

  scene.skyboxVisible = false;
  renderer.setClearColor(0, 0, 0, 0);
  renderer.setCanvasSize(256, 256);
  renderer.settings.enableBloom = false;
  renderer.settings.enablePostProcessing = false;

  var camera = new Camera({near: 0.01, far: 300, layer: 5, fov: 10});
  camera.transform.matrix = Matrix.lookAt(new Vector(3.5, 0, 0), Vector.zero());
  camera.setAspect(renderer.aspect);

  var weaponModels = {
    pistol: scene.add(await renderer.loadGLTF("../assets/models/weapons/pistolSuppressor.glb", {gameObjectOptions: {castShadows: false}})),
    AK12: scene.add(await renderer.loadGLTF("../assets/models/weapons/AK12.glb", { gameObjectOptions: {castShadows: false}})),
    sniper: scene.add(renderer.BatchGameObject(await renderer.loadGLTF("../assets/models/weapons/sniper.glb", {gameObjectOptions: {castShadows: false}}))),
    shotgun: scene.add(await renderer.loadGLTF("../assets/models/weapons/shotgun.glb", {gameObjectOptions: {castShadows: false}})),
    LMG: scene.add(await renderer.loadGLTF("../assets/models/weapons/LMG.glb", {gameObjectOptions: {castShadows: false}})),
  };

  for (var key in weaponModels) {
    var weapon = weaponModels[key];
    weapon.visible = false;
  }

  weaponModels.AK12.transform.scale = Vector.fill(1 / 20);

  for (var key in weaponModels) {
    // var key = Object.keys(weaponModels)[0];
    var weapon = weaponModels[key];
    weapon.setLayer(5, true);
    weapon.visible = true;

    var aabb = GetMeshAABB(weapon);
    var s = 1 / aabb.getSize().z;
    weapon.transform.scale = Vector.multiply(weapon.transform.scale, s);
    weapon.transform.position = Vector.negate(Vector.multiply(aabb.getCenter(), s));
    aabb.translate(weapon.transform.position);

    weapon.traverse(o => {
      if (o.meshRenderer) {
        for (var ind in o.meshRenderer.materials) {
          o.meshRenderer.materials[ind] = whiteMat;
        }
      }
    })

    renderer.render(camera);
    renderer.saveCanvasAsImage(key);

    weapon.visible = false;
  }
}

function getSavedSelectedClass() {
  var l = localStorage.getItem(LS_SELECTEDCLASS);
  if (l) {
    return l;
  }

  if (!classes) {
    return;
  }

  return Object.keys(classes)[0];
}

function selectClass(name) {
  if (name in classes) {
    selectedClass = name;
    player.setWeapons(classes[name].weapons);
    localStorage.setItem(LS_SELECTEDCLASS, name);
    updateSelectClassButton();

    return;
  }

  console.error("Not a valid class!", name);
}

window.updateClassPreview = function(buttonOrName) {
  var className = buttonOrName instanceof HTMLElement ? buttonOrName.getAttribute("data-className") : buttonOrName;
  var clss = classes[className];

  loadoutUI.querySelector(".className").innerText = clss.name;

  selectClassButton.setAttribute("data-targetClass", className);
  updateSelectClassButton();

  for (var i = 0; i < clss.weapons.length; i++) {
    var weapon = clss.weapons[i];
    var div = createWeaponStatDiv(weapon);
    var slot = document.querySelectorAll(".classContainer .slot")[i];
    if (slot) {
      if (slot.childElementCount > 1) {
        slot.removeChild(slot.lastElementChild);
      }
      slot.appendChild(div);
    }
  }
}

function createWeaponStatDiv(weapon) {
  var weaponTemplate = document.querySelector("#weaponTemplate");
  var weaponElement = cloneTemplate(weaponTemplate);

  weaponElement.querySelector(".weaponTitle").innerText = weapon.name;
  weaponElement.querySelector(".reloadTimeStat").innerText = roundToPlaces(weapon.reloadTime / 1000, 2);
  weaponElement.querySelector(".magSizeStat").innerText = weapon.magSize;
  weaponElement.querySelector(".damageStat").innerText = weapon.bulletDamage;
  weaponElement.querySelector(".firerateStat").innerText = weapon.roundsPerSecond;

  return weaponElement;
}

function updateSelectClassButton() {
  if (selectedClass == selectClassButton.getAttribute("data-targetClass")) {
    selectClassButton.classList.add("classIsSelected");
  }
  else {
    selectClassButton.classList.remove("classIsSelected");
  }

  for (var elm of document.querySelectorAll(`.classSelect > button`)) {
    elm.classList.remove("classIsSelected");
  }

  var button = document.querySelector(`.classSelect > button[data-className=${selectedClass}]`);
  button.classList.add("classIsSelected");
}

// WebSocket

function setupWebsocket() {
  loadingStatus.innerText = "Connecting";

  try {
    // ws = new WebSocket(`wss://192.168.181.117:8080`);
    ws = new WebSocket(`wss://${location.hostname}:8080`);

    ws.onopen = function() {
      console.log("Connected to server");
      sendMessage("login", { username: localStorage.getItem(LS_USERNAME) });
      // sendMessage("login", {id: playerId});

      sendDataInterval = setInterval(function() {
        sendMessage("inputs", inputsToSend);
        inputsToSend = [];
  
        sendMessage("getAllPlayers");
  
        // if (wsIsOpen(ws)) {
        //   sendMessage("actionQueue", {
        //     id: oldActionQueues.length,
        //     actionQueue
        //   });
        //   oldActionQueues.push(actionQueue);
        //   actionQueue = [];
  
        //   // if (player) {
        //   //   sendMessage("updatePlayer", {
        //   //     position: player.position,
        //   //     angle: player.getHeadRotation().y
        //   //   });
        //   // }
        //   sendMessage("getAllPlayers");
        // }
      }, 1000 / SERVER_SEND_FPS);
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
  }
  catch (e) {
    console.warn("Failed to construct WebSocket!");
    console.error(e);
  }
}

function wsIsOpen(ws) {
  return ws && ws.readyState == ws.OPEN;
}

function sendMessage(type, data = null) {
  if (wsIsOpen(ws)) {
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

    if (parsed.clientSendTime) {
      var ping = new Date() - new Date(parsed.clientSendTime);
      latencies.push(ping);
      if (latencies.length > 50) {
        latencies.shift();
      }
    }

    if (parsed.hasOwnProperty("type") && parsed.hasOwnProperty("data")) {
      //console.log(parsed);

      if (parsed.type == "ping") {
        console.log(parsed.data);
      }
      else if (parsed.type == "login") {
        if (parsed.data.status == "success") {
          console.log("Logged in!");

          player.loginResponse(parsed.data);

          // setup();
        }
        else {
          console.error("Error loggin in!");
        }
      }
      else if (parsed.type == "deploy") {
        if (parsed.data.status == "success") {
          player.state = player.STATES.PLAYING;
        }
        else {
          console.error("Could not deploy!");
          lobbyUI.querySelector(".navigation").classList.remove("slideOut");
        }
      }
      else if (parsed.type == "deployOther") {
        var m = multiplayerCharacters[parsed.data.clientID];
        if (m) {
          m.enemy.respawn(parsed.data.position);
        }
      }
      else if (parsed.type == "gotoLobby") {
        player.gotoLobby();
      }
      else if (parsed.type == "playerAction") {
        // console.log(parsed);
        if (parsed.data.action == "joined") {
          console.log(parsed.data.clientID + " has joined!");
        }
        else if (parsed.data.action == "left") {
          console.log(parsed.data.clientID + " has left!");

          var m = multiplayerCharacters[parsed.data.clientID];
          m.gameObject.delete();
          enemies.splice(enemies.indexOf(m.enemy), 1);

          delete multiplayerCharacters[parsed.data.clientID];
        }
        else if (parsed.data.action == "fireWeapon") {
          var m = multiplayerCharacters[parsed.data.clientID];

          var trailPos = parsed.data.origin;
          var direction = parsed.data.direction;
          var trailVel = Vector.multiply(direction, 100);
          var trail = new BulletTrail(trailPos, trailVel, direction);
          trail.health = parsed.data.trailHealth;
          bulletTrails.push(trail);
        }
      }
      else if (parsed.type == "killPlayer") {
        if (parsed.data.killed == player.id) {
          player.killedBy = parsed.data.killer;
          player.die();
        }

        killfeed.addItem({
          killer: getPlayerNameByID(parsed.data.killer),
          killed: getPlayerNameByID(parsed.data.killed)
        });

        leaderboard.incrementPlayerStat(getPlayerNameByID(parsed.data.killer), ".kills", 1);
        leaderboard.incrementPlayerStat(getPlayerNameByID(parsed.data.killed), ".deaths", 1);
      }
      else if (parsed.type == "getAllPlayers") {
        //if (!snapshotHistory[snapshotHistory.length - 1] || new Date(parsed.timestamp) > snapshotHistory[snapshotHistory.length - 1].serverTimestamp) {
          // parsed.serverTimestamp = new Date(parsed.serverTimestamp);
          // parsed.timestamp = new Date();

          for (var entity of parsed.data) {
            var found = multiplayerCharacters[entity.id];
            if (!found) {
              var gameObject = scene.add(swat.copy());
              console.log(gameObject.animationController);

              found = new MultiplayerCharacter(gameObject);
              found.id = entity.id;
              found.name = entity.name;
              multiplayerCharacters[entity.id] = found;

              var enemy = new Enemy(gameObject, found.name);
              enemy.onDeath = () => {
                sendMessage("killPlayer", {
                  clientID: found.id
                });
              }
              found.enemy = enemy;
              enemies.push(enemy);

              found.leaderboardEntry = leaderboard.addPlayer();
              leaderboard.setItem(found.leaderboardEntry, ".name", found.name);
            }

            if (found) {
              var t = entity.data.localUpdatedTime ?? parsed.serverTimestamp;
              // console.log(entity.data.localUpdatedTime);
              found.snapshotHistory.push({
                serverTimestamp: new Date(parsed.serverTimestamp),
                // timestamp: parsed.serverTimestamp,
                rawTimestamp: t,
                timestamp: new Date(t),
                data: entity.data
              });

              if (found.snapshotHistory.length > 500) {
                found.snapshotHistory.shift();
              }
            }
          }
        //}
      }
      else if (parsed.type == "getSelf") {
        var dt = physicsEngine.dt;

        var playerCopy = new PlayerPhysicsBase(player.startPosition);
        playerCopy.physicsEngine = physicsEngine;
        playerCopy.position = {...parsed.data.gameData.position},
        playerCopy.velocity = {...parsed.data.gameData.velocity},
        playerCopy.grounded = parsed.data.gameData.isGrounded;

        var positionError = Vector.distance(stateBuffer[parsed.data.lastProcessedTick].position, playerCopy.position);
        if (positionError > 0.0001) {
          for (var rewindTick = parsed.data.lastProcessedTick + 1; rewindTick < tick; rewindTick++) {
            var inputs = inputBuffer[rewindTick];

            stateBuffer[rewindTick].position = playerCopy.position;
            stateBuffer[rewindTick].velocity = playerCopy.velocity;

            playerCopy.rotation.y = inputs.yRotation;
            playerCopy.applyInputs(inputs.inputs, dt);
            playerCopy.simulatePhysicsStep(dt);
          }

          var smoothing = true;
          if (smoothing && positionError < 2) {
            player.position = Vector.lerp(player.position, playerCopy.position, 0.5);
          }
          else {
            player.position = playerCopy.position;
          }

          player.velocity = playerCopy.velocity;
          player.grounded = playerCopy.grounded;
        }
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
  // running = false;
  showElement(loadingStatus);
  // loadingDiv.style.removeProperty("display");
}

function getPlayerNameByID(id) {
  if (multiplayerCharacters[id]) {
    return multiplayerCharacters[id].name;
  }
  else if (player.id == id) {
    return player.name;
  }
}
//

function SetupEvents() {
  // Ask user before closing page
  // window.onbeforeunload = function() {
  //   return true;
  // }

  renderer.on("mousedown", function(e) {
    if (running && player) {
      if (player.isPlaying) {
        renderer.lockPointer();
      }

      if (renderer.isPointerLocked()) {
        switch (e.button) {
          case 0:
            mouse.left = true;
            player.Fire();
            break;
          case 2:
            if (player.isPlaying && player.getCurrentWeapon()) {
              player.getCurrentWeapon().ADS();
            }
            break;
        }
      }

      if (e.button == 1) {
        e.preventDefault();
        return false;
      }

      // Breaks in iframe
      //e.preventDefault();
    }
  });

  renderer.gl.canvas.addEventListener('contextmenu', event => event.preventDefault());

  renderer.on("mouseup", function(e) {
    if (running) {
      switch (e.button) {
        case 0:
          mouse.left = false;
          break;
        case 2:
          if (player && player.isPlaying && player.getCurrentWeapon()) {
            player.getCurrentWeapon().unADS();
          }
          break;
      }
    }
  });

  var lastMovement = {x: 0, y: 0};

  renderer.on("mousemove", function(e) {
    if (running && player && player.isPlaying && renderer.isPointerLocked()) {
      var currentWeapon = player.getCurrentWeapon();
      var weaponSens = currentWeapon ? currentWeapon.getCurrentSensitivity() : 1;

      // Try to remove mouse spike in chrome
      if (!(Math.abs(lastMovement.x - e.movementX) > 300 || Math.abs(lastMovement.y - e.movementY) > 300)) {
        player.rotation.x += e.movementY * 0.002 * weaponSens;
        player.rotation.y += e.movementX * 0.002 * weaponSens;
        player.clampRotation();
      }

      lastMovement.x = e.movementX;
      lastMovement.y = e.movementY;

      mouse.movementX += (e.movementX - mouse.movementX) * 0.3;
      mouse.movementY += (e.movementY - mouse.movementY) * 0.3;
    }
  });

  renderer.on("keydown", function(e) {
    if (running) {
      if (player && player.isPlaying) {
        if (player.getCurrentWeapon() && e.keyCode == 82) {
          player.getCurrentWeapon().reload();
        }

        if (e.keyCode >= 49 && e.keyCode <= 57) {
          player.switchWeapon(e.keyCode - 49);
        }
      }

      if (player && player.state == player.STATES.IN_LOBBY) {
        if (e.keyCode == 32) { // Space
          deployButton.click();
        }
        if (e.keyCode == 27) { // Esc
          lobbyTabs[0].checked = true;
          // closeLoadout();
        }
        if (e.keyCode == 13) { // Enter
          // selectClass("shotgun");
        }
      }

      if (e.keyCode == 9) { // Tab
        leaderboard.show();
        e.preventDefault();
      }
    }
  });

  renderer.on("keyup", function(e) {
    if (running) {
      if (e.keyCode == 9) { // Tab
        leaderboard.hide();
      }
    }
  });

  var canScroll = true;

  document.onwheel = function(e) {
    if (running) {
      if (player && player.isPlaying && canScroll) {
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