import Renderer from "../../engine/renderer.mjs";
import { Camera } from "../../engine/camera.mjs";
import { GameObject } from "../../engine/gameObject.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Vector from "../../engine/vector.mjs";
import { getTriangleNormal } from "../../engine/algebra.mjs";
import Matrix from "../../engine/matrix.mjs";
import Quaternion from "../../engine/quaternion.mjs";
import { AABB, BoxCollider, MeshCollider, PhysicsEngine, Rigidbody } from "../../engine/physics.mjs";
import GLDebugger from "../../engine/GLDebugger.mjs";
import { MeshGeometry, VClip, computeDistance } from "../../engine/vclip.mjs";

const renderer = new Renderer({ renderpipeline: 0, path: "../../" });
const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({ hdrFolder: "../../assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

window.Debug = new GLDebugger(scene, 1000);

const physicsEngine = new PhysicsEngine(scene, {
  multipleTimestepsPerFrame: false
});

const orbitCamera = new OrbitCamera(renderer);
const camera = orbitCamera.camera;

// // const cubeA = scene.add(renderer.CreateShape("sphere", renderer.CreateLitMaterial({ albedo: [1, 0, 0, 1 ]}), 0));
// // cubeA.transform.scale = Vector.fill(0.5 * 1.5);

// const green = renderer.CreateLitMaterial({ albedo: [0, 1, 0, 0.3 ], opaque: false, alphaCutoff: 0 });
// green.doubleSided = true;
// const cubeB = scene.add(renderer.CreateShape("sphere", green, 0));
// cubeB.transform.scale = Vector.fill(0.5 * 2);
// // cubeB.transform.position = new Vector(-1, -0.1, -0.8);
// // cubeB.transform.rotation = Quaternion.euler(Math.PI * 0.2, Math.PI * 0.5, 0);

// const rb = window.rb = cubeB.addComponent(new Rigidbody());
// rb.rotation = Quaternion.euler(0, 0, -0.7);
// rb.position = new Vector(1.9, -0.2, 0);
// rb.mass = 200;
// rb.inertia = Vector.multiply(Vector.fill(2), rb.mass / 12);
// // rb.inertia = Vector.multiply(new Vector(8, 8, 8), rb.mass / 12);
// console.log(rb.inertia, rb);
// // rb.gravityScale = 0;

// const bc = cubeB.addComponent(new BoxCollider());
// bc.friction = 0;

// let triangle = new GameObject("Triangle");
// let meshData = new renderer.MeshData({
//   indices: {
//     bufferData: new Uint32Array([ 0, 1, 2, /*3, 4, 5*/ ]),
//     target: renderer.gl.ELEMENT_ARRAY_BUFFER
//   },
//   position: {
//     bufferData: new Float32Array([
//       -3, 0, 2,
//       2, 0, 2,
//       2, 0, -2,

//       // 10, 2, 5,
//       // -10, 0.8 * 0, 5,
//       // 0, 0, 25,
//     ]),
//     size: 3
//   },
//   normal: {
//     bufferData: new Float32Array([ 0, 1, 0, 0, 1, 0 ]),
//     size: 3,
//   },
// });
// let mat = renderer.CreateLitMaterial({ albedo: [1, 0, 0, 0.2], opaque: true, alphaCutoff: 0 });
// mat.doubleSided = true;
// let meshRenderer = new renderer.MeshRenderer(mat, meshData);
// triangle.meshRenderer = meshRenderer;
// triangle.addComponent(new MeshCollider());
// triangle.transform.position.y = -1;
// scene.add(triangle);

const blue = renderer.CreateLitMaterial({ albedo: [0, 0, 1, 1 ] });
blue.doubleSided = true;
const bigSphere = scene.add(renderer.CreateShape("sphere", blue, 0));
bigSphere.transform.scale = Vector.fill(5);
bigSphere.transform.position = new Vector(0, -5, 0);
bigSphere.addComponent(new MeshCollider());

// physicsEngine.dt = 1 / 500;

const material = renderer.CreateLitMaterial({
  albedo: [0.1, 0.1, 0.1, 0.5],
  opaque: false,
  alphaCutoff: 0
});

const a = scene.add(renderer.CreateShape("cube", material, 0));
a.addComponent(new MeshCollider());
a.transform.scale = new Vector(10, 1, 10);
a.transform.position = new Vector(3, -2.19, -3);

const a2 = scene.add(renderer.CreateShape("cube", material, 0));
a2.addComponent(new MeshCollider());
a2.transform.scale = new Vector(10, 1, 10);
a2.transform.position = new Vector(3 - 21, -2.19, -3);

const b = scene.add(renderer.CreateShape("sphere", material, 0));
b.transform.rotation = Quaternion.euler(0, Math.PI / 4, 0);
// b.transform.position = new Vector(0, 1, 0);
b.addComponent(new BoxCollider(
  new AABB(Vector.fill(-1), Vector.fill(1))
));//.friction = 0;
const rb = window.rb = b.addComponent(new Rigidbody());

window.Debug.CreateAxes();

// const geomA = new MeshGeometry(a.transform.matrix, a.meshRenderer.meshData[0]);
// const geomB = new MeshGeometry(b.transform.matrix, b.meshRenderer.meshData[0]);
// const a = new CubeGeometry(cubeA.transform.matrix, Vector.fill(2));
// const b = new CubeGeometry(cubeB.transform.matrix, Vector.fill(2));

// renderer.on("mousedown", () => {
//   const u = renderer.mouse.x / renderer.canvas.width;
//   const v = renderer.mouse.y / renderer.canvas.height;
//   const ray = camera.screenToWorldRay(u, v);

//   const hits = physicsEngine.RaycastAll(ray.origin, ray.direction);
//   const uniqueGameObjects = [...new Set(hits.allHits.map(h => h.gameObject))];

//   for (const gameObject of uniqueGameObjects) {
//     gameObject.transform.position.y += 0.5;
//   }

//   // window.Debug.CreateVector(ray.origin, ray.direction, 50);
// });

renderer.on("renderloop", (frameTime) => {
  if (renderer.getKey(32)) {
    rb.position = new Vector(-7.55, 0.9, 0);
    rb.velocity = Vector.zero();
    rb.angularVelocity = Vector.zero();
    rb.rotation = Quaternion.euler(0, Math.PI / 4, 0);
    // rb.rotation = Quaternion.euler(0.3, 0.1, 0.6);
  }

  if (renderer.getKey(13)) {
    physicsEngine.dt = 0;
  }
  else {
    physicsEngine.dt = 1 / 60;
  }

  // if (renderer.getKeyDown(32)) {
  //   b.transform.rotation = Quaternion.euler(
  //     Math.random() * 2 * Math.PI,
  //     Math.random() * 2 * Math.PI,
  //     Math.random() * 2 * Math.PI,
  //   );
  // }

  // if (renderer.getKey(32)) {
  //   b.transform.position = camera.transform.position;
  // }
  // const geomB = new MeshGeometry(b.transform.matrix, b.meshRenderer.meshData[0]);

  // const data = VClip(geomA, geomB);
  // data.featureA.render();
  // data.featureB.render();

  // const distanceData = computeDistance(data.featureA, data.featureB);
  // window.Debug.Point(distanceData.pointA, 0.07);
  // window.Debug.Point(distanceData.pointB, 0.07);
  // window.Debug.Vector(distanceData.pointA, distanceData.vector);

  physicsEngine.update();
  renderer.update(frameTime);
  renderer.render(camera);
});