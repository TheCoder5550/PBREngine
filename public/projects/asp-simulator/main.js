import { Car, DefaultCarController } from "../../car.js";
import * as carSettings from "../../cardemo/carSettings.mjs";
import { CatmullRomCurve } from "../../engine/curves.mjs";
import { GameObject } from "../../engine/gameObject.mjs";
import { clamp01, loadImage, mapValue } from "../../engine/helper.mjs";
import Matrix from "../../engine/matrix.mjs";
import Perlin from "../../engine/perlin.mjs";
import { MeshCollider, PhysicsEngine } from "../../engine/physics.mjs";
import Quaternion from "../../engine/quaternion.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import Terrain from "../../engine/terrain.mjs";
import Vector from "../../engine/vector.mjs";
import GLDebugger from "../../engine/GLDebugger.mjs";
import { AudioListener3D } from "../../engine/audioListener3D.mjs";
import TreeHandler from "../../engine/treeHandler.mjs";
import PRNG from "../../PRNG.mjs";
import * as roadShaderSource from "./roadShader.glsl.mjs";
import Tonemapper from "../../engine/postprocessing-effects/tonemapper.mjs";
import FXAA from "../../engine/postprocessing-effects/fxaa.mjs";
import Vignette from "../../engine/postprocessing-effects/vignette.mjs";
import Motionblur from "../../engine/postprocessing-effects/motionBlur.mjs";
import Bloom from "../../engine/postprocessing-effects/bloom.mjs";

const ui = document.querySelector(".ui");
const mphLabel = document.querySelector("#mph");
const brakesStatus = document.querySelector("#brakesStatus");
const lightsStatus = document.querySelector("#lightsStatus");
const sirenStatus = document.querySelector("#sirenStatus");
const autoPilotSign = document.querySelector("#autopilot");

const perlin = new Perlin();
const seed = "apples";
const prng = new PRNG(seed);

const renderer = window.renderer = new Renderer({
  path: "../../",
});
renderer.disableContextMenu();

const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({
  hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed",
  res: 512
});

const pp = renderer.postprocessing;
// pp.addEffect(new RenderScene());
pp.addEffect(new Motionblur());
pp.addEffect(new Bloom());
pp.addEffect(new Tonemapper());
pp.addEffect(new FXAA());
pp.addEffect(new Vignette());

// // Make it night
// scene.environmentIntensity = 0.01;
// scene.sunIntensity = Vector.fill(0.01);
// scene.fogColor = [0, 0, 0, 1];

window.Debug = new GLDebugger(scene, 1000);

const physicsEngine = new PhysicsEngine(scene);
// physicsEngine.multipleTimestepsPerFrame = false;

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContext();
const audioListener3D = new AudioListener3D(audioContext);

// Police car setup
const car = await createCar();
const lightController = new LightController(car);
const sirenController = new SirenController();
// ----------------

// AI Car
const AICar = await createAICar();
// ----------------

const camera = car.mainCamera;

// World building
const terrain = await createTerrain();
const allMaterials = await createMaterials();

const treeHandler = await createTrees();

const bridge = await renderer.loadGLTF("./bridge.glb");
const track = await generateTrack({
  terrain,
  materials: allMaterials,
});
// ----------------

car.carController.followCurve = track.curve;
AICar.carController.followCurve = track.curve;

setupPlayerCar(car);
setupAICar(AICar);

const startTime = new Date();
renderer.on("renderloop", (frameTime) => {
  // window.Debug.DrawOctree(track.gameObject.children[0].getComponent("MeshCollider").octree);

  if (renderer.getKeyDown(76)) { // l
    lightController.toggle();
  }
  if (renderer.getKeyDown(79)) { // o
    sirenController.toggle();
  }

  terrain.update(camera.transform);
  
  // AICar.update(frameTime);
  // car.update(frameTime);
  updateStatusBar();

  // Reset game
  if (car.carController.defaultCarController.keybindings.getInput("resetGame")) {
    resetGame();
  }

  physicsEngine.update();

  // Set audio listener spatial position
  audioListener3D.setPosition(camera.transform.position);
  audioListener3D.setDirection(camera.transform.forward, camera.transform.up);

  renderer.update(frameTime);
  renderer.render(camera);
});

/*
  Cars
*/

