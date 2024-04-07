import { GameObject } from "./gameObject.mjs";
import { Transform } from "./transform.mjs";
import Matrix from "./matrix.mjs";
import Vector from "./vector.mjs";
import { NewMaterial } from "./material.mjs";
import Quaternion from "./quaternion.mjs";
import { AABB } from "./physics.mjs";

/**
 * 
 * @param {Scene} scene 
 * @param {number} maxShapes Size of object pool
 */
function GLDebugger(scene, maxShapes = 50) {
  const renderer = scene.renderer;

  let aabbVis;
  let persistentAABBVis;
  renderer.createProgramFromFile(renderer.path + "assets/shaders/custom/webgl2/solidColor").then(r => {
    const solidColorInstanceProgram = new renderer.ProgramContainer(r);

    aabbVis = scene.add(new GameObject("AABB", {
      meshRenderer: new renderer.MeshInstanceRenderer([new NewMaterial(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
      castShadows: false
    }));

    persistentAABBVis = scene.add(new GameObject("Persistent AABB", {
      meshRenderer: new renderer.MeshInstanceRenderer([new NewMaterial(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
      castShadows: false
    }));
  });

  // const meshData = new renderer.MeshData(renderer.getCubeData());
  const whiteMaterial = renderer.CreateLitMaterial();
  const tempTransform = new Transform();

  const cube = scene.add(renderer.CreateShape("cube"));
  cube.disableFrustumCulling = true;
  cube.meshRenderer = cube.meshRenderer.getInstanceMeshRenderer();

  this.index = 0;
  // this.cubes = [];
  // for (let i = 0; i < maxShapes; i++) {
  //   const c = scene.add(new GameObject("DebugCube" + i));
  //   c.visible = false;
  //   c.castShadows = false;

  //   const material = renderer.CreateLitMaterial();
  //   c.meshRenderer = new renderer.MeshRenderer(material, meshData);

  //   material.setUniform("albedo", [0, 0, 0, 1]);
  //   material.setUniform("roughness", 1);
  //   material.setUniform("emissiveFactor", [Math.random(), Math.random(), Math.random()]);

  //   this.cubes[i] = c;
  // }

  this.maxShapes = maxShapes;

  renderer.on("renderloop", () => {
    this.clear();
  });

  this.clear = function() {
    this.index = 0;

    for (const matrix of cube.meshRenderer.matrices) {
      Matrix.set(matrix, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    // for (const cube of this.cubes) {
    //   cube.visible = false;
    // }

    if (aabbVis) {
      aabbVis.meshRenderer.removeAllInstances();
    }
  };

  const setColor = (matrix, color) => {
    if (!color) {
      return;
    }

    if (!Array.isArray(color)) {
      return;
    }

    if (color.length !== 4) {
      color = [
        color[0] ?? 0,
        color[1] ?? 0,
        color[2] ?? 0,
        color[3] ?? 1
      ];
    }

    cube.meshRenderer.setColor(matrix, color);
  };
  
  this.getCube = function() {
    const cubeIR = cube.meshRenderer;
    if (cubeIR.matrices.length < this.index + 1) {
      cubeIR.addInstance(Matrix.identity());
    }

    // const currentCube = this.cubes[this.index];
    const currentCube = cubeIR.matrices[this.index];
    this.index++;
    this.index = this.index % this.maxShapes;
    // this.index = this.index % this.cubes.length;

    cubeIR.needsBufferUpdate = true;

    return currentCube;
  };

  this.DrawOctree = function(octree) {
    if (octree.items.length > 0) {
      // Octree uses SimpleAABB which does not have any methods
      const aabb = new AABB(
        octree.aabb.bl,
        octree.aabb.tr
      );
      this.Bounds(aabb);
    }

    for (let i = 0; i < octree.children.length; i++) {
      this.DrawOctree(octree.children[i]);
    }
  };

  this.Bounds = function(aabb, matrix) {
    if (aabbVis) {
      const position = aabb.getCenter();
      const size = aabb.getSize();

      const instance = Matrix.transform([
        ["translate", position],
        ["sx", size.x / 2],
        ["sy", size.y / 2],
        ["sz", size.z / 2]
      ]);

      if (Matrix.isMatrix(matrix)) {
        Matrix.multiply(matrix, instance, instance);
      }
      
      aabbVis.meshRenderer.addInstance(instance);
    }
  };

  this.Line = function(a, b, color) {
    const normal = Vector.subtract(b, a);
    this.Vector(a, normal, 1, color);
  };

  this.Vector = function(p, normal, size = 1, color) {
    const len = Vector.length(normal);
    if (len * size <= 1e-6) {
      return;
    }

    const c = this.getCube();
    tempTransform.matrix = Matrix.lookAt(Vector.add(p, Vector.multiply(normal, 0.5 * size)), Vector.add(p, normal), new Vector(0.1, 0.9, 0));
    tempTransform.scale = new Vector(0.01, 0.01, 0.5 * size * len);
    Matrix.copy(tempTransform.matrix, c);

    setColor(c, color);
  };

  this.Point = function(p, size = 0.2, color) {
    const c = this.getCube();
    tempTransform.rotation = Quaternion.identity();
    tempTransform.position = p;
    tempTransform.scale = Vector.fill(size);
    Matrix.copy(tempTransform.matrix, c);

    setColor(c, color);
  };

  // this.Vector = function(p, normal, size = 1, color) {
  //   const len = Vector.length(normal);
  //   if (len * size <= 1e-6) {
  //     return;
  //   }

  //   const c = this.getCube();
  //   c.transform.matrix = Matrix.lookAt(Vector.add(p, Vector.multiply(normal, 0.5 * size)), Vector.add(p, normal), new Vector(0.1, 0.9, 0));
  //   c.transform.scale = new Vector(0.01, 0.01, 0.5 * size * len);
  //   c.visible = true;

  //   if (color) {
  //     const mat = FindMaterials("", c)[0];
  //     mat.setUniform("emissiveFactor", color);
  //     mat.setUniform("albedo", [...color, 1]);
  //   }
  // };

  // this.Point = function(p, size = 0.2, color) {
  //   const c = this.getCube();
  //   c.transform.rotation = Quaternion.identity();
  //   c.transform.position = p;
  //   c.transform.scale = Vector.fill(size);
  //   c.visible = true;

  //   if (color) {
  //     const mat = FindMaterials("", c)[0];
  //     mat.setUniform("emissiveFactor", color);
  //     mat.setUniform("albedo", [...color, 1]);
  //   }
  // };

  this.CreateLine = function(a, b, thickness = 0.01, color) {
    const origin = a;
    const direction = Vector.subtract(b, a);
    this.CreateVector(origin, direction, 2, thickness, color);
  };

  this.CreateVector = function(origin, direction, scale = 1, thickness = 0.01, color) {
    const target = Vector.add(origin, Vector.multiply(direction, 0.5 * scale));
  
    let mat = whiteMaterial;
    if (color) {
      mat = renderer.CreateLitMaterial({
        albedo: [...color, 1],
      });
    }

    const cube = scene.add(renderer.CreateShape("cube", mat));
    cube.castShadows = false;
    cube.transform.matrix = Matrix.lookAt(Vector.average(origin, target), target, new Vector(0.01, 1, -0.01));
    cube.transform.scale = new Vector(thickness, thickness, Vector.distance(origin, target) / 2);
  };
  
  this.CreatePlane = function(origin, normal, scale = 1) {
    const target = Vector.subtract(origin, normal);
  
    const plane = scene.add(renderer.CreateShape("plane", whiteMaterial));
    plane.castShadows = false;
    plane.transform.matrix = Matrix.lookAt(origin, target, new Vector(0.01, 1, -0.01));
    plane.transform.scale = Vector.fill(scale);
  };
  
  this.CreatePoint = function(position, size = 0.1) {
    const sphere = scene.add(renderer.CreateShape("sphere", whiteMaterial, 2));
    sphere.castShadows = false;
    sphere.transform.scale = Vector.fill(size);
    sphere.transform.position = position;
  };

  this.CreateAxes = function(position = Vector.zero(), size = 1, thickness = 0.02) {
    this.CreateVector(position, new Vector(1, 0, 0), size, thickness, [1, 0, 0]);
    this.CreateVector(position, new Vector(0, 1, 0), size, thickness, [0, 1, 0]);
    this.CreateVector(position, new Vector(0, 0, 1), size, thickness, [0, 0, 1]);
  };

  this.CreateOctree = function(octree) {
    if (octree.items.length > 0) {
      // Octree uses SimpleAABB which does not have any methods
      const aabb = new AABB(
        octree.aabb.bl,
        octree.aabb.tr
      );
      this.CreateBounds(aabb);
    }

    for (let i = 0; i < octree.children.length; i++) {
      this.CreateOctree(octree.children[i]);
    }
  };

  this.CreateBounds = function(aabb, matrix) {
    if (persistentAABBVis) {
      const position = aabb.getCenter();
      const size = aabb.getSize();

      if (Vector.isNaN(position) || Vector.isNaN(size)) {
        console.warn("AABB is NaN");
        return;
      }

      const instance = Matrix.transform([
        ["translate", position],
        ["sx", size.x / 2],
        ["sy", size.y / 2],
        ["sz", size.z / 2]
      ]);

      if (Matrix.isMatrix(matrix)) {
        Matrix.multiply(matrix, instance, instance);
      }
      
      persistentAABBVis.meshRenderer.addInstance(instance);
    }
  };

  this.CreateCurve = function(curve, res = 10, thickness = 0.01, color) {
    for (let i = 0; i < res - 1; i++) {
      this.CreateLine(
        curve.getPoint(i / (res - 1)),
        curve.getPoint((i + 1) / (res - 1)),
        thickness,
        color
      );
    }

    for (const point of curve.getPoints()) {
      this.CreatePoint(point, 0.1);
    }

    this.CreatePoint(curve.getPoint(0), 0.1);
    this.CreatePoint(curve.getPoint(1), 0.1);
  };
}

export default GLDebugger;