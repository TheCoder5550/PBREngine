"use strict";

import Renderer, { GameObject, Scene, Camera, AudioListener3D, FindMaterials, flyCamera, Light } from "../engine/renderer.js";
import { PhysicsEngine, Rigidbody, SphereCollider } from "../engine/physics.mjs";
import FlyCamera from "../engine/flyCamera.mjs";
import Vector from "../engine/vector.mjs";
import Matrix from "../engine/matrix.mjs";
import Quaternion from "../engine/quaternion.mjs";
import { clamp, lerp } from "../engine/helper.mjs";

var loadingScreen = document.querySelector(".loadingScreen");
var loadingStatus = loadingScreen.querySelector(".status");
var loader = loadingScreen.querySelector(".loader");

var carColorInput = document.querySelector("#carColor");
var carEmissionInput = document.querySelector("#carEmission");
var carMetallicInput = document.querySelector("#carMetallic");
var carRoughnessInput = document.querySelector("#carRoughness");

var perlin = typeof Perlin == "undefined" ? {noise: _ => 0} : new Perlin();
var gamepadManager = new GamepadManager();
window.gamepadManager = gamepadManager;

var stats;
var anyError = false;
var rafID;

var ui = new GameCanvas({publicMethods: false});
ui.canvas.classList.add("ingameUICanvas");

var renderer = new Renderer();
var scene = new Scene("Main scene");

var fov = 25;
var mainCamera = new Camera({position: new Vector(0, 0, -3), near: 0.1, far: 1000, layer: 0, fov: fov});
// var flyCamera;
var cameraEulerAngles = Vector.zero();
var cameraCarForward = Vector.zero();

var physicsEngine = new PhysicsEngine(scene);
var audioListener = new AudioListener3D();
var keybindings = new Keybindings();

var debugLines;

var lastUpdate = performance.now();

var player = {
  position: Vector.zero(),
  rotation: Vector.zero()
};

var car;
var tiltAngle = 0;
var touchDriveInput = 0;