async function createAICar(followCurve) {
  const carBase = carSettings.tocus;

  const car = new Car(scene, physicsEngine, {
    ...carBase.settings,

    audioContext: audioContext,
    audioListener: audioListener3D,

    drivetrain: "RWD",
    gearChangeTime: 0.15,
    transmission: "AUTOMATIC",
    ABS: true,
    TCS: true,
    // activateAutoCountersteer: false,
    autoCountersteer: 0.2,
    autoCountersteerVelocityMultiplier: 0.1
  });
  car.carController = new AICarController(car, {
    followCurve,
  });
  await car.setup(renderer.path + carBase.model.slice(3));

  car.rb.position.y = 15;
  car.resetPosition = new Vector(0, 15, 0);

  return car;
}

async function createCar(followCurve) {
  const carBase = carSettings.ranger;

  const car = new Car(scene, physicsEngine, {
    ...carBase.settings,

    audioContext: audioContext,
    audioListener: audioListener3D,
    
    mass: 2500,
    antiRoll: 25_000,
    steerSpeed: 0.05,
    steerVelocity: 45,
    gearChangeTime: 0.15,
    transmission: "AUTOMATIC",
    ABS: true,
    TCS: true,

    camera: {
      followDistance: 5,
      followHeight: 0.25,
      pitch: 0.1,
    },
  });
  car.carController = new PlayerCarController(car, {
    followCurve
  });
  await car.setup("./ford range police.glb");

  car.rb.position.y = 15;
  car.resetPosition = new Vector(0, 15, 0);

  return car;
}

function setupPlayerCar(car) {
  // Blank slate
  car.resetGame();
  
  // Not in pursuit at start
  lightController.stop();
  sirenController.stop();

  // Enable autopilot
  car.carController.userControlled = false;

  // Place car in slow lane (lane 1)
  car.rb.position.z = 50;

  const { t } = track.curve.distanceSqrToPoint(car.rb.position);
  const tangent = track.curve.getTangent(t);
  const normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());
  Vector.multiplyTo(normal, 5 + 4.5 + 9 * 2);
  
  const target = track.curve.getPoint(t);
  Vector.addTo(target, normal);

  target.y = terrain.getHeight(target.x, target.z);
  target.y += 3;
  target.y -= car.bottomOffset.y;

  // car.resetPosition = Vector.copy(target);
  car.rb.position = target;
  
  // Pre-start at 65 mph
  const targetSpeed = 65 / 2.23693629;
  car.rb.velocity.z = targetSpeed;
  car.engine.angularVelocity = targetSpeed * car.allGearRatios[3] * car.differentialRatio / car.wheels[0].radius;
  console.log(car.engine.angularVelocity, "-------");

  for (const wheel of car.wheels) {
    wheel.angularVelocity = targetSpeed / car.wheels[0].radius;
  }
}

function setupAICar(car) {
  // Blank slate
  car.resetGame();

  // Place car in fast lane (lane 3)
  car.rb.position.z = -50;

  const { t } = track.curve.distanceSqrToPoint(car.rb.position);
  const tangent = track.curve.getTangent(t);
  const normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());
  Vector.multiplyTo(normal, 5 + 4.5 + 9 * 0);
  
  const target = track.curve.getPoint(t);
  Vector.addTo(target, normal);
  target.y = 8;
  car.rb.position = target;
  
  // Pre-start at target speed
  car.rb.velocity.z = car.carController.targetSpeed / 2.23693629;
}

function AICarController(car, settings = {}) {
  this.followCurve = settings.followCurve;
  this.targetSpeed = settings.targetSpeed ?? 100; // mph

  let lastSpeed = 0;

  this.setInputs = function() {
    const currentSpeed = car.getMPH();
    const acceleration = currentSpeed - lastSpeed;

    car.setBrakeInput(0);
    car.setEbrakeInput(0);
    car.setRawSteerInput(0);

    const { t } = this.followCurve.distanceSqrToPoint(car.rb.position);
    const targetT = t + currentSpeed / this.followCurve.length;

    const tangent = this.followCurve.getTangent(targetT);
    const normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());

    const totalTime = (new Date() - startTime) / 1000;

    const centerWidth = 25;
    const totalRoadWidth = 27;
    const lanes = 3;
    const lane = Math.floor((totalTime / 15) % lanes);
    const totalLanesWidth = (1 - 0.1 - 0.15) * totalRoadWidth;
    const laneWidth = totalLanesWidth / lanes;
    const offset = centerWidth / 2 + totalRoadWidth * 0.1 + mapValue(lane, 0, lanes - 1, laneWidth / 2, totalLanesWidth - laneWidth / 2);

    Vector.multiplyTo(normal, offset);

    const target = this.followCurve.getPoint(targetT);
    Vector.addTo(target, normal);
    
    const flatTarget = Vector.copy(target);
    flatTarget.y = 0;

    const flatPosition = Vector.copy(car.rb.position);
    flatPosition.y = 0;

    const right = Matrix.getRight(car.gameObject.transform.worldMatrix);
    const toTarget = Vector.normalize(Vector.subtract(flatTarget, flatPosition));

    const rawSteerInput = Vector.dot(right, toTarget) * 5;

    car.setDriveInput((this.targetSpeed - currentSpeed) * 0.3 - acceleration * 0.01);
    car.setRawSteerInput(rawSteerInput);

    lastSpeed = currentSpeed;
  };
}

function PlayerCarController(car, settings = {}) {
  this.defaultCarController = new DefaultCarController(car, {
    controlScheme: DefaultCarController.ControlScheme.Keyboard,
  });

  this.userControlled = false;

  this.followCurve = settings.followCurve;
  this.targetSpeed = 65;
  this.lane = 2;

  let lastSpeed = 0;

  this.setInputs = function() {
    if (this.defaultCarController.keybindings.getInput("drive")) {
      this.userControlled = true;
    }

    if (this.userControlled) {
      this.defaultCarController.setInputs();
      return;
    }

    const currentSpeed = car.getMPH();
    const acceleration = currentSpeed - lastSpeed;

    car.setBrakeInput(0);
    car.setEbrakeInput(0);
    car.setRawSteerInput(0);

    const { t } = this.followCurve.distanceSqrToPoint(car.rb.position);
    const targetT = t + currentSpeed / this.followCurve.length;

    const tangent = this.followCurve.getTangent(targetT);
    const normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());
    Vector.multiplyTo(normal, 5 + 4.5 + 9 * this.lane);

    const target = this.followCurve.getPoint(targetT);
    Vector.addTo(target, normal);
    
    const flatTarget = Vector.copy(target);
    flatTarget.y = 0;

    const flatPosition = Vector.copy(car.rb.position);
    flatPosition.y = 0;

    const right = Matrix.getRight(car.gameObject.transform.worldMatrix);
    const toTarget = Vector.normalize(Vector.subtract(flatTarget, flatPosition));

    const rawSteerInput = Vector.dot(right, toTarget) * 5;

    car.setDriveInput((this.targetSpeed - currentSpeed) * 0.3 - acceleration * 0.01);
    car.setRawSteerInput(rawSteerInput);

    lastSpeed = currentSpeed;
  };
}

function SirenController() {
  /** @type HTMLAudioElement */
  let policeSirenAudio = null;

  let on = false;

  this.isOn = function() {
    return on;
  };

  this.start = function() {
    if (!policeSirenAudio) {
      policeSirenAudio = new Audio("./police-siren.mp3");
      policeSirenAudio.loop = true;
      policeSirenAudio.volume = 0.5;
    }

    policeSirenAudio.currentTime = 0;
    policeSirenAudio.play();
  };

  this.stop = function() {
    if (policeSirenAudio) {
      policeSirenAudio.pause();
      policeSirenAudio.currentTime = 0;
    }
  };

  this.toggle = function() {
    on = !on;

    if (on) {
      this.start();
    }
    else {
      this.stop();
    }
  };
}

function LightController(car) {
  const redLight = car.gameObject.getChild("RedLight")?.children[0].getComponent("Light");
  const blueLight = car.gameObject.getChild("BlueLight")?.children[0].getComponent("Light");
  const whiteLight = car.gameObject.getChild("WhiteLight")?.children[0].getComponent("Light");
  const leftOrangeLight = car.gameObject.getChild("OrangeLeftLight")?.children[0].getComponent("Light");
  const rightOrangeLight = car.gameObject.getChild("OrangeRightLight")?.children[0].getComponent("Light");

  if (redLight) redLight.color = [0, 0, 0];
  if (blueLight) blueLight.color = [0, 0, 0];
  if (whiteLight) whiteLight.color = [0, 0, 0];
  if (leftOrangeLight) leftOrangeLight.color = [0, 0, 0];
  if (rightOrangeLight) rightOrangeLight.color = [0, 0, 0];

  let on = false;
  let interval = null;

  this.isOn = function() {
    return on;
  };

  this.start = function() {
    on = true;

    let count = 0;
    let side = false;
    let lightState = false;
    const f = () => {
      count++;
      if (count === 6) {
        count = 0;
        side = !side;
      }

      lightState = !lightState;
      if (redLight) redLight.color = side && lightState ? [100, 0, 0] : [0, 0, 0];
      if (blueLight) blueLight.color = !side && lightState ? [0, 0, 100] : [0, 0, 0];
    };

    f();
    interval = setInterval(f, 100);
  };

  this.stop = function() {
    on = false;

    if (redLight) redLight.color = [0, 0, 0];
    if (blueLight) blueLight.color = [0, 0, 0];

    clearInterval(interval);
  };

  this.toggle = function() {
    on = !on;

    if (on) {
      this.start();
    }
    else {
      this.stop();
    }
  };
}

/*
  World
*/

async function createTerrain() {
  const terrain = new Terrain(scene, {
    terrainSize: 100_000,
  });
  terrain.chunkRes = 11;

  // terrain.makeDataAccessible({
  //   clamp,
  //   lerp,
  //   imageData,
  //   imageRes,
  //   maxHeight
  // });

  terrain.getHeight = function(i, j) {
    var power = 3;
    var noiseLayers = 2;
    var noiseScale = 0.001;
    var height = 100;

    var elevation = Math.pow(Math.abs(LayeredNoise(i * noiseScale, j * noiseScale, noiseLayers)), power) * height;

    return elevation;
  };

  await terrain.loadMaterials();

  return terrain;
}