setup();
async function setup() {
  console.time("Setup");

  renderer.on("error", function() {
    setError("Error!");
  });

  renderer.on("contextlost", function() {
    setError("Context lost!");
  });

  setLoadingStatus("Setting up renderer");
  await renderer.setup({
    path: "../",
    clearColor: [0, 0, 0, 1],
    shadowSizes: [8, 56],
    shadowBiases: [-0.0005, -0.001],

    // Mobile
    version: 2,
    // renderScale: 0.1,
    // disableLitInstanced: true,
    // disableLitSkinned: true,
    // disableLitBillboard: true
  });
  renderer.canvas.classList.add("webglCanvas");
  renderer.postprocessing.exposure = -0.5;
  renderer.add(scene);

  // flyCamera = new FlyCamera(renderer, {position: new Vector(0, 0, -3), near: 0.1, far: 300, layer: 0, fov: 20});

  renderer.on("resize", function() {
    mainCamera.setAspect(renderer.aspect);
  });
  mainCamera.setAspect(renderer.aspect);

  setLoadingStatus("Loading environment");
  await scene.loadEnvironment({
    // hdrFolder: "../assets/hdri/wide_street_01_1k_precomputed",
    res: 512
  });
  scene.sunIntensity = Vector.fromArray(Light.kelvinToRgb(6000, 20)); //Vector.multiply(new Vector(1, 0.85, 0.55), 25);
  scene.environmentIntensity = 0.75;//1.75;
  // scene.skyboxVisible = false;
  // scene.skyboxCubemap = scene.diffuseCubemap;

  var solidColorInstanceProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/solidColor"));

  // AABB visualizer
  scene.add(new GameObject("AABB", {
    meshRenderer: new renderer.MeshInstanceRenderer([new renderer.Material(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
    castShadows: false
  }));

  // await createPBRGrid(10, 10);
  // scene.add(await renderer.loadGLTF("./porsche.glb"));
  // var helmet = scene.add(await renderer.loadGLTF("./assets/models/DamagedHelmetTangents.glb"));

  // scene.add(await renderer.loadGLTF("./coordinateAxis.glb"));
  // var cube = scene.add(renderer.CreateShape("cube"));
  // cube.transform.position = new Vector(1.5, 0, 1.5);
  // cube.transform.scale = Vector.fill(0.1);

  // scene.add(await renderer.loadGLTF("../assets/models/toyota_ae86.glb"), { maxTextureSize: 256 }).transform.position.y -= 2.3;

  // setLoadingStatus("Loading map");
  // var map = await renderer.loadGLTF("./map.glb", { maxTextureSize: 1024 });
  // // map.transform.position = new Vector(0, -2.1, 0);
  // scene.add(renderer.BatchGameObject(map));

  // setLoadingStatus("Creating map collider");
  // var mapCollider = await renderer.loadGLTF("./mapCollider.glb", { loadMaterials: false, loadNormals: false, loadTangents: false });
  // // mapCollider.transform.position = new Vector(0, -2.1, 0);
  // physicsEngine.addMeshCollider(mapCollider);
  // physicsEngine.setupMeshCollider();

  var map = await renderer.loadGLTF("../assets/models/kajaman.glb");
  scene.add(map);

  var collider = await renderer.loadGLTF("../assets/models/kajamanCollider.glb", { loadMaterials: false, loadNormals: false, loadTangents: false });
  physicsEngine.addMeshCollider(collider);
  physicsEngine.setupMeshCollider();

  // var cube = scene.add(renderer.CreateShape("cube"));
  // cube.transform.position.x = 3;
  // FindMaterials("", cube)[0].setUniform("albedo", [0, 0.5, 0, 1]);
  
  // await renderer.CreatePBRGrid(scene, 10, 10, "sphere");
  // scene.add(await renderer.loadGLTF("../assets/models/test/environmentTest.glb"));

  // var grass = scene.add(await renderer.loadGLTF("./grass.glb"));
  // grass.children[0].meshRenderer = grass.children[0].meshRenderer.getInstanceMeshRenderer();

  // for (var i = 0; i < 1000; i++) {
  //   var origin = new Vector((Math.random() - 0.5) * 50, 100, (Math.random() - 0.5) * 50 - 50);
  //   var hit = physicsEngine.Raycast(origin, Vector.down());
  //   if (hit) {
  //     grass.children[0].meshRenderer.addInstance(Matrix.transform([
  //       ["translate", hit.firstHit.point],
  //       ["scale", Vector.fill(1 + Math.random() * 3)],
  //     ]));
  //   }
  // }

  // var porsche = scene.add(await renderer.loadGLTF("./porsche.glb"));
  // // porsche.transform.rotation = Quaternion.euler(Math.PI / 2, 0, 0);
  // porsche.transform.position = new Vector(2, 0, 0);
  // Matrix.pprint(porsche.transform.matrix);
  // window.porsche = porsche;

  // Reflection probe
  console.log("Creating reflection probe");
  var oldSkybox = scene.skyboxCubemap;
  var cubemap = renderer.captureReflectionCubemap(new Vector(0, 8, 200));
  await scene.loadEnvironment({ cubemap });
  scene.skyboxCubemap = oldSkybox;
  scene.environmentIntensity = 1;

  // setLoadingStatus("Creating car");
  // car = new Car({
  //   drivetrain: "RWD",
  //   friction: 1,
  //   forwardFriction: 1.2,
  //   sidewaysFriction: 1.2,
  //   torque: 500,
  //   maxSteerAngle: 40
  // });
  // await car.setup("../assets/models/americanMuscle.glb");
  // car.rb.COMOffset.y += 0.35;
  // car.camera.followDistance = 6;

  car = new Car({
    drivetrain: "RWD",
    friction: 1,
    forwardFriction: 1.3,
    sidewaysFriction: 1,
    frontCamber: 4,
    maxSteerAngle: 55,
    torque: 700,
    differential: Car.ENUMS.DIFFERENTIAL.LOCKED,

    suspensionForce: 90_000,
    suspensionDamping: 3500,
    suspensionTravel: 0.15
  });
  // car = new Car({
  //   drivetrain: "RWD",
  //   friction: 1,
  //   forwardFriction: 1.3,
  //   sidewaysFriction: 1.7,
  //   torque: 700,

  //   suspensionForce: 90_000,
  //   suspensionDamping: 3500,
  //   suspensionTravel: 0.15
  // });
  // await car.setup("../assets/models/americanMuscle.glb");
  await car.setup("./porsche.glb");

  car.camera.followDistance = 5;
  car.camera.followHeight = 0.35;
  car.camera.pitch = 0.2;

  car.rb.COMOffset.y += 0.2;//0.15;

  // car.wheels[0].friction *= 1.3;
  // car.wheels[1].friction *= 1.3;

  FindMaterials("paint", car.gameObject)?.[0]?.setUniform("albedo", [0, 0, 0, 1]);
  FindMaterials("paint", car.gameObject)?.[0]?.setUniform("roughness", 0.05);
  FindMaterials("paint", car.gameObject)?.[0]?.setUniform("metallic", 1);
  // FindMaterials("window", car.gameObject)?.[0]?.setUniform("albedo", [0, 0, 0, 0.99]);

  function updateCarColor() {
    var c = hexToRgb(carColorInput.value);
    var e = parseFloat(carEmissionInput.value);
    FindMaterials("paint", car.gameObject)?.[0]?.setUniform("albedo", [c.r, c.g, c.b, 1]);
    FindMaterials("paint", car.gameObject)?.[0]?.setUniform("emissiveFactor", [c.r * e, c.g * e, c.b * e]);
  }

  carColorInput.oninput = updateCarColor;
  carEmissionInput.oninput = updateCarColor;

  carMetallicInput.oninput = function() {
    FindMaterials("paint", car.gameObject)?.[0]?.setUniform("metallic", parseFloat(carMetallicInput.value));
  }

  carRoughnessInput.oninput = function() {
    FindMaterials("paint", car.gameObject)?.[0]?.setUniform("roughness", parseFloat(carRoughnessInput.value));
  }

  physicsEngine.fixedUpdate = function(dt) {
    car.fixedUpdate(dt);
    cameraControls(dt);
  }

  // physicsEngine.octree.render();

  debugLines = new DebugLines();

  scene.root.traverse(function(gameObject) {
    if (gameObject.meshRenderer && gameObject.meshRenderer.skin) {
      gameObject.meshRenderer.skin.updateMatrixTexture();
    }
  });

  SetupEvents();

  renderer.disableCulling();

  console.timeEnd("Setup");

  if (!anyError) {
    stats = new Stats();
    document.body.appendChild(stats.dom);

    loadingScreen.style.display = "none";
    // loop();

    window.renderer = renderer;
    window.scene = scene;
    window.camera = mainCamera;
    window.FindMaterials = FindMaterials;

    renderer.on("renderloop", function(frameTime, time) {
      // var frameTime = getFrameTime();
      debugLines.clear();
    
      if (renderer.getKey(81)) {
        var x = 0;
        for (var i = 0; i < 3e7; i++) {
          x += i * i;
        }
      }
    
      if (keybindings.getInputDown("resetGame")) {
        car.rb.velocity = Vector.zero();
        car.rb.angularVelocity = Vector.zero();
        car.rb.rotation = Quaternion.euler(0, Math.PI / 2, 0);
    
        car.rb.position = Vector.zero();
        car.gameObject.transform.position = Vector.zero();
      }
    
      physicsEngine.update();
      if (car) car.update(frameTime);
      scene.update(physicsEngine.dt);
    
      // if (!renderer.getKey("81")) flyCamera.update(frameTime);
    
      // cameraControls(frameTime);
    
      // renderer.render(flyCamera.camera);
      renderer.render(mainCamera);
      // debugLines.render(mainCamera);
      renderUI(frameTime);
    
      stats.update();
      // rafID = requestAnimationFrame(loop);
    });
  }
}

function renderUI(dt) {
  ui.clearScreen();
  
  if (car) {
    car.renderUI();
  }
}

function DrawGuage(t, min, max, x, y, size = 100) {
  // ui.ring(x, y, size, "black", 2);

  t = clamp(t, min - 100, max + 100);

  var tickColor = "#333";
  var meterColor = "rgb(255, 40, 40)";

  ui.setTextXAlign("center");
  ui.setTextYAlign("center");

  var steps = max / 1000;
  var tickSize = 0.9;
  var number = 0;
  for (var i = 0; i <= 270; i += 270 / steps) {
    var angle = (i + 135) * Math.PI / 180;
    ui.line(x + Math.cos(angle) * size, y + Math.sin(angle) * size, x + Math.cos(angle) * (size * tickSize), y + Math.sin(angle) * (size * tickSize), tickColor, 2);
    ui.text(number, x + Math.cos(angle) * (size * tickSize * 0.9), y + Math.sin(angle) * (size * tickSize * 0.9), size / 8, tickColor);

    number++;
  }

  ui.resetTextXAlign();
  ui.resetTextYAlign();

  var tickSize = 0.95;
  for (var i = 0; i <= 270; i += 270 / steps / 5) {
    var angle = (i + 135) * Math.PI / 180;
    ui.line(x + Math.cos(angle) * size, y + Math.sin(angle) * size, x + Math.cos(angle) * (size * tickSize), y + Math.sin(angle) * (size * tickSize), tickColor, 1);
  }

  var angle = (ui.mapValue(t, min, max, 0, 270) + 135) * Math.PI / 180;

  ui.beginPath();
  ui.lineTo(x + Math.cos(angle + Math.PI / 2) * size * 0.03, y + Math.sin(angle + Math.PI / 2) * size * 0.02);
  ui.lineTo(x - Math.cos(angle + Math.PI / 2) * size * 0.03, y - Math.sin(angle + Math.PI / 2) * size * 0.02);
  ui.lineTo(
    x + Math.cos(angle) * size * 0.95 - Math.cos(angle + Math.PI / 2) * size * 0.01,
    y + Math.sin(angle) * size * 0.95 - Math.sin(angle + Math.PI / 2) * size * 0.01
  );
  ui.lineTo(
    x + Math.cos(angle) * size * 0.95 + Math.cos(angle + Math.PI / 2) * size * 0.01,
    y + Math.sin(angle) * size * 0.95 + Math.sin(angle + Math.PI / 2) * size * 0.01
  );
  ui.closePath();
  ui.fillStyle(meterColor);
  ui.fill();

  ui.save();
  ui.beginPath();
  ui.arc(x, y, size * 0.3, 0, Math.PI * 2);
  ui.clip();

  ui.clearScreen();

  ui.restore();

  // ui.line(x, y, x + Math.cos(angle) * size * 0.95, y + Math.sin(angle) * size * 0.95, "red", 3);
}

function cameraControls(dt) {
  // mainCamera.position = new Vector(-2.35, 1.12, -3.49);
  // mainCamera.rotation = new Vector(-0.146 + Math.sin(physicsEngine.time * 0.7) * 0.02, -0.728 + Math.sin(physicsEngine.time * 0.5) * 0.02, 0);

  if (car) {
    if (car.cameraMode == 0) {
      var followDistance = car.camera.followDistance ?? 7;
      var followHeight = car.camera.followHeight ?? 0.4;
      var followSpeed = car.camera.followSpeed ?? 0.05;
      var pitch = car.camera.pitch ?? 0.15;

      var cameraTurnAngle = deadZone(gamepadManager.getAxis("RSHorizontal")) * Math.PI;

      var planeVelocity = Vector.projectOnPlane(car.rb.velocity, Vector.up());
      var currentForward = Quaternion.QxV(Quaternion.angleAxis(cameraTurnAngle, Vector.up()), Matrix.getForward(car.gameObject.transform.worldMatrix));//Vector.slerp(Matrix.getForward(car.gameObject.transform.worldMatrix), Vector.normalize(Vector.negate(planeVelocity)), clamp(Vector.lengthSqr(planeVelocity) / 5, 0, 1));
      cameraCarForward = Vector.slerp(cameraCarForward, currentForward, followSpeed);

      var finalCameraDir = null;

      var origin = Vector.add(car.gameObject.transform.position, new Vector(0, 0.15, 0));
      var dirNorm = Vector.normalize(Vector.add(cameraCarForward, new Vector(0, followHeight, 0)));

      var hit = physicsEngine.Raycast(origin, dirNorm);
      if (hit && hit.firstHit && hit.firstHit.distance < followDistance) {
        var d = hit.firstHit.distance;
        // currentFollowDist = clamp(d - 0.2, 0.5, followDistance);
        var h = Math.sqrt(followDistance * followDistance - d * d + (followHeight * d) ** 2) / d;

        var newDir = Vector.normalize(Vector.add(cameraCarForward, new Vector(0, h, 0)));
        hit = physicsEngine.Raycast(origin, newDir);
        if (hit && hit.firstHit && hit.firstHit.distance < followDistance) {
          finalCameraDir = Vector.multiply(newDir, hit.firstHit.distance - 0.5);
        }
        else {
          finalCameraDir = Vector.multiply(newDir, followDistance);
        }
      }
      else {
        finalCameraDir = Vector.multiply(dirNorm, followDistance);
      }

      mainCamera.transform.matrix = Matrix.lookAt(Vector.add(origin, finalCameraDir), origin);
      
      Matrix.rotateX(mainCamera.transform.matrix, pitch, mainCamera.transform.matrix);

      // var euler = Quaternion.toEulerAngles(mainCamera.transform.rotation);
      // euler[0] += 0.2;
      // mainCamera.transform.rotation = Quaternion.euler(euler[0], euler[1], euler[2]);
    }
    else if (car.cameraMode == 1) {
      var hoodCamera = car.gameObject.getChild("HoodCamera", true);
      if (hoodCamera) {
        mainCamera.transform.matrix = hoodCamera.transform.worldMatrix;
      }
    }
  }

  if (!car || car.cameraMode == 2) {
    var oldFov = mainCamera.getFOV();

    var x = quadraticCurve(deadZone(gamepadManager.getAxis("RSHorizontal"), 0.08));
    var y = quadraticCurve(deadZone(gamepadManager.getAxis("RSVertical"), 0.08));
    cameraEulerAngles.x -= y * 0.07 * clamp(oldFov / 45, 0, 1);
    cameraEulerAngles.y -= x * 0.07 * clamp(oldFov / 45, 0, 1);

    var vertical = quadraticCurve(deadZone(gamepadManager.getAxis("LSVertical")));
    var horizontal = quadraticCurve(deadZone(gamepadManager.getAxis("LSHorizontal")));

    var speed = 15;
    var c = Math.cos(cameraEulerAngles.x);
    camera.transform.position.x -= vertical * Math.cos(cameraEulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.z -= vertical * -Math.sin(cameraEulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.y -= vertical * Math.sin(cameraEulerAngles.x) * speed * dt;

    camera.transform.position.x += horizontal * Math.cos(cameraEulerAngles.y) * speed * dt;
    camera.transform.position.z += horizontal * -Math.sin(cameraEulerAngles.y) * speed * dt;

    flyCamera(renderer, mainCamera, cameraEulerAngles, dt);

    var fovInc = 1 + 0.03 * (gamepadManager.getButton("LS") - gamepadManager.getButton("RS"));
    var newFov = oldFov * fovInc;
    newFov = clamp(newFov, 0.1, 89);
    mainCamera.setFOV(newFov);

    mainCamera.transform.rotation = Quaternion.euler(cameraEulerAngles.x, cameraEulerAngles.y, cameraEulerAngles.z);
  }
}

function Keybindings() {
  var bindings = {
    "resetGame": {
      keyboard: "Escape",
      controller: "Menu"
    },

    "drive": {
      keyboard: "KeyW",
      controller: "RT"
    },
    "brake": {
      keyboard: "KeyS",
      controller: "LT"
    },
    "ebrake": {
      keyboard: "Space",
      controller: "A"
    },
    "steer": {
      keyboard: ["KeyA", "KeyD"],
      controller: "LSHorizontal"
    },
    "gearDown": {
      keyboard: "KeyQ",
      controller: "X"
    },
    "gearUp": {
      keyboard: "KeyE",
      controller: "B"
    },
    "resetCar": {
      keyboard: "KeyR",
      controller: "Menu"
    },
    "cameraMode": {
      keyboard: "KeyC",
      controller: "RB"
    }
  }

  this.getInput = function(name) {
    if (bindings[name]) {
      var keyboardValue = 0;
      if (Array.isArray(bindings[name].keyboard)) {
        var a = renderer.getKey(bindings[name].keyboard[0]) ? 1 : 0;
        var b = renderer.getKey(bindings[name].keyboard[1]) ? 1 : 0;
        keyboardValue = b - a;
      }
      else {
        keyboardValue = renderer.getKey(bindings[name].keyboard) ? 1 : 0;
      }

      var controllerValue = gamepadManager.getButton(bindings[name].controller) ?? gamepadManager.getAxis(bindings[name].controller) ?? 0;

      return Math.abs(keyboardValue) > Math.abs(controllerValue) ? keyboardValue : controllerValue;
    }

    throw new Error("Invalid keybinding name: " + name);
  }

  this.getInputDown = function(name) {
    if (bindings[name]) {
      var keyboardValue = 0;
      if (Array.isArray(bindings[name].keyboard)) {
        var a = renderer.getKeyDown(bindings[name].keyboard[0]) ? 1 : 0;
        var b = renderer.getKeyDown(bindings[name].keyboard[1]) ? 1 : 0;
        keyboardValue = b - a;
      }
      else {
        keyboardValue = renderer.getKeyDown(bindings[name].keyboard) ? 1 : 0;
      }

      var controllerValue = gamepadManager.getButtonDown(bindings[name].controller) ?? gamepadManager.getAxis(bindings[name].controller) ?? 0;

      return Math.abs(keyboardValue) > Math.abs(controllerValue) ? keyboardValue : controllerValue;
    }

    throw new Error("Invalid keybinding name: " + name);
  }
}

function Car(settings = {}) {
  var _this = this;

  var radPerSecToRPM = 30 / Math.PI;

  this.frozen = false;

  this.cameraMode = 0;
  this.camera = {
    followDistance: 5,
    followHeight: 0.4,
    followSpeed: 0.05,
    pitch: 0.15
  };

  this.engine = new Engine({
    torque: settings.torque
  });
  this.wheels = [];

  this.drivetrain = settings.drivetrain ?? "RWD";

  this.currentGear = 1;
  this.gearRatios = settings.gearRatios ?? [2.66, 1.78, 1.3, 1, 0.74];
  this.reverseGearRatio = settings.reverseGearRatio ?? 2.9;
  this.allGearRatios = [this.reverseGearRatio, ...this.gearRatios];

  this.differentialRatio = 3.42;

  var activateAutoCountersteer = true;
  var autoCountersteerMinVel = 2;
  var autoCountersteer = 0.6;
  var autoCountersteerVelocityMultiplier = 0.2;

  var maxSteerAngle = settings.maxSteerAngle ?? 35;

  this.ABS = false;
  this.TCS = false;

  var steerInput = 0;
  var driveInput = 0;
  var brakeInput = 0;
  var ebrakeInput = 0;

  var carWorldMatrix = Matrix.identity();
  var inverseWorldMatrix = Matrix.identity();

  var skidAudio = new Audio("./skid.wav");
  skidAudio.volume = 0;
  skidAudio.loop = true;

  window.addEventListener("click", function() {
    skidAudio.play();
  });

  var brakeMat;
  
  this.setup = async function(src) {
    this.gameObject = scene.add(await renderer.loadGLTF(src));
    this.rb = new Rigidbody();
    this.rb.position = new Vector(0, 1, 0);
    this.rb.mass = 1500;
    // this.rb.COMOffset.z += 0.25;

    var boxSize = {width: 1.73, height: 1, length: 3.81};
    this.rb.inertia = new Vector(
      this.rb.mass / 12 * (boxSize.height ** 2 + boxSize.length ** 2),
      this.rb.mass / 12 * (boxSize.width ** 2 + boxSize.length ** 2),
      this.rb.mass / 12 * (boxSize.height ** 2 + boxSize.width ** 2)
    );
    // this.rb.inertia = Vector.fill(this.rb.mass);

    // this.rb.gravityScale = 0;
    this.gameObject.addComponent(this.rb);
    // this.gameObject.addComponent(new SphereCollider(0.5, new Vector(0, 1, 0)));
    // this.gameObject.addComponent(new CapsuleCollider(2, new Vector(0, 0, -1), new Vector(0, 0, 1)));

    var wheelModel = this.gameObject.getChild("WheelModel", true);
    var staticWheelModel = this.gameObject.getChild("WheelModelStatic", true);
    var wheelObjects = [
      this.gameObject.getChild("WheelRR", true),
      this.gameObject.getChild("WheelRL", true),
      this.gameObject.getChild("WheelFR", true),
      this.gameObject.getChild("WheelFL", true)
    ];

    for (var i = 0; i < wheelObjects.length; i++) {
      var wheelObject = wheelObjects[i];
      var position = wheelObject.transform.position;
      // wheelObject.setParent(scene.root);

      this.gameObject.addComponent(new SphereCollider(0.6, Vector.add(position, new Vector(0, 0.5, 0))));

      this.wheels[i] = new Wheel(position, wheelObject, settings);
      this.wheels[i].skidmarks = wheelObject.addComponent(new renderer.TrailRenderer());

      if (wheelModel) {
        this.wheels[i].wheelModel = wheelObject.addChild(wheelModel.copy());
      }

      if (staticWheelModel) {
        this.wheels[i].staticWheelModel = wheelObject.addChild(staticWheelModel.copy());
      }
    }

    wheelModel?.delete();
    staticWheelModel?.delete();
  
    this.wheels[0].turn = false;
    this.wheels[1].turn = false;
    this.wheels[2].drive = false;
    this.wheels[3].drive = false;
    this.wheels[2].ebrake = false;
    this.wheels[3].ebrake = false;

    this.wheels[1].side = -1;
    this.wheels[3].side = -1;

    var camber = settings.rearCamber ?? 0;
    this.wheels[0].camberAngle = camber * -this.wheels[0].side;
    this.wheels[1].camberAngle = camber * -this.wheels[1].side;
    var camber = settings.frontCamber ?? 0;
    this.wheels[2].camberAngle = camber * -this.wheels[2].side;
    this.wheels[3].camberAngle = camber * -this.wheels[3].side;

    brakeMat = FindMaterials("tex_shiny", this.gameObject)[0];

    var smokeObject = new GameObject("Smoke");
    this.gameObject.addChild(smokeObject);
    var smoke = smokeObject.addComponent(new renderer.ParticleSystem(undefined, 700));

    smoke.material = renderer.CreateLitMaterial({
      albedoTexture: renderer.loadTexture("../assets/textures/smoke.png"),
      albedoColor: [2, 2, 2, 1],
    }, renderer.programContainers.particle);
    smoke.material.doubleSided = true;

    smoke.emitPosition = () => new Vector(0, 2, 0);
    smoke.emitVelocity = () => new Vector((Math.random() - 0.5), (Math.random() - 0.5) + 0.5, -2);
    smoke.startSize = () => Vector.fill(Math.random() * 0.4 + 0.2);
    smoke.endSize = () => Vector.fill(3);
    smoke.emitHealth = 5;
    smoke.gravityScale = 0;
    smoke.wind = () => Vector.zero();
    smoke.drag = 0.1;
    smoke.orientation = "faceCamera";
    this.smoke = smoke;
  }

  this.reset = function() {
    this.rb.position.y += 2;
    this.rb.velocity = Vector.zero();
    // this.rb.rotation = Quaternion.euler(0, Math.PI / 2, 0);
    // this.rb.angles = new Vector(0, this.rb.angles.y, 0);
    this.rb.angularVelocity = Vector.zero();

    this.currentGear = 1;
  }

  this.renderUI = function() {
    var center = {x: ui.width - 140, y: ui.height - 120};
    DrawGuage(this.engine.getRPM(), this.engine.minRPM, this.engine.maxRPM, center.x, center.y, 100);

    ui.setTextXAlign("center");
    ui.setTextYAlign("middle");
    ui.text(this.currentGear == 0 ? "R" : this.currentGear, center.x, center.y, 50, "white");
    ui.text(Math.abs(Math.floor(this.forwardVelocity * 3.6)), center.x, center.y + 50, 35, "white");
    ui.resetTextXAlign();
    ui.resetTextYAlign();

    // var x = ui.width / 2;
    // var y = ui.height / 2;
    // var scale = 10;
    // ui.line(x, y, x - this.sidewaysVelocity * scale, y - this.forwardVelocity * scale, 2, "lime");
  }

  this.update = function(dt) {
    // if (this.frozen) {
    //   return;
    // }

    if (keybindings.getInputDown("cameraMode")) {
      this.cameraMode++;
      if (this.cameraMode >= 3) {
        this.cameraMode = 0;
      }

      if (this.cameraMode == 0) {
        this.frozen = false;
        this.rb.frozen = false;
        mainCamera.setFOV(fov);

        cameraCarForward = Matrix.getForward(this.gameObject.transform.worldMatrix);
      }
      else if (this.cameraMode == 1) {
        mainCamera.setFOV(30);
      }
      else if (this.cameraMode == 2) {
        this.frozen = true;
        this.rb.frozen = true;
      }
    }

    if (this.frozen) {
      return;
    }

    if (keybindings.getInputDown("resetCar")) {
      car.reset();
    }

    if (keybindings.getInputDown("gearDown")) {
      this.currentGear--;
    }
    if (keybindings.getInputDown("gearUp")) {
      this.currentGear++;
    }
    this.currentGear = clamp(this.currentGear, 0, this.allGearRatios.length - 1);

    driveInput = clamp(keybindings.getInput("drive") + touchDriveInput, 0, 1);
    brakeInput = keybindings.getInput("brake");
    ebrakeInput += (keybindings.getInput("ebrake") - ebrakeInput) * 0.2;

    if (brakeMat) {
      if (brakeInput > 0) {
        brakeMat.setUniform("emissiveFactor", [200, 200, 200]);
      }
      else {
        brakeMat.setUniform("emissiveFactor", [0, 0, 0]);
      }
    }
  }

  this.fixedUpdate = function(fixedDeltaTime) {
    if (this.frozen) {
      return;
    }

    Matrix.copy(this.gameObject.transform.worldMatrix, carWorldMatrix);

    Matrix.inverse(carWorldMatrix, inverseWorldMatrix);
    Matrix.removeTranslation(inverseWorldMatrix);

    // var localVelocity = Matrix.transformVector(inverseWorldMatrix, this.rb.velocity);
    var localAngularVelocity = Matrix.transformVector(inverseWorldMatrix, this.rb.angularVelocity);

    var forward = Vector.negate(Matrix.getForward(carWorldMatrix));
    var sideways = Matrix.getRight(carWorldMatrix);

    var forwardVelocity = Vector.dot(this.rb.velocity, forward);
    this.forwardVelocity = forwardVelocity;
    var sidewaysVelocity = Vector.dot(this.rb.velocity, sideways);

    var slipAngle = -Math.atan2(sidewaysVelocity, Math.abs(forwardVelocity));
    if (isNaN(slipAngle) || !isFinite(slipAngle)) slipAngle = 0;

    var userInput = clamp(-deadZone(keybindings.getInput("steer"), 0.1) + tiltAngle / 45, -1, 1) * Math.exp(-Math.abs(forwardVelocity) / 80);
    // steerInput += -Math.sign(steerInput - userInput) * Math.min(Math.abs(steerInput - userInput), 0.05);
    steerInput += (userInput - steerInput) * 0.08;

    var acs = activateAutoCountersteer && (Math.abs(sidewaysVelocity) > 0.5 || forwardVelocity > autoCountersteerMinVel) ?
      -slipAngle / (maxSteerAngle / 180 * Math.PI) * autoCountersteer
      - localAngularVelocity.y * autoCountersteerVelocityMultiplier * Math.sign(forwardVelocity)
      : 0;
    var currentSteerInput = clamp(steerInput + acs, -1, 1);

    var lambdaAccumulated = new Array(this.wheels.length).fill(0);
    for (var count = 0; count < 5; count++) {
      var wheelIndex = 0;
      for (var wheel of this.wheels) {
        // Bruh
        var wheelWorldMatrix = wheel.model.transform.worldMatrix;
        var up = Matrix.getUp(wheelWorldMatrix);

        var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
        var wheelVelocity = this.rb.GetPointVelocity(worldPos);

        var ray = {origin: worldPos, direction: Vector.negate(up)};
        var hit = physicsEngine.Raycast(ray.origin, ray.direction).firstHit;

        // Bottom out
        if (hit && hit.distance < wheel.suspensionTravel + wheel.radius) {
          var furthestPoint = Vector.add(ray.origin, Vector.multiply(ray.direction, wheel.radius + wheel.stopLength));
          var C = -Vector.dot(Vector.subtract(hit.point, furthestPoint), hit.normal);

          if (C < 0) {
            wheel.isGrounded = true;

            var r = Vector.cross(Vector.subtract(furthestPoint, this.rb.position), hit.normal);

            var jacobian = [
              hit.normal.x,
              hit.normal.y,
              hit.normal.z,
              r.x,
              r.y,
              r.z
            ];

            var it = this.rb.inverseWorldInertia;

            var JM = [
              jacobian[0] / this.rb.mass,
              jacobian[1] / this.rb.mass,
              jacobian[2] / this.rb.mass,
              jacobian[3] * it[0],
              jacobian[4] * it[5],
              jacobian[5] * it[10]

              // jacobian[3] / this.rb.inertia.x,
              // jacobian[4] / this.rb.inertia.y,
              // jacobian[5] / this.rb.inertia.z
            ];

            var beta = 0.15;
            var bias = beta / fixedDeltaTime * (C);
            var JMJ = multiply1DMatrices(JM, jacobian);

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

            if (lambdaAccumulated[wheelIndex] + lambda < 0) {
              lambda = -lambdaAccumulated[wheelIndex];
            }
            lambdaAccumulated[wheelIndex] += lambda;

            this.rb.velocity = Vector.add(this.rb.velocity, Vector.multiply(new Vector(jacobian[0], jacobian[1], jacobian[2]), lambda / this.rb.mass));
            this.rb.angularVelocity = Vector.add(this.rb.angularVelocity, Matrix.transformVector(this.rb.inverseWorldInertia, Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda)));
            // this.rb.angularVelocity = Vector.add(this.rb.angularVelocity, divideVectorAndVector(Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda), this.rb.inertia));

            wheel.normalForce = Math.abs(lambdaAccumulated[wheelIndex] / fixedDeltaTime);
          }
        }

        wheelIndex++;
      }
    }

    for (var wheel of this.wheels) {
      var currentSteerAngle = wheel.turn ? currentSteerInput * maxSteerAngle * Math.PI / 180 : 0;

      // Turn wheel
      var m = Matrix.transform([
        ["translate", wheel.position],
        ["ry", currentSteerAngle]
      ]);
      wheel.model.transform.matrix = m;

      // Bruh
      var wheelWorldMatrix = wheel.model.transform.worldMatrix;
      var up = Matrix.getUp(wheelWorldMatrix);

      var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
      var wheelVelocity = this.rb.GetPointVelocity(worldPos);

      var ray = {origin: worldPos, direction: Vector.negate(up)};
      var hit = physicsEngine.Raycast(ray.origin, ray.direction).firstHit;
      wheel.isGrounded = hit && hit.distance < wheel.suspensionTravel + wheel.radius;

      // Change model transform
      if (wheel.wheelModel) {
        var modelTransform = wheel.wheelModel.transform;
        modelTransform.position = new Vector(wheel.camberAngle / 100, -(wheel.isGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel), 0);
        modelTransform.rotation = Quaternion.euler(wheel.angle * -wheel.side, wheel.side == 1 ? Math.PI : 0, wheel.camberAngle * Math.PI / 180);
      }
      if (wheel.staticWheelModel) {
        var modelTransform = wheel.staticWheelModel.transform;
        modelTransform.position = new Vector(wheel.camberAngle / 100, -(wheel.isGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel), 0);
        modelTransform.rotation = Quaternion.euler(0, wheel.side == 1 ? Math.PI : 0, wheel.camberAngle * Math.PI / 180);
      }

      if (wheel.isGrounded) {
        var rayDist = hit.distance;
        var contactPoint = hit.point;
        wheel.groundHit = hit;
        wheel.contactPoint = contactPoint;

        // Set skidmarks
        if (wheel.skidmarks) {
          wheel.skidmarks.emitPosition = Vector.add(Vector.add(contactPoint, new Vector(0, 0.01, 0)), Vector.multiply(wheelVelocity, fixedDeltaTime));
        }

        // Suspension
        var springError = wheel.suspensionTravel - (rayDist - wheel.radius);
        // var springError = 1 - (rayDist - wheel.radius) / wheel.suspensionTravel;
        var currentSpringForce = Vector.multiply(ray.direction, springError * -wheel.suspensionForce);
        var currentDampingForce = Vector.multiply(Vector.project(Vector.subtract(wheelVelocity, Vector.projectOnPlane(this.rb.velocity, hit.normal)), up), -wheel.suspensionDamping);
        var totalForce = Vector.add(currentSpringForce, currentDampingForce);
        this.rb.AddImpulseAtPosition(Vector.multiply(totalForce, fixedDeltaTime), worldPos);

        wheel.normalForce = Vector.length(totalForce);
        wheel.compressionAmount = clamp(springError / wheel.suspensionTravel, 0, 1);
      }
    }

    var highestSkidVolume = 0;

    var iters = 20;
    var dt = fixedDeltaTime / iters;
    for (var count = 0; count < iters; count++) {
      this.engine.fixedUpdate(dt);

      if (ebrakeInput < 0.5) {
        if (settings.differential == Car.ENUMS.DIFFERENTIAL.OPEN) {
          if (this.drivetrain == "RWD" || this.drivetrain == "AWD") {
            differentialConstraint(this.engine, this.wheels[0], this.wheels[1], dt, (this.currentGear == 0 ? -1 : 1) * this.allGearRatios[this.currentGear] * this.differentialRatio);
          }
          if (this.drivetrain == "FWD" || this.drivetrain == "AWD") {
            differentialConstraint(this.engine, this.wheels[2], this.wheels[3], dt, (this.currentGear == 0 ? -1 : 1) * this.allGearRatios[this.currentGear] * this.differentialRatio);
          }
        }
        else if (settings.differential == Car.ENUMS.DIFFERENTIAL.LOCKED) {
          if (this.drivetrain == "RWD" || this.drivetrain == "AWD") {
            gearConstraint(this.engine, this.wheels[0], dt, 1, 1 / ((this.currentGear == 0 ? -1 : 1) * this.allGearRatios[this.currentGear] * this.differentialRatio));
            gearConstraint(this.engine, this.wheels[1], dt, 1, 1 / ((this.currentGear == 0 ? -1 : 1) * this.allGearRatios[this.currentGear] * this.differentialRatio));
          }
          if (this.drivetrain == "FWD" || this.drivetrain == "AWD") {
            gearConstraint(this.engine, this.wheels[2], dt, 1, 1 / ((this.currentGear == 0 ? -1 : 1) * this.allGearRatios[this.currentGear] * this.differentialRatio));
            gearConstraint(this.engine, this.wheels[3], dt, 1, 1 / ((this.currentGear == 0 ? -1 : 1) * this.allGearRatios[this.currentGear] * this.differentialRatio));
          }
        }
      }

      for (var wheel of this.wheels) {
        var slipAngle = 0;
        var forwardVelocity = 0;

        // Bruh
        var wheelWorldMatrix = carWorldMatrix;//wheel.model.transform.worldMatrix;
        var up = Matrix.getUp(wheelWorldMatrix);
        var forward = Matrix.getForward(wheelWorldMatrix);
        var sideways = Matrix.getRight(wheelWorldMatrix);

        var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
        var wheelVelocity = this.rb.GetPointVelocity(worldPos);

        if (wheel.isGrounded) {
          // Friction
          // wheelVelocity = this.rb.GetPointVelocity(wheel.contactPoint);

          forwardVelocity = Vector.dot(wheelVelocity, forward);
          var sidewaysVelocity = Vector.dot(wheelVelocity, sideways);

          var roadFriction = 1;

          // wheel.angularVelocity += currentDriveTorque / wheel.inertia * dt;

          var currentSteerAngle = wheel.turn ? currentSteerInput * maxSteerAngle * Math.PI / 180 : 0;
          slipAngle = -Math.atan(sidewaysVelocity / Math.abs(forwardVelocity)) - currentSteerAngle * Math.sign(forwardVelocity);
          if (isNaN(slipAngle) || !isFinite(slipAngle)) slipAngle = 0;
          var a = slipAngle / wheel.slipAnglePeak;

          // // TCS
          // if (this.TCS && Math.abs(currentDriveTorque) > 0.01 && Math.abs(forwardVelocity) > 0.5) {
          //   var TCStargetSlip = -wheel.slipRatioPeak * Math.sqrt(Math.max(0.01, 1 - a * a)) * Math.sign(forwardVelocity);
          //   var targetAngularVelocity = (TCStargetSlip * Math.abs(forwardVelocity) - forwardVelocity) / wheel.radius;
          //   wheel.angularVelocity = clamp(wheel.angularVelocity, -Math.abs(targetAngularVelocity), Math.abs(targetAngularVelocity));
          // }

          var slipRatio = -(wheel.angularVelocity * wheel.radius + forwardVelocity) / Math.abs(forwardVelocity) * Math.min(Math.abs(forwardVelocity) / 4, 1);
          if (isNaN(slipRatio)) slipRatio = 0;
          if (!isFinite(slipRatio)) slipRatio = Math.sign(slipRatio);
          var s = slipRatio / wheel.slipRatioPeak;

          var rho = Math.sqrt(s * s + a * a);

          var Fx = (_slipRatio) => {
            return magicFormula(_slipRatio, wheel.slipRatioCoeffs) * roadFriction * wheel.friction * wheel.forwardFriction;
          }
          var Fy = ( _slipAngle) => {
            return magicFormula(_slipAngle * 180 / Math.PI - wheel.camberAngle * wheel.camberAngleCoeff, wheel.slipAngleCoeffs) * roadFriction * wheel.friction * wheel.sidewaysFriction;
          }

          var finalForceX = s / rho * Fx(rho * wheel.slipRatioPeak) * wheel.normalForce;
          var finalForceY = a / rho * Fy(rho * wheel.slipAnglePeak) * wheel.normalForce;

          if (!isNaN(finalForceX)) {
            var contactVelocity = (wheel.angularVelocity * wheel.radius + forwardVelocity);
            var maxForceToResolveFriction = Math.abs(contactVelocity / (wheel.radius * wheel.radius) * wheel.inertia / dt);
            var maxFriction = Math.abs(finalForceX);
            var frictionForce = Math.min(maxFriction, maxForceToResolveFriction) * -Math.sign(finalForceX);
            wheel.angularVelocity -= (frictionForce * wheel.radius) / wheel.inertia * dt;

            // wheel.angularVelocity -= (-finalForceX * wheel.radius) / wheel.inertia * dt;
          }
          
          var driveForwardVector = Quaternion.QxV(Quaternion.angleAxis(-Math.PI / 2, sideways), wheel.groundHit.normal);
          // var driveForwardVector = forward;//Quaternion.AngleAxis(-90, sideways) * groundHit.normal;
          if (!isNaN(finalForceX)) this.rb.AddImpulseAtPosition(Vector.multiply(driveForwardVector, finalForceX * dt), wheel.contactPoint);
          if (!isNaN(finalForceY)) this.rb.AddImpulseAtPosition(Vector.multiply(sideways, finalForceY * dt), wheel.contactPoint);

          if (ebrakeInput > 0.1 && wheel.ebrake) {
            // wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - ebrakeInput);

            var brakeTorque = 4000;
            wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(ebrakeInput * brakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
          }

          if (brakeInput != 0) {
            if (this.ABS) {
              var targetSlip = wheel.slipRatioPeak * Math.sqrt(Math.max(0.01, 1 - a * a)) * Math.sign(forwardVelocity);
              var w = lerp(-forwardVelocity / wheel.radius, (targetSlip * Math.abs(forwardVelocity) - forwardVelocity) / wheel.radius, brakeInput);

              wheel.angularVelocity = Math.abs(forwardVelocity) < 1 ? 0 : w;
            }
            else {
              var brakeTorque = 700;//2000;
              wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(brakeInput * brakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
              // wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - brakeInput);
            }
          }
        }

        var skidVolume = (Math.abs(slipAngle) > 0.2 || Math.abs(slipRatio) > 0.2) && Math.abs(forwardVelocity) > 0.5 ? (clamp(Math.abs(slipRatio) - 0.2, 0, 1) + clamp((Math.abs(slipAngle) - 0.2) * (1 - Math.exp(-Math.abs(forwardVelocity) * 0.02)), 0, 1)) * 0.5 : 0;
        if (skidVolume > highestSkidVolume) {
          highestSkidVolume = skidVolume;
        }

        if (wheel.skidmarks) {
          wheel.skidmarks.emit = clamp(skidVolume * 20 * (wheel.isGrounded ? 1 : 0.01), 0, 0.7);
        }

        wheel.slipRatio = slipRatio;
      }
    }

    var forward = Vector.negate(Matrix.getForward(carWorldMatrix));
    var forwardVelocity = Vector.dot(this.rb.velocity, forward);

    for (var wheel of this.wheels) {
      wheel.angle += wheel.angularVelocity * fixedDeltaTime;

      if (wheel.isGrounded) {
        var speedDiff = wheel.angularVelocity * wheel.radius - forwardVelocity;
        if (Math.abs(speedDiff) > 5) {
          var up = Matrix.getUp(carWorldMatrix);
          var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
          Vector.addTo(worldPos, Vector.multiply(up, -wheel.radius));
          this.smoke.emitPosition = () => worldPos;

          var sideways = Matrix.getRight(carWorldMatrix);
          var driveForwardVector = Quaternion.QxV(Quaternion.angleAxis(-Math.PI / 2, sideways), wheel.groundHit.normal);
          var [ tangent, bitangent ] = Vector.formOrthogonalBasis(driveForwardVector);
          var basis = Matrix.basis(tangent, bitangent, driveForwardVector);

          this.smoke.emitVelocity = () => {
            var v = new Vector((Math.random() - 0.5), (Math.random() - 0.5), 2);
            v = Matrix.transformVector(basis, v);
            v.y += 0.5;
            return v;
          };
          
          this.smoke.emit();
        }
      }
    }

    this.rb.angularVelocity.x *= 0.995;
    this.rb.angularVelocity.y *= 0.995;
    this.rb.angularVelocity.z *= 0.995;

    skidAudio.volume += (highestSkidVolume - skidAudio.volume) * 0.1;

    // updateEngineRPM();
  }

  function updateEngineRPM() {
    // var angularVelocities = 0;
    // for (var wheel of _this.wheels) {
    //   if (wheel.drive) {
    //     angularVelocities += Math.abs(wheel.angularVelocity);
    //   }
    // }

    // var driveWheels = 2;
    // _this.engine.angularVelocity = angularVelocities / driveWheels * _this.allGearRatios[_this.currentGear] * _this.differentialRatio;
    // _this.engine.angularVelocity = clamp(_this.engine.angularVelocity, _this.engine.minRPM / radPerSecToRPM, _this.engine.maxRPM / radPerSecToRPM);
  }

  function Engine(settings = {}) {
    this.torque = settings.torque ?? 300;
    this.minRPM = 0;
    this.maxRPM = 8000;
    this.rpmLimiterDelay = 50;

    this.angularVelocity = 0;
    this.inertia = 0.15 * 3 / 3;
    this.friction = 50;

    this.canThrottle = true;
    var throttleTimeout = null;

    var context;
    var hasLoadedSound = false;
    var rpmChange = 1;
    var samples = [
      { rpm: 1500, on: "./engineSound/i6/low_on.wav" },
      { rpm: 4000, on: "./engineSound/i6/med_on.wav" },
      { rpm: 7000, on: "./engineSound/i6/high_on.wav" }
    ];

    window.addEventListener("click", function() {
      if (!hasLoadedSound) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        context = new AudioContext();

        for (var i of samples) {
          (function(i) {
            loadSample(i.on).then(sample => {
              var { source, gainNode } = playSample(sample);
              i.onSource = source;
              i.onGain = gainNode;
          
              gainNode.gain.value = 0;
            });
          })(i);
        }

        hasLoadedSound = true;
      }
    });

    this.fixedUpdate = function(dt) {
      var currentTorque = this.torqueLookup(this.getRPM()) * this.torque;

      if (this.getRPM() >= this.maxRPM) {
        this.canThrottle = false;

        clearTimeout(throttleTimeout);
        throttleTimeout = setTimeout(() => {
          this.canThrottle = true;
        }, this.rpmLimiterDelay);
      }

      if (this.canThrottle) {
        var targetRPM = driveInput * this.maxRPM;

        // if (this.getRPM() < targetRPM) {
          this.angularVelocity += driveInput * /*clamp(Math.abs(this.getRPM() - targetRPM) / 500, 0, 1) **/ currentTorque / this.inertia * dt;
        // }

        if (driveInput && this.getRPM() > this.maxRPM) {
          this.angularVelocity = this.maxRPM / radPerSecToRPM + 10;
        }

        rpmChange -= (rpmChange - driveInput) * 0.01;
      }
      else {
        rpmChange -= (rpmChange - 0) * 0.01;
      }

      this.angularVelocity += Math.min(Math.abs(this.angularVelocity), this.friction / this.inertia * dt) * -Math.sign(this.angularVelocity);
    
      var rpm = clamp(this.getRPM(), 800, this.maxRPM);
      for (var sample of samples) {
        if (sample.onSource && sample.onGain) {
          var g = Math.exp(-(10 ** (-6.7)) * Math.pow(rpm - sample.rpm, 2)) * (Math.max(0, rpmChange) * 2 / 3 + 1 / 3) * 0.3;
          if (isFinite(g)) {
            sample.onGain.gain.value = g;
          }
          var pbr = rpm / sample.rpm;
          if (isFinite(pbr)) {
            sample.onSource.playbackRate.value = pbr;
          }
        }
      }
    }

    this.getRPM = function() {
      return this.angularVelocity * radPerSecToRPM;
    }

    this.torqueLookup = function(rpm) {
      return (-Math.pow(Math.abs((rpm - 4600) / 145), 1.4) + 309) / 309;
    }

    function loadSample(url) {
      return fetch(url)
        .then(response => response.arrayBuffer())
        .then(buffer => context.decodeAudioData(buffer));
    }
    
    function playSample(sample) {
      var gainNode = context.createGain();
      gainNode.connect(context.destination);
    
      const source = context.createBufferSource();
      source.buffer = sample;
      source.loop = true;
      source.connect(gainNode);
      source.start(0);
    
      return {
        source,
        gainNode
      };
    }
  }

  function Wheel(position = Vector.zero(), model, settings = {}) {
    this.position = position;
    this.model = model;
    this.side = 1;

    this.friction = settings.friction ?? 1.5;
    this.forwardFriction = settings.forwardFriction ?? 1;
    this.sidewaysFriction = settings.sidewaysFriction ?? 1.5;
    this.radius = settings.radius ?? 0.35;
    this.camberAngle = 0;
    this.camberAngleCoeff = settings.camberAngleCoeff ?? 1;

    this.stopLength = settings.stopLength ?? 0.01;
    this.suspensionTravel = settings.suspensionTravel ?? 0.2;
    this.suspensionDamping = settings.suspensionDamping ?? 2500;
    this.suspensionForce = settings.suspensionForce ?? 50000;

    this.angle = 0;
    this.angularVelocity = 0;
    this.mass = settings.mass ?? 20;
    this.inertia = this.mass * this.radius * this.radius / 2;

    this.slipRatioCoeffs = settings.slipRatioCoeffs ?? [16, 1.5, 1.1, -1.4];
    this.slipAngleCoeffs = settings.slipAngleCoeffs ?? [0.2/*0.15*/, 1.5, 1.1, -1.4];

    this.slipRatioPeak = findPeak(x => {
      return magicFormula(x, this.slipRatioCoeffs);
    });

    this.slipAnglePeak = findPeak(x => {
      return magicFormula(x * 180 / Math.PI - this.camberAngle * this.camberAngleCoeff, this.slipAngleCoeffs);
    });

    this.drive = true;
    this.turn = true;
    this.ebrake = true;

    this.isGrounded = false;
    this.normalForce = 0;
  }

  function gearConstraint(a, b, dt, ra, rb) {
    var biasFactor = 0;
    var maxImpulse = Infinity;
    var C = a.angle / ra - b.angle / rb;
    var jacobian = [1 / ra, -1 / rb];
    var velocities = [a.angularVelocity, b.angularVelocity];
    var inertias = [a.inertia, b.inertia];

    var { impulses } = physicsEngine.getConstraintImpulse(jacobian, velocities, inertias, C, dt, biasFactor);

    a.angularVelocity += impulses[0] / a.inertia;
    b.angularVelocity += impulses[1] / b.inertia;
  }

  function differentialConstraint(m, a, b, dt, radius) {
    var biasFactor = 0;
    var maxImpulse = Infinity;
    var C = 0;
    var jacobian = [0.5, 0.5, -1 / radius];
    var velocities = [a.angularVelocity, b.angularVelocity, m.angularVelocity];
    var inertias = [a.inertia, b.inertia, m.inertia];

    var { impulses } = physicsEngine.getConstraintImpulse(jacobian, velocities, inertias, C, dt, biasFactor);

    a.angularVelocity += impulses[0] / a.inertia;
    b.angularVelocity += impulses[1] / b.inertia;
    m.angularVelocity += impulses[2] / m.inertia;
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
Car.ENUMS = {
  DIFFERENTIAL: { OPEN: 0, LOCKED: 1, LSD: 2 }
};

/*

  Controller helpers

*/

function deadZone(x, zone = 0.1) {
  if (Math.abs(x) < zone) {
    return 0;
  }

  return x;
}

function quadraticCurve(x) {
  return Math.abs(x) * x;
}

function DebugLines() {
  var matrices = [];
  var gl = renderer.gl;

  this.drawMode = gl.TRIANGLES;
  this.material = renderer.CreateLitMaterial({albedoTexture: renderer.loadTexture("../assets/textures/snowParticle.png"), albedoColor: [2, 2, 2, 1]/*[40, 10, 5, 1]*/}, renderer.programContainers.unlitInstanced);
  this.meshData = renderer.getParticleMeshData();

  this.matrixBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
  // gl.bufferData(gl.ARRAY_BUFFER, this.matrixData, gl.DYNAMIC_DRAW);

  this.clear = function() {
    matrices = [];
  }

  this.drawVector = function(origin, direction, len, color) {
    matrices.push(Matrix.translate(origin));
  }

  this.render = function(camera) {
    var matrixData = new Float32Array(matrices.length * 16);
    for (var i = 0; i < matrices.length; i++) {
      matrixData.set(matrices[i], i * 16);
    }

    gl.useProgram(this.material.program);
    this.meshData.bindBuffers(this.material.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
    const matrixLoc = gl.getAttribLocation(this.material.program, 'modelMatrix'); //Bruh
    for (var j = 0; j < 4; j++) {
      const loc = matrixLoc + j;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 4 * 16, j * 16);
      gl.vertexAttribDivisor(loc, 1);
    }

    this.material.bindUniforms(camera);

    gl.drawElementsInstanced(this.drawMode, this.meshData.indices.length, this.meshData.indexType, 0, matrices.length);
  }
}

function SetupEvents() {
  renderer.disableContextMenu();
  renderer.disablePinchToZoom();

  renderer.on("mousemove", function(e) {
    if (renderer.isPointerLocked()) {
      cameraEulerAngles.x -= e.movementY * 0.002;
      cameraEulerAngles.y -= e.movementX * 0.002;
    }
  });

  function touchEvent(e) {
    touchDriveInput = 0;
    for (var touch of e.touches) {
      console.log(touch);
      // if (touch.clientX > renderer.canvas.width / 2) {
        touchDriveInput = 1;
      // }
    }

    e.preventDefault();
  }

  renderer.canvas.addEventListener("touchstart", touchEvent);
  renderer.canvas.addEventListener("touchmove", touchEvent);

  renderer.canvas.addEventListener("touchend", function(e) {
    if (e.touches.length == 0) {
      touchDriveInput = 0;
    }
  });

  window.addEventListener("click", function() {
    requestDeviceOrientation();
  });

  function requestDeviceOrientation() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // Handle iOS 13+ devices.
      DeviceOrientationEvent.requestPermission()
        .then((state) => {
          if (state === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          } else {
            console.error('Request to access the orientation was rejected');
          }
        })
        .catch(console.error);
    } else {
      // Handle regular non iOS 13+ devices.
      window.addEventListener('deviceorientation', handleOrientation);
    }
  }

  function handleOrientation(e) {
    tiltAngle = e.beta;
    renderer.canvas.style.transform = "rotate(" + (-e.beta) + "deg)";
  }
}

function getFrameTime() {
  var now = performance.now();
  var frameTime = (now - lastUpdate) / 1000;
  lastUpdate = now;

  return frameTime;
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : null;
}

function setLoadingStatus(str) {
  if (!anyError) {
    loadingStatus.innerText = str;
  }
}

function setError(str) {
  setLoadingStatus(str);
  anyError = true;
  loader.style.display = "none";
  loadingScreen.style.display = "flex";
  cancelAnimationFrame(rafID);
}