async function createTrees() {
  const treeHandler = new TreeHandler(scene, car.mainCamera);
  // await treeHandler.addVariant(renderer.path + "assets/models/trees/myFirstTreeLOD/myFirstTreeLOD.glb", [
  //   40,
  //   80,
  //   Infinity
  // ]);

  await treeHandler.addVariant(renderer.path + "assets/models/trees/oak1/oak1LODs.glb", [
    40,
    Infinity
  ]);

  return treeHandler;
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

async function generateTrack(settings = {}) {
  const materials = settings.materials;
  const trackWidth = settings.trackWidth ?? 27;
  const centerWidth = 25;
  const terrain = settings.terrain;

  const parent = new GameObject("Track");
  let points = [];

  const point = Vector.zero();
  let angle = Math.PI * 0.5;
  let angularVelocity = 0;
  const r = 75;

  // const velocity = new Vector(0, 0, 5);

  // The spline starts at the second point
  points.push(new Vector(0, 0, -50));
  points.push(new Vector(0, 0, -40));

  for (let i = 0; i < 100; i++) {
    points.push(Vector.copy(point));

    // const dir = terrain.directionOfLeastChange(point.x, point.y);
    // Vector.addTo(velocity, Vector.multiply(dir, 10));
    // // Vector.multiply(velocity, 50 / Vector.length(velocity));
    // Vector.addTo(point, velocity);

    Vector.addTo(point, new Vector(
      Math.cos(angle) * r,
      0,
      Math.sin(angle) * r
    ));

    angle += angularVelocity;
    angularVelocity += (Math.random() - 0.5) * 2 * Math.PI / 180 * 10 - angularVelocity * 0.2 - angle * 0.1;
  }

  // points = points.filter((_, index) => index < 5 || index % 10 === 0);

  const roadCurve = new CatmullRomCurve(points, 0.5, false);

  // Road
  const leftRoad = extrudeCurve(roadCurve, [
    [
      { x: -trackWidth - centerWidth / 2, y: 0.05 },
      { x: -centerWidth / 2, y: 0.05 },
    ], [
      { x: centerWidth / 2, y: 0.05 },
      { x: trackWidth + centerWidth / 2, y: 0.05 },
    ]
    //   { x: -centerWidth / 2, y: 0.05 },
    //   { x: -centerWidth / 2, y: -50 },
    //   { x: centerWidth / 2, y: -50 },
    //   { x: centerWidth / 2, y: 0.05 },

    //   { x: centerWidth / 2, y: 0.05 },
    //   { x: trackWidth + centerWidth / 2, y: 0.05 },
    // ], [

    // ]
  ], {
    material: materials.roadMaterial,
    segments: 300 * 10,
    uvScale: [1, 1 / trackWidth],
    terrain,
  });
  parent.addChild(leftRoad);

  // // Barriers
  // const barriers = extrudeCurve(roadCurve, [
  //   { x: -trackWidth / 2 - 3, y: -1 },
  //   { x: -trackWidth / 2 - 3, y: 1 },
  //   { x: -trackWidth / 2 + 0.5 - 3, y: 1 },
  //   { x: -trackWidth / 2 + 0.5 - 3, y: -1 },
    
  //   { x: trackWidth / 2 - 0.5 + 3, y: -1 },
  //   { x: trackWidth / 2 - 0.5 + 3, y: 1 },
  //   { x: trackWidth / 2 + 3, y: 1 },
  //   { x: trackWidth / 2 + 3, y: -1 },
  // ], {
  //   material,
  //   segments: 100,
  //   uvScale: [1, 1 / trackWidth],
  //   terrain
  // });

  // Ground
  const ground = extrudeCurve(roadCurve, [
    { x: -100, y: -5 },
    { x: -trackWidth - 10 - centerWidth / 2, y: 0 },

    // Center ditch
    { x: -centerWidth / 2 + 2, y: 0 },
    { x: -centerWidth / 4, y: -0.4 },
    { x: -centerWidth / 6, y: -0.7 },
    // Mirrored
    { x: centerWidth / 6, y: -0.7 },
    { x: centerWidth / 4, y: -0.4 },
    { x: centerWidth / 2 - 2, y: 0 },

    { x: trackWidth + 10 + centerWidth / 2, y: 0 },
    { x: 100, y: -5 },
  ], {
    material: materials.grassMaterial,
    segments: 300 * 10,
    uvScale: [21 * 5, 3 * 5 / trackWidth],
    terrain
  });
  ground.customData.bumpiness = 0.05;
  ground.customData.friction = 1;
  ground.customData.offroad = 1;
  parent.addChild(ground);

  // // Tree line
  // const treeLineLeft = extrudeCurve(roadCurve, [
  //   { x: -100, y: 25 },
  //   { x: -100, y: -5 },
  // ], {
  //   material: materials.treeLineMaterial,
  //   segments: 100,
  //   uvScale: [1, 0.01],
  //   terrain,
  //   collision: false,
  // });
  // treeLineLeft.castShadows = false;
  // treeLineLeft.receiveShadows = false;
  // parent.addChild(treeLineLeft);

  // const treeLineRight = extrudeCurve(roadCurve, [
  //   { x: 100, y: -5 },
  //   { x: 100, y: 25 },
  // ], {
  //   material: materials.treeLineMaterial,
  //   segments: 100,
  //   uvScale: [-1, 0.01],
  //   terrain,
  //   collision: false,
  // });
  // treeLineRight.castShadows = false;
  // treeLineRight.receiveShadows = false;
  // parent.addChild(treeLineRight);
  
  // parent.addChild(barriers);
  scene.add(parent);

  return {
    width: trackWidth,
    curve: roadCurve,
    gameObject: parent,
  };
}

function extrudeCurve(curve, profiles, settings = {}) {
  if (!Array.isArray(profiles[0])) {
    profiles = [ profiles ];
  }

  let segments = settings.segments ?? 100;
  let material = settings.material ?? renderer.CreateLitMaterial();
  let uvScale = settings.uvScale ?? [ 1, 1 ];
  const terrain = settings.terrain;
  const collision = settings.collision ?? true;

  let gameObject = new GameObject("Extruded curve");

  let indices = [];
  let vertices = [];
  let uvs = [];

  let vps = profiles.flat().length;//profile.length;
  let step = 1 / segments;

  let distanceAlongPath = 0;

  for (let s = 0; s < segments; s++) {
    let t = s / (segments - 1);
    let center = curve.getPoint(t);

    let diff;
    if (s === 0 && !curve.loop) {
      diff = Vector.subtract(
        curve.getPoint(t + step),
        center,
      );
    }
    else {
      diff = Vector.subtract(
        center,
        curve.getPoint(t - step),
      );
    }

    let tangent = Vector.normalize(diff);
    let normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());
    
    // Compute highest terrain y-level under road
    // const terrainLevel = !terrain ? 0 : Math.max(...offsets.map(offsetVector => {
    //   const worldOffset = Vector.copy(center);
    //   Vector.addTo(worldOffset, Vector.multiply(normal, offsetVector.x));
    //   return terrain.getHeight(worldOffset.x, worldOffset.z);
    // })) + 0.01;

    let maxHeight = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const worldOffset = Vector.copy(center);
      Vector.addTo(worldOffset, Vector.multiply(normal, (i - 5) * 10));
      const terrainLevel = terrain.getHeight(worldOffset.x, worldOffset.z) + 0.8;
      maxHeight = Math.max(maxHeight, terrainLevel);
    }
    const terrainLevel = maxHeight;

    for (const profile of profiles) {
      for (let i = 0; i < profile.length; i++) {
        const offsetVector = profile[i];
        let worldOffset = Vector.copy(center);
        Vector.addTo(worldOffset, Vector.multiply(normal, offsetVector.x));

        // Snap to terrain
        if (terrain) {
          worldOffset.y = terrainLevel;
        }
        worldOffset.y += offsetVector.y;
  
        vertices.push(worldOffset.x, worldOffset.y, worldOffset.z);
  
        uvs.push(
          i / (profile.length - 1) * uvScale[0],
          distanceAlongPath * uvScale[1]
        );
      }
    }

    // for (let i = 0; i < profile.length; i++) {
    //   const offsetVector = profile[i];
    //   let worldOffset = Vector.copy(center);
    //   Vector.addTo(worldOffset, Vector.multiply(normal, offsetVector.x));

    //   // // Shrinkwrap to terrain
    //   // if (terrain) {
    //   //   worldOffset.y = terrain.getHeight(worldOffset.x, worldOffset.z) + 0.01;
    //   // }

    //   // Snap to terrain
    //   if (terrain) {
    //     worldOffset.y = terrainLevel;
    //   }

    //   worldOffset.y += offsetVector.y;

    //   vertices.push(worldOffset.x, worldOffset.y, worldOffset.z);

    //   uvs.push(
    //     i / (vps - 1) * uvScale[0],
    //     distanceAlongPath * uvScale[1]
    //   );
    // }

    // Add tree at edge of curve
    for (let i = 0; i < 10; i++) {
      if (Math.random() > 0.03) {
        continue;
      }

      const dir = i % 2 === 0 ? 1 : -1;
      const offset = Math.random() * 40;

      const position = Vector.add(center, Vector.multiply(normal, dir * (42 + offset)));
      const scale = Vector.fill(2 + prng.random() + offset / 10);
      const rotationY = prng.random() * Math.PI * 2;

      const instance = Matrix.identity();
      Matrix.applyTranslation(position, instance);
      Matrix.applyScale(scale, instance);
      Matrix.applyRotationY(rotationY, instance);
      
      treeHandler.addRandomVariant(instance);
    }

    // Add bridges sometimes
    if (Math.random() < 0.003) {
      const bridgeClone = bridge.copy();
      scene.add(bridgeClone);

      bridgeClone.children[2].meshRenderer.materials[0] = allMaterials.grassMaterial;

      const position = Vector.copy(center);
      position.y = terrainLevel;
      bridgeClone.transform.matrix = Matrix.lookInDirection(position, tangent, Vector.up());
    }

    distanceAlongPath += Vector.length(diff);
  }

  for (var i = 0; i < (vertices.length / 3 / vps - 1) * vps; i += vps) {
    let currentProfile = 0;
    let offset = 0;

    for (let j = 0; j < vps - 1; j++) {
      if (
        currentProfile < profiles.length &&
        j === offset + profiles[currentProfile].length - 1
      ) {
        offset += profiles[currentProfile].length;
        currentProfile++;
        continue;
      }

      indices.push(
        j + i + 0,
        j + i + 1,
        j + i + vps,

        j + i + 1,
        j + i + vps + 1,
        j + i + vps,
      );
    }
  }

  let meshData = new renderer.MeshData({
    indices: {
      bufferData: new Uint32Array(indices),
      target: renderer.gl.ELEMENT_ARRAY_BUFFER
    },
    position: {
      bufferData: new Float32Array(vertices),
      size: 3
    },
    uv: {
      bufferData: new Float32Array(uvs),
      size: 2
    }
  });
  meshData.recalculateNormals();
  meshData.recalculateTangents();

  gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
  if (collision) {
    gameObject.addComponent(new MeshCollider());
  }

  return gameObject;
}

async function createMaterials() {
  let [
    albedoImage,
    normalImage,
    metallicRoughnessImage
  ] = await Promise.all([
    loadImage(renderer.path + "assets/textures/roadNoLines/albedo.png"),
    loadImage(renderer.path + "assets/textures/roadNoLines/normal.png"),
    loadImage(renderer.path + "assets/textures/roadNoLines/metallicRoughness.png")
  ]);

  // let roadMaterial = renderer.CreateLitMaterial({
  //   albedo: [0.3, 0.3, 0.3, 1],
  //   albedoTexture: await renderer.loadTexture(albedoImage, { ...renderer.getSRGBFormats(), anisotropicFiltering: true }),
  //   normalTexture: await renderer.loadTexture(normalImage, { anisotropicFiltering: true }),
  //   metallicRoughnessTexture: await renderer.loadTexture(metallicRoughnessImage, { anisotropicFiltering: true }),
  //   metallic: 0.5,
  //   // roughness: 2,
  //   // albedoTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_diff_1k.jpg", { ...renderer.getSRGBFormats() }),
  //   // normalTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_nor_gl_1k.png"),
  // });

  const roadProgram = new renderer.CustomProgram(roadShaderSource);
  const roadMaterial = new renderer.LitMaterial({
    albedo: [0.3, 0.3, 0.3, 1],
    albedoTexture: await renderer.loadTexture(albedoImage, { ...renderer.getSRGBFormats(), anisotropicFiltering: true }),
    normalTexture: await renderer.loadTexture(normalImage, { anisotropicFiltering: true }),
    metallicRoughnessTexture: await renderer.loadTexture(metallicRoughnessImage, { anisotropicFiltering: true }),
    metallic: 0.5,
  }, roadProgram);

  // [
  //   albedoImage,
  //   normalImage,
  //   metallicRoughnessImage
  // ] = await Promise.all([
  //   loadImage(renderer.path + "assets/textures/roadNoLines/albedo.png"),
  //   loadImage(renderer.path + "assets/textures/roadNoLines/normal.png"),
  //   loadImage(renderer.path + "assets/textures/roadNoLines/metallicRoughness.png")
  // ]);

  // let asphaltMaterial = renderer.CreateLitMaterial({
  //   albedo: [0.3, 0.3, 0.3, 1],
  //   albedoTexture: await renderer.loadTexture(albedoImage, { ...renderer.getSRGBFormats(), anisotropicFiltering: true }),
  //   normalTexture: await renderer.loadTexture(normalImage, { anisotropicFiltering: true }),
  //   metallicRoughnessTexture: await renderer.loadTexture(metallicRoughnessImage, { anisotropicFiltering: true }),
  //   metallic: 0.5,
  //   // roughness: 2,
  //   // albedoTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_diff_1k.jpg", { ...renderer.getSRGBFormats() }),
  //   // normalTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_nor_gl_1k.png"),
  // });

  // const grassAlbedo = terrain.terrainMat.getUniform("albedoTextures[0]")[0];
  // const grassNormal = terrain.terrainMat.getUniform("normalTextures[0]")[0];

  // const grassMaterial = renderer.CreateLitMaterial({
  //   albedoTexture: grassAlbedo,
  //   normalTexture: grassNormal,
  // });
  const grassMaterial = terrain.terrainMat;

  const treeLineTexture = await renderer.loadTextureAsync("./treeline.png", { ...renderer.getSRGBFormats() });
  const treeLineMaterial = renderer.CreateLitMaterial({
    albedoTexture: treeLineTexture,
  });

  return {
    roadMaterial,
    grassMaterial,
    treeLineMaterial
  };
}

function resetGame() {
  setupPlayerCar(car);
  setupAICar(AICar);
}

/*
  UI
*/

function updateStatusBar() {
  setStatus(brakesStatus, car.getBrakeInput() > 0.05);
  setStatus(lightsStatus, lightController.isOn());
  setStatus(sirenStatus, sirenController.isOn());

  mphLabel.textContent = Math.abs(car.getMPH()).toFixed(0);

  autoPilotSign.style.display = car.carController.userControlled ? "none" : "";

  // Fade out screen when far from road
  const { distance } = track.curve.distanceToPoint(car.rb.position);
  const opacity = clamp01((distance - 100) / 40);
  ui.style.background = `rgba(0, 0, 0, ${opacity})`;

  if (opacity >= 1) {
    resetGame();
  }
}

function setStatus(element, active) {
  if (active) {
    element.classList.add("active");
  }
  else {
    element.classList.remove("active");
  }
}