import Vector from "./vector.mjs";
import Matrix from "./matrix.mjs";
import Quaternion from "./quaternion.mjs";

import {
  xor,
  clamp,
  lerp,
  inverseLerp,
  roundNearest,
  Float32ToFloat16,
  Uint8ToUint32,
  Float32Concat,
  watchGlobal,
  isMobile,
  fadeOutElement,
  hideElement,
  showElement
} from "./helper.mjs";

import {
  AABBToAABB,
  closestPointToTriangle,
  closestPointOnPlane,
  closestPointOnTriangle,
  rayToTriangle,
  rayToPlane,
  AABBTriangleToAABB,
  AABBToTriangle,
  rayToAABB,
  getTriangleNormal,
  sphereToTriangle,
  capsuleToTriangle,
  ClosestPointOnLineSegment
} from "./algebra.mjs";

function CreateCubeCollider(pos, scale, rot) {
  var aabb = new AABBCollider(Vector.subtract(pos, scale), Vector.add(pos, scale), Matrix.transform([
    ["rx", rot.x],
    ["ry", rot.y],
    ["rz", rot.z]
  ]));
  colliders.push(aabb);
}

function AABBCollider(bl, tr, matrix = Matrix.identity(), inverted = false) {
  this.bl = bl || {x: -5, y: -5, z: -5};
  this.tr = tr || {x: 5, y: 5, z: 5};
  this.inverted = inverted;
  this.matrix = matrix;
  this.inverseMatrix = Matrix.inverse(this.matrix);

  this.vertices = [
    {x: this.tr.x, y: this.tr.y, z: this.tr.z},
    {x: this.bl.x, y: this.tr.y, z: this.tr.z},
    {x: this.bl.x, y: this.tr.y, z: this.bl.z},
    {x: this.tr.x, y: this.tr.y, z: this.bl.z},

    {x: this.tr.x, y: this.bl.y, z: this.tr.z},
    {x: this.bl.x, y: this.bl.y, z: this.tr.z},
    {x: this.bl.x, y: this.bl.y, z: this.bl.z},
    {x: this.tr.x, y: this.bl.y, z: this.bl.z},
  ];

  this.planes = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [0, 3, 7, 4]
  ];

  this.planeNormals = [
    {x: 0, y: 1, z: 0},
    {x: 0, y: -1, z: 0},
    {x: 0, y: 0, z: 1},
    {x: -1, y: 0, z: 0},
    {x: 0, y: 0, z: -1},
    {x: 1, y: 0, z: 0}
  ];

  if (this.inverted) {
    for (var i = 0; i < this.planeNormals.length; i++) {
      this.planeNormals[i] = Vector.multiply(this.planeNormals[i], -1);
    }
  }

  var aabbGameObject = scene.root.getChild("AABB");
  if (aabbGameObject) {
    aabbGameObject.meshRenderer.addInstance(Matrix.multiply(Matrix.transform([
      ["translate", Vector.divide(Vector.add(this.bl, this.tr), 2)],
      ["sx", (this.tr.x - this.bl.x) / 2],
      ["sy", (this.tr.y - this.bl.y) / 2],
      ["sz", (this.tr.z - this.bl.z) / 2]
    ]), Matrix.copy(this.matrix)));
  }

  this.getNormal = function(point) {
    var aabbPos = Vector.divide(Vector.add(this.bl, this.tr), 2);
    point = Matrix.matrixToVector(Matrix.multiplyMat4Vec(this.matrix, Matrix.vectorToMatrix(Vector.subtract(point, aabbPos))));
    point = Vector.add(point, aabbPos);

    var smallestDistance = Infinity;
    var plane;

    for (var i = 0; i < this.planes.length; i++) {
      var normal = this.planeNormals[i];
      var distance = Vector.dot(normal, Vector.subtract(point, this.vertices[this.planes[i][0]]));
      var pointOnPlane = Vector.subtract(point, Vector.multiply(normal, distance));

      pointOnPlane.x = clamp(pointOnPlane.x, this.bl.x, this.tr.x);
      pointOnPlane.y = clamp(pointOnPlane.y, this.bl.y, this.tr.y);
      pointOnPlane.z = clamp(pointOnPlane.z, this.bl.z, this.tr.z);

      distance = Vector.distance(pointOnPlane, point);

      if (distance < smallestDistance) {
        smallestDistance = distance;
        plane = i;
      }
    }

    return {
      normal: Matrix.matrixToVector(Matrix.multiplyMat4Vec(this.inverseMatrix, Matrix.vectorToMatrix(this.planeNormals[plane]))),
      distance: smallestDistance
    };
  }

  this.pointInside = function(point) {
    var aabbPos = Vector.divide(Vector.add(this.bl, this.tr), 2);
    point = Matrix.matrixToVector(Matrix.multiplyMat4Vec(this.matrix, Matrix.vectorToMatrix(Vector.subtract(point, aabbPos))));
    point = Vector.add(point, aabbPos);

    return xor(this.inverted, point.x >= this.bl.x && point.x <= this.tr.x &&
                              point.y >= this.bl.y && point.y <= this.tr.y &&
                              point.z >= this.bl.z && point.z <= this.tr.z);
  }
}

function MeshCollider(data, matrix = Matrix.identity()) {
  this.vertices = data.position.bufferData;
  this.indices = data.indices.bufferData;
  this.matrix = matrix;

  this.raycast = function(origin, direction) {
    var smallestDistance = Infinity;
    var normal;
    var point;

    for (var i = 0; i < this.indices.length; i += 3) {
      var i1 = this.indices[i];
      var i2 = this.indices[i + 1];
      var i3 = this.indices[i + 2];

      var a = {
        x: this.vertices[i1 * 3],
        y: this.vertices[i1 * 3 + 1],
        z: this.vertices[i1 * 3 + 2]
      };

      var b = {
        x: this.vertices[i2 * 3],
        y: this.vertices[i2 * 3 + 1],
        z: this.vertices[i2 * 3 + 2]
      };

      var c = {
        x: this.vertices[i3 * 3],
        y: this.vertices[i3 * 3 + 1],
        z: this.vertices[i3 * 3 + 2]
      };

      a = Matrix.transformVector(this.matrix, a);
      b = Matrix.transformVector(this.matrix, b);
      c = Matrix.transformVector(this.matrix, c);

      var hitPoint = rayToTriangle(origin, direction, a, b, c);
      if (hitPoint && hitPoint.distance < smallestDistance) {
        smallestDistance = hitPoint.distance;
        normal = Vector.normalize(Vector.cross(Vector.subtract(b, a), Vector.subtract(c, a)));
        point = hitPoint.point;
      }
    }

    return {
      distance: smallestDistance,
      normal: normal,
      point: point
    };
  }

  this.getNormal = function(point) {
    var smallestDistance = Infinity;
    var normal;

    for (var i = 0; i < this.indices.length; i += 3) {
      var i1 = this.indices[i];
      var i2 = this.indices[i + 1];
      var i3 = this.indices[i + 2];

      var a = {
        x: this.vertices[i1 * 3],
        y: this.vertices[i1 * 3 + 1],
        z: this.vertices[i1 * 3 + 2]
      }

      var b = {
        x: this.vertices[i2 * 3],
        y: this.vertices[i2 * 3 + 1],
        z: this.vertices[i2 * 3 + 2]
      }

      var c = {
        x: this.vertices[i3 * 3],
        y: this.vertices[i3 * 3 + 1],
        z: this.vertices[i3 * 3 + 2]
      }

      var pointOnTriangle = closestPointOnTriangle(point, a, b, c);
      if (pointOnTriangle) {
        var distance = Vector.distance(point, pointOnTriangle);
        if (distance < smallestDistance) {
          smallestDistance = distance;
          normal = Vector.normalize(Vector.cross(Vector.subtract(b, a), Vector.subtract(c, a)));
        }
      }
    }

    return {
      normal: normal,
      distance: smallestDistance
    };
  }
}

function Octree(aabb, maxDepth = 5) {
  this.aabb = aabb;
  this.children = [];
  this.items = [];
  this.maxDepth = maxDepth;
  this.divided = false;

  this.trianglesArray = null;

  this.query = function(origin, direction) {
    var indices = this._query((cAABB) => {
      return rayToAABB(origin, direction, cAABB);
    });
    
    if (!indices) {
      return false;
    }

    var triangles = [];
    for (var i = 0; i < indices.length; i++) {
      triangles.push(this.getTriangleFromIndex(this.trianglesArray, indices[i]));
    }

    return triangles;
  }

  this.queryAABB = function(aabb) {
    var indices = this._query((cAABB) => {
      return AABBToAABB(cAABB, aabb);
    });

    if (!indices) {
      return false;
    }

    var triangles = [];
    for (var i = 0; i < indices.length; i++) {
      triangles.push(this.getTriangleFromIndex(this.trianglesArray, indices[i]));
    }

    return triangles;
  }

  this._query = function(func, output = []) {
    if (!func(this.aabb)) {
      return;
    }

    for (var i = 0; i < this.items.length; i++) {
      // if (!output.includes(this.items[i])) {
        output.push(this.items[i]);
      // }
    }

    for (var i = 0; i < this.children.length; i++) {
      this.children[i]._query(func, output);
    }

    return output;
  }

  // this.queryAABB = function(aabb, output = [], trianglesArray = this.trianglesArray) {
  //   if (!AABBToAABB(this.aabb, aabb)) {
  //     return;
  //   }

  //   for (var i = 0; i < this.items.length; i++) {
  //     output.push(this.getTriangleFromIndex(trianglesArray, this.items[i])); // bruh

  //     if (!output.includes(this.items[i])) {
  //       output.push(this.items[i]);
  //     }
  //   }

  //   for (var i = 0; i < this.children.length; i++) {
  //     this.children[i].queryAABB(aabb, output, trianglesArray);
  //   }

  //   return output;
  // }

  // this.query = function(origin, direction, output = [], trianglesArray = this.trianglesArray) {
  //   if (!rayToAABB(origin, direction, this.aabb)) {
  //     return;
  //   }

  //   for (var i = 0; i < this.items.length; i++) {
  //     output.push(this.getTriangleFromIndex(trianglesArray, this.items[i]));
  //     // output.push(this.items[i]);
  //   }

  //   for (var i = 0; i < this.children.length; i++) {
  //     this.children[i].query(origin, direction, output, trianglesArray);
  //   }

  //   return output;
  // }

  this.addTriangles = function(arr) {
    if (typeof window !== 'undefined') window.aabbcalls = 0;

    this.trianglesArray = arr;
    for (var i = 0; i < this.trianglesArray.length; i += 9) {
      var v1 = {x: this.trianglesArray[i + 0], y: this.trianglesArray[i + 1], z: this.trianglesArray[i + 2]};
      var v2 = {x: this.trianglesArray[i + 3], y: this.trianglesArray[i + 4], z: this.trianglesArray[i + 5]};
      var v3 = {x: this.trianglesArray[i + 6], y: this.trianglesArray[i + 7], z: this.trianglesArray[i + 8]};
      this.addTriangle(i, [v1, v2, v3]);
    }
  }

  this.addTriangle = function(index, triangle, depth = 0) {
    if (depth >= this.maxDepth || !(AABBTriangleToAABB(triangle[0], triangle[1], triangle[2], this.aabb) && AABBToTriangle(this.aabb, triangle))) {
      return false;
    }

    if (!this.divided) {
      this.subdivide();
      this.divided = true;
    }

    var found = false;
    for (var i = 0; i < this.children.length; i++) {
      if (this.children[i].addTriangle(index, triangle, depth + 1)) {
        found = true;
      }
    }
  
    if (!found) {
      this.items.push(index);
      // this.items.push(triangle);
    }

    return true;
  }

  this.getTriangleFromIndex = function(arr, i) {
    var v1 = {x: arr[i + 0], y: arr[i + 1], z: arr[i + 2]};
    var v2 = {x: arr[i + 3], y: arr[i + 4], z: arr[i + 5]};
    var v3 = {x: arr[i + 6], y: arr[i + 7], z: arr[i + 8]};
    return [v1, v2, v3];
  }

  this.subdivide = function() {
    this.children.push(
      new Octree(new SimpleAABB(this.aabb.bl, Vector.average(this.aabb.bl, this.aabb.tr)), this.maxDepth),
      new Octree(new SimpleAABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.bl.y, z: this.aabb.bl.z}, {x: this.aabb.tr.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}), this.maxDepth),
      new Octree(new SimpleAABB({x: this.aabb.bl.x, y: this.aabb.bl.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.tr.z}), this.maxDepth),
      new Octree(new SimpleAABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.bl.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: this.aabb.tr.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.tr.z}), this.maxDepth),

      new Octree(new SimpleAABB({x: this.aabb.bl.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.bl.z}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.tr.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}), this.maxDepth),
      new Octree(new SimpleAABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.bl.z}, {x: this.aabb.tr.x, y: this.aabb.tr.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}), this.maxDepth),
      new Octree(new SimpleAABB({x: this.aabb.bl.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.tr.y, z: this.aabb.tr.z}), this.maxDepth),
      new Octree(new SimpleAABB(Vector.average(this.aabb.bl, this.aabb.tr), this.aabb.tr), this.maxDepth)
    );
  }

  this.render = function(scene, topCall = true) {
    if (this.children.length == 0) {
      var aabb = this.aabb;
      scene.root.getChild("AABB").meshRenderer.addInstance(Matrix.transform([
        ["translate", Vector.divide(Vector.add(aabb.bl, aabb.tr), 2)],
        ["sx", (aabb.tr.x - aabb.bl.x) / 2],
        ["sy", (aabb.tr.y - aabb.bl.y) / 2],
        ["sz", (aabb.tr.z - aabb.bl.z) / 2]
      ]), false);
    }
    else {
      for (var i = 0; i < this.children.length; i++) {
        this.children[i].render(scene, false);
      }
    }
    
    if (topCall) {
      scene.root.getChild("AABB").meshRenderer.updateMatrixData();
    }
  }
}

function SimpleAABB(bl, tr) {
  if (typeof window !== 'undefined') window.aabbcalls++;
  this.bl = bl;
  this.tr = tr;
}

function AABB(bl = Vector.zero(), tr = Vector.zero()) {
  this.bl = bl;
  this.tr = tr;

  this.extend = function(pointOrAABB) {
    if (pointOrAABB instanceof AABB) {
      var aabb = pointOrAABB;
      this.bl = Vector.compFunc(this.bl, aabb.bl, Math.min);
      this.tr = Vector.compFunc(this.tr, aabb.tr, Math.max);
    }
    else {
      var point = pointOrAABB;
      this.bl = Vector.compFunc(this.bl, point, Math.min);
      this.tr = Vector.compFunc(this.tr, point, Math.max);
    }
  }

  this.pointInside = function(point) {
    return point.x >= this.bl.x && point.y >= this.bl.y && point.z >= this.bl.z &&
           point.x <= this.tr.x && point.y <= this.tr.y && point.z <= this.tr.z;
  }

  this.getVertices = function() {
    return [
      {x: this.bl.x, y: this.bl.y, z: this.bl.z},
      {x: this.tr.x, y: this.bl.y, z: this.bl.z},
      {x: this.tr.x, y: this.bl.y, z: this.tr.z},
      {x: this.bl.x, y: this.bl.y, z: this.tr.z},
      {x: this.bl.x, y: this.tr.y, z: this.bl.z},
      {x: this.tr.x, y: this.tr.y, z: this.bl.z},
      {x: this.tr.x, y: this.tr.y, z: this.tr.z},
      {x: this.bl.x, y: this.tr.y, z: this.tr.z},
    ];
  }

  this.getEdges = function() {
    return [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7]
    ];
  };

  this.getCenter = function() {
    return Vector.average(this.tr, this.bl);
  }

  this.getSize = function() {
    return Vector.subtract(this.tr, this.bl);
  }

  // this.transform = function(matrix) {
  //   return new AABB(
  //     Matrix.transformVector(matrix, this.bl),
  //     Matrix.transformVector(matrix, this.tr)
  //   );
  // }
}
AABB.bounds = function(points) {
  var min = Vector.fill(Infinity);
  var max = Vector.fill(-Infinity);

  for (var i = 0; i < points.length; i++) {
    var point = points[i];
    min = Vector.compFunc(min, point, Math.min);
    max = Vector.compFunc(max, point, Math.max);
  }

  return new AABB(min, max);
}

function PhysicsEngine(scene, settings = {}) {
  var physicsEngine = this;
  this.scene = scene;

  // this.gravity = new Vector(0, -9.82, 0);

  var constraintsToSolve = [];
  this.constraintIterations = 20;//5;
  this.constraintBias = 0.4;

  this.dt = 1 / 60;
  var lastTime = performance.now();
  var accumulator = 0;
  this.time = 0;

  this.fixedUpdate = () => {};

  // bruh make dynamicly resize when adding mesh
  var meshCollidersToAdd = [];
  // var aabb = new AABB(new Vector(-250, -35.33, -250), new Vector(250, 30, 250));
  // var aabb = new AABB(new Vector(-30.33, -35.33, -40.33), new Vector(30, 3.6, 40));
  // this.octree = new Octree(aabb, 4);

  this.Raycast = function(origin, direction) {
    var outArray = [];
  
    var q = this.octree.query(origin, direction);
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
  
    // var outArray = [];
    // raycastChildren(origin, direction, scene.root, outArray);
  
    // var smallestDistance = Infinity;
    // var smallestElement;
    // for (var i = 0; i < outArray.length; i++) {
    //   var d = outArray[i].distance;
    //   if (d < smallestDistance) {
    //     smallestDistance = d;
    //     smallestElement = outArray[i];
    //   }
    // }
  
    // return {
    //   firstHit: smallestElement,
    //   allHits: outArray
    // };
  }

  this.addMeshCollider = function(gameObject) {
    // this._addMeshToOctree(gameObject);
    meshCollidersToAdd.push(gameObject);
  }

  this.setupMeshCollider = function() {
    var aabb;

    if (settings.bounds) {
      aabb = settings.bounds;
    }
    else {
      aabb = new AABB();
      for (var c of meshCollidersToAdd) {
        aabb.extend(this.scene.renderer.GetMeshAABB(c, 0.1));
      }
    }

    this.octree = new Octree(aabb, settings.octreeLevels ?? 4);

    for (var c of meshCollidersToAdd) {
      this._addMeshToOctree(c);
    }

    meshCollidersToAdd = [];
  }

  // bruh make private
  this._addMeshToOctree = function(gameObject) {
    var nrTriangles = 0;

    gameObject.traverse(o => {
      if (o.meshRenderer) {
        for (var j = 0; j < o.meshRenderer.meshData.length; j++) {
          var md = o.meshRenderer.meshData[j].data;
          nrTriangles += md.indices.bufferData.length / 3;
        }
      }
    });

    var trianglesArray = new Float32Array(nrTriangles * 3 * 3);
    var triangleIndex = 0;

    gameObject.traverse(o => {
      if (o.meshRenderer) {
        var worldMatrix = o.transform.worldMatrix;

        for (var j = 0; j < o.meshRenderer.meshData.length; j++) {
          var md = o.meshRenderer.meshData[j].data;

          for (var k = 0; k < md.indices.bufferData.length; k += 3) {
            for (var l = 0; l < 3; l++) {
              var currentIndex = md.indices.bufferData[k + l] * 3;
              var vec = Vector.fromArray(md.position.bufferData, currentIndex);
              vec = {x: vec.x, y: vec.y, z: vec.z};
              var transVec = Matrix.transformVector(worldMatrix, vec);

              trianglesArray[triangleIndex * 9 + l * 3 + 0] = transVec.x;
              trianglesArray[triangleIndex * 9 + l * 3 + 1] = transVec.y;
              trianglesArray[triangleIndex * 9 + l * 3 + 2] = transVec.z;
            }

            triangleIndex++;
          }
        }
      }
    });

    this.octree.addTriangles(trianglesArray);
  }

  var updatePhysics = () => {
    constraintsToSolve = [];

    var allRigidbodies = [];
    var rigidbodiesWithColliders = [];

    // External fixed update
    this.fixedUpdate(this.dt);

    // Find constraints
    this.scene.root.traverse(function(gameObject) {
      var rigidbodies = gameObject.findComponents("Rigidbody");
      var rigidbody = rigidbodies[0];
      if (rigidbody) {
        allRigidbodies.push(rigidbody);

        rigidbody.grounded = false;

        var sphereColliders = rigidbody.gameObject.findComponents("SphereCollider");
        for (var collider of sphereColliders) {
          var mat = Matrix.removeTranslation(Matrix.copy(rigidbody.gameObject.transform.worldMatrix));
          var pos = Vector.add(rigidbody.position, Matrix.transformVector(mat, collider.offset));

          var s = Vector.fill(collider.radius * 1.1);
          var q = physicsEngine.octree.queryAABB(new AABB(
            Vector.subtract(pos, s),
            Vector.add(pos, s)
          ));

          if (q) {
            for (var k = 0; k < q.length; k++) {
              var col = sphereToTriangle(pos, collider.radius, q[k][0], q[k][1], q[k][2], true);
              if (col) {
                var normal = col.normal; //getTriangleNormal(q[k]); // col.normal;

                // console.log({
                //   normal,
                //   pA: Vector.add(pos, Vector.multiply(normal, -collider.radius + col.depth * 0)),
                //   pos,
                //   r: collider.radius,
                //   C: -col.depth
                // });
                
                // if (Vector.lengthSqr(normal) > 0.1 * 0.1 && col.depth > 0.001) {
                var pA = Vector.add(pos, Vector.multiply(normal, -collider.radius));//col.point;

                var tooClose = false;
                // for (var c of constraintsToSolve) {
                //   if (Vector.distance(c.pA, pA) < 0.001) {
                //     tooClose = true;
                //     break;
                //   }
                // }

                if (!tooClose) {
                  constraintsToSolve.push({
                    C: -col.depth,
                    bodies: [
                      {
                        collider: collider,
                        body: rigidbody,
                        normal: normal,
                        p: pA
                      }
                    ]
                  });

                  // console.log(col.depth);

                  // Debug.Vector(
                  //   Vector.add(pos, Vector.multiply(normal, -collider.radius)),
                  //   normal,
                  //   col.depth * 100
                  // );

                  // break;
                }
              }
            }
          }
        }

        var capsuleColliders = rigidbody.gameObject.findComponents("CapsuleCollider");
        for (var collider of capsuleColliders) {
          var mat = Matrix.removeTranslation(Matrix.copy(rigidbody.gameObject.transform.worldMatrix));
          var a = Vector.add(rigidbody.position, Matrix.transformVector(mat, collider.a));
          var b = Vector.add(rigidbody.position, Matrix.transformVector(mat, collider.b));

          var s = Vector.fill(collider.radius * 10);
          var center = Vector.average(a, b);
          var q = physicsEngine.octree.queryAABB(new AABB(
            Vector.subtract(center, s),
            Vector.add(center, s)
          ));

          if (q) {
            for (var k = 0; k < q.length; k++) {
              var col = capsuleToTriangle(a, b, collider.radius, q[k][0], q[k][1], q[k][2], true);
              if (col) {
                // bruh getTriangleNormal(q[k]) is good for character controller maybe
                var dp = Vector.dot(Vector.up(), col.normal);
                var normal = Vector.length(Vector.projectOnPlane(rigidbody.velocity, col.normal)) < 2 && dp > 0.8 ? new Vector(0, 1, 0) : col.normal;
                
                var normal = col.normal;

                var depth = col.depth / Vector.dot(normal, col.normal);
                var pA = Vector.add(col.point, Vector.multiply(col.normal, -col.depth));

                constraintsToSolve.push({
                  C: -depth,
                  bodies: [
                    {
                      collider: collider,
                      body: rigidbody,
                      normal: normal,
                      p: pA
                    }
                  ]
                });

                // constraintsToSolve.push({
                //   colliderA: collider,
                //   bodyA: rigidbody,
                //   normal: normal,
                //   pA: pA,
                //   C: -depth
                // });

                if (Vector.dot(Vector.up(), normal) > 0.5) {
                  rigidbody.grounded = true;
                  rigidbody.groundNormal = normal;
                }

                Debug.Vector(pA, normal, depth);
              }
            }
          }
        }

        if (sphereColliders.length > 0 || capsuleColliders.length > 0) {
          rigidbodiesWithColliders.push(rigidbody);
        }

        // if (true) {
        //   var radius = 0.2;

        //   var q = octree.queryAABB(new AABB(
        //     Vector.subtract(rigidbody.position, Vector.fill(radius * 2)),
        //     Vector.add(rigidbody.position, Vector.fill(radius * 2))
        //   ));

        //   if (q) {
        //     for (var k = 0; k < q.length; k++) {
        //       var triangleNormal = getTriangleNormal(q[k]);
        //       var col = sphereToTriangle(Vector.add(rigidbody.position, new Vector(0, 1, 0)), radius, q[k][0], q[k][1], q[k][2], true);
        //       if (col) {
        //         var normal = col.normal;//triangleNormal;
                
        //         if (Vector.lengthSqr(normal) > 0.1 * 0.1 && col.depth > 0.001) {
        //           // console.log(q[k], normal, Vector.add(rigidbody.position, Vector.multiply(col.normal, -(radius - col.depth))), -col.depth);

        //           constraintsToSolve.push({
        //             bodyA: rigidbody,
        //             normal: normal,
        //             pA: Vector.add(rigidbody.position, Vector.multiply(normal, -(radius - col.depth))),
        //             C: -col.depth
        //           });
        //         }
        //       }
        //     }
        //   }
        // }

        // if (rigidbody.position.y < radius) {
        //   constraintsToSolve.push({
        //     bodyA: rigidbody,
        //     normal: Vector.up(),
        //     pA: Vector.add(rigidbody.position, new Vector(0, -radius, 0)),
        //     C: rigidbody.position.y - radius
        //   });
        // }
      }
    });

    // Sphere - sphere collision
    for (var r1 of rigidbodiesWithColliders) {
      for (var r2 of rigidbodiesWithColliders) {
        if (r1 != r2) {
          for (var c1 of r1.gameObject.findComponents("SphereCollider")) {
            for (var c2 of r2.gameObject.findComponents("SphereCollider")) {
              var d = Vector.distance(r1.position, r2.position);
              var C = d - (c1.radius + c2.radius);
              if (C < 0) {
                var normal = Vector.normalize(Vector.subtract(r1.position, r2.position));
                var pA = Vector.add(r1.position, Vector.multiply(normal, c1.radius));
                var pB = Vector.add(r2.position, Vector.multiply(normal, -c2.radius));

                constraintsToSolve.push({
                  C: C,
                  bodies: [
                    {
                      collider: c1,
                      body: r1,
                      normal: normal,
                      p: pA
                    },
                    {
                      collider: c2,
                      body: r2,
                      normal: Vector.negate(normal),
                      p: pB
                    }
                  ]
                });

                // constraintsToSolve.push({
                //   colliderA: c1,
                //   bodyA: r1,
                //   pA: pA,

                //   colliderB: c2,
                //   bodyB: r2,
                //   pB: pB,

                //   normal: normal,
                //   C: C
                // });
              }
            }
          }
        }
      }
    }

    // Apply rigidbody forces
    for (var rigidbody of allRigidbodies) {
      rigidbody.applyForces(this.dt);
    }

    // Solve constraints
    var lambdaAccumulated = new Array(constraintsToSolve.length).fill(0);
    for (var i = 0; i < this.constraintIterations; i++) {
      for (var constraintIndex = 0; constraintIndex < constraintsToSolve.length; constraintIndex++) {
        var constraint = constraintsToSolve[constraintIndex];
        var C = constraint.C ?? 0;

        if (C < -0.007 * 0) {
          var jacobian = [];
          var tangentJacobian = [];
          var bitangentJacobian = [];
          var velocities = [];
          var masses = [];

          if (constraint.bodies.length > 0) {
            for (var body of constraint.bodies) {
              var m = body.collider.disableRotationImpulse ? 0 : 1;

              var pc = Vector.cross(Vector.subtract(body.p, body.body.position), body.normal);
              jacobian.push(
                body.normal.x,
                body.normal.y,
                body.normal.z,
                pc.x * m,
                pc.y * m,
                pc.z * m
              );

              var [ tangent, bitangent ] = Vector.formOrthogonalBasis(body.normal);

              var pc = Vector.cross(Vector.subtract(body.p, body.body.position), tangent);
              tangentJacobian.push(
                tangent.x,
                tangent.y,
                tangent.z,
                pc.x * m,
                pc.y * m,
                pc.z * m
              );

              var pc = Vector.cross(Vector.subtract(body.p, body.body.position), bitangent);
              bitangentJacobian.push(
                bitangent.x,
                bitangent.y,
                bitangent.z,
                pc.x * m,
                pc.y * m,
                pc.z * m
              );

              velocities.push(
                body.body.velocity.x,
                body.body.velocity.y,
                body.body.velocity.z,
                body.body.angularVelocity.x,
                body.body.angularVelocity.y,
                body.body.angularVelocity.z
              );

              var it = body.body.inverseWorldInertia;

              masses.push(
                body.body.mass,
                body.body.mass,
                body.body.mass,
                1 / it[0],
                1 / it[5],
                1 / it[10]
                // body.body.inertia.x,
                // body.body.inertia.y,
                // body.body.inertia.z
              );
            }

            var { impulses, lambda } = getConstraintImpulse(jacobian, velocities, masses, C, this.dt, this.constraintBias, lambdaAccumulated, constraintIndex);

            if (!impulses.some(item => isNaN(item))) {
              var ind = 0;
              for (var body of constraint.bodies) {
                body.body.velocity.x += impulses[ind + 0] / masses[ind + 0];
                body.body.velocity.y += impulses[ind + 1] / masses[ind + 1];
                body.body.velocity.z += impulses[ind + 2] / masses[ind + 2];

                if (!body.body.lockRotation) {
                  body.body.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
                  body.body.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
                  body.body.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
                }

                ind += 6;
              }
            }

            // Friction
            var bias = 0;
            var friction = getCombinedFriction(constraint.bodies);

            var jacobians = [ tangentJacobian, bitangentJacobian ];
            for (var jacobian of jacobians) {
              var effectiveMass = getEffectiveMass(jacobian, masses);
              var frictionLambda = getLambda(effectiveMass, jacobian, velocities, bias);
              frictionLambda = clamp(frictionLambda, -friction * lambda, friction * lambda);
            
              var impulses = [];
              for (var _i = 0; _i < jacobian.length; _i++) {
                impulses[_i] = jacobian[_i] * frictionLambda;
              }

              if (!impulses.some(item => isNaN(item))) {
                var ind = 0;
                for (var body of constraint.bodies) {
                  body.body.velocity.x += impulses[ind + 0] / masses[ind + 0];
                  body.body.velocity.y += impulses[ind + 1] / masses[ind + 1];
                  body.body.velocity.z += impulses[ind + 2] / masses[ind + 2];

                  if (!body.body.lockRotation) {
                    body.body.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
                    body.body.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
                    body.body.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
                  }

                  ind += 6;
                }
              }
              // else {
              //   console.warn("NaN in impulses", {
              //     constraint, impulses, lambda, frictionLambda, jacobian, velocities, masses, C, dt: this.dt
              //   });
              // }
            }
          }








          // if (constraint.bodyA) {
          //   var cp1 = Vector.cross(Vector.subtract(constraint.pA, constraint.bodyA.position), constraint.normal);

          //   jacobian.push(
          //     constraint.normal.x,
          //     constraint.normal.y,
          //     constraint.normal.z,
          //     cp1.x,
          //     cp1.y,
          //     cp1.z
          //   );

          //   var tangent = Vector.negate(Vector.normalize(Vector.projectOnPlane(constraint.bodyA.velocity, constraint.normal)));
          //   var cp1 = Vector.cross(Vector.subtract(constraint.pA, constraint.bodyA.position), tangent);

          //   frictionJacobian.push(
          //     tangent.x,
          //     tangent.y,
          //     tangent.z,
          //     cp1.x,
          //     cp1.y,
          //     cp1.z
          //   );

          //   velocities.push(
          //     constraint.bodyA.velocity.x,
          //     constraint.bodyA.velocity.y,
          //     constraint.bodyA.velocity.z,
          //     constraint.bodyA.angularVelocity.x,
          //     constraint.bodyA.angularVelocity.y,
          //     constraint.bodyA.angularVelocity.z
          //   );

          //   masses.push(
          //     constraint.bodyA.mass,
          //     constraint.bodyA.mass,
          //     constraint.bodyA.mass,
          //     constraint.bodyA.inertia.x,
          //     constraint.bodyA.inertia.y,
          //     constraint.bodyA.inertia.z
          //   );
          // }

          // if (constraint.bodyB) {
          //   var cp2 = Vector.cross(Vector.subtract(constraint.pB, constraint.bodyB.position), constraint.normal);

          //   jacobian.push(
          //     -constraint.normal.x,
          //     -constraint.normal.y,
          //     -constraint.normal.z,
          //     -cp2.x,
          //     -cp2.y,
          //     -cp2.z
          //   );

          //   var tangent = Vector.length(constraint.bodyB.velocity) < 0.01 ? new Vector(1, 0, 0) : Vector.normalize(Vector.projectOnPlane(constraint.bodyB.velocity, constraint.normal));
          //   var cp1 = Vector.cross(Vector.subtract(constraint.pB, constraint.bodyB.position), tangent);

          //   frictionJacobian.push(
          //     tangent.x,
          //     tangent.y,
          //     tangent.z,
          //     cp1.x,
          //     cp1.y,
          //     cp1.z
          //   );

          //   velocities.push(
          //     constraint.bodyB.velocity.x,
          //     constraint.bodyB.velocity.y,
          //     constraint.bodyB.velocity.z,
          //     constraint.bodyB.angularVelocity.x,
          //     constraint.bodyB.angularVelocity.y,
          //     constraint.bodyB.angularVelocity.z
          //   );

          //   masses.push(
          //     constraint.bodyB.mass,
          //     constraint.bodyB.mass,
          //     constraint.bodyB.mass,
          //     constraint.bodyB.inertia.x,
          //     constraint.bodyB.inertia.y,
          //     constraint.bodyB.inertia.z
          //   );
          // }

          // // Collision
          // var { impulses, lambda } = getConstraintImpulse(jacobian, velocities, masses, C, this.dt, this.constraintBias, lambdaAccumulated, constraintIndex);

          // if (!impulses.some(item => isNaN(item))) {
          //   var ind = 0;
          //   if (constraint.bodyA) {
          //     constraint.bodyA.velocity.x += impulses[ind + 0] / masses[ind + 0];
          //     constraint.bodyA.velocity.y += impulses[ind + 1] / masses[ind + 1];
          //     constraint.bodyA.velocity.z += impulses[ind + 2] / masses[ind + 2];

          //     if (!constraint.bodyA.lockRotation) {
          //       constraint.bodyA.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
          //       constraint.bodyA.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
          //       constraint.bodyA.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
          //     }
          //     ind += 6;
          //   }

          //   if (constraint.bodyB) {
          //     constraint.bodyB.velocity.x += impulses[ind + 0] / masses[ind + 0];
          //     constraint.bodyB.velocity.y += impulses[ind + 1] / masses[ind + 1];
          //     constraint.bodyB.velocity.z += impulses[ind + 2] / masses[ind + 2];

          //     if (!constraint.bodyB.lockRotation) {
          //       constraint.bodyB.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
          //       constraint.bodyB.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
          //       constraint.bodyB.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
          //     }
          //   }
          // }
          // else {
          //   console.warn("NaN in impulses", {
          //     constraint, impulses, jacobian, velocities, masses, C, dt: this.dt
          //   });
          // }

          // // Friction
          // var bias = 0;
          // var effectiveMass = getEffectiveMass(frictionJacobian, masses);
          // var frictionLambda = getLambda(effectiveMass, frictionJacobian, velocities, bias);

          // var friction = constraint.colliderA.friction;
          // frictionLambda = clamp(frictionLambda, -friction * lambda, friction * lambda);
        
          // var impulses = [];
          // for (var _i = 0; _i < frictionJacobian.length; _i++) {
          //   impulses[_i] = frictionJacobian[_i] * frictionLambda;
          // }

          // if (!impulses.some(item => isNaN(item))) {
          //   var ind = 0;
          //   if (constraint.bodyA) {
          //     constraint.bodyA.velocity.x += impulses[ind + 0] / masses[ind + 0];
          //     constraint.bodyA.velocity.y += impulses[ind + 1] / masses[ind + 1];
          //     constraint.bodyA.velocity.z += impulses[ind + 2] / masses[ind + 2];

          //     if (!constraint.bodyA.lockRotation) {
          //       constraint.bodyA.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
          //       constraint.bodyA.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
          //       constraint.bodyA.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
          //     }
          //     ind += 6;
          //   }

          //   if (constraint.bodyB) {
          //     constraint.bodyB.velocity.x += impulses[ind + 0] / masses[ind + 0];
          //     constraint.bodyB.velocity.y += impulses[ind + 1] / masses[ind + 1];
          //     constraint.bodyB.velocity.z += impulses[ind + 2] / masses[ind + 2];

          //     if (!constraint.bodyB.lockRotation) {
          //       constraint.bodyB.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
          //       constraint.bodyB.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
          //       constraint.bodyB.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
          //     }
          //   }
          // }
          // else {
          //   console.warn("NaN in impulses", {
          //     constraint, impulses, jacobian, velocities, masses, C, dt: this.dt
          //   });
          // }
        }
      }
    }

    // Integrate position and rotation
    for (var rigidbody of allRigidbodies) {
      rigidbody.integrate(this.dt);
    }
  }

  this.update = function() {
    // updatePhysics();
    // this.time += this.dt;
    // return;

    var newTime = performance.now();
    var frameTime = (newTime - lastTime) / 1000;
    frameTime = Math.min(frameTime, 0.4);
    lastTime = newTime;

    accumulator += frameTime;

    while (accumulator >= this.dt) {
      updatePhysics();
      accumulator -= this.dt;
      this.time += this.dt;
    }
  }

  this.getConstraintImpulse = getConstraintImpulse;
  function getConstraintImpulse(jacobian, velocities, masses, C, dt, biasFactor = 0.5, lambdaAccumulated, index) {
    var slop = -0.01;
    var bias;
    if (C < slop) {
      bias = biasFactor / dt * (C - slop);
    }
    else {
      bias = 0;
    }
  
    var effectiveMass = getEffectiveMass(jacobian, masses);
    var lambda = getLambda(effectiveMass, jacobian, velocities, bias);

    // bruh not recommended
    // lambda = Math.max(lambda, 0);

    if (Array.isArray(lambdaAccumulated)) {
      if (lambdaAccumulated[index] + lambda < 0) {
        lambda = -lambdaAccumulated[index];
      }
      lambdaAccumulated[index] += lambda;
    }
  
    var output = [];
    for (var i = 0; i < jacobian.length; i++) {
      output[i] = jacobian[i] * lambda;
    }
    return {
      impulses: output,
      lambda
    };
  }
  
  function getLambda(effectiveMass, jacobian, velocities, bias) {
    var sum = 0;
    for (var i = 0; i < jacobian.length; i++) {
      sum += jacobian[i] * velocities[i];
    }
    return -effectiveMass * (sum + bias);
  }
  
  function getEffectiveMass(jacobian, masses) {
    var sum = 0;
    for (var i = 0; i < jacobian.length; i++) {
      sum += (jacobian[i] / masses[i]) * jacobian[i];
    }

    return 1 / sum;
  }

  function getCombinedFriction(bodies) {
    var f = 1;
    for (var body of bodies) {
      f *= body.collider.friction;
    }
    return f;
  }
}

class Collider {
  constructor() {
    this.gameObject = null;
    this.friction = 0.5;

    this.disableRotationImpulse = false;
  }
}

class SphereCollider extends Collider {
  constructor(radius, offset = Vector.zero()) {
    super();
    this.radius = radius;
    this.offset = offset;
  }
}

class CapsuleCollider extends Collider {
  constructor(radius, a = Vector.zero(), b = Vector.up()) {
    super();
    this.radius = radius;
    this.a = a;
    this.b = b;
  }
}

class Rigidbody {
  constructor() {
    this.gameObject = null;

    this.COMOffset = Vector.zero();

    this.mass = 1;
    this.position = Vector.zero();
    this.velocity = Vector.zero();
    this.force = Vector.zero();

    this._inertia = Vector.one(); // Bruh
    this._inverseLocalInertiaMatrix = Matrix.identity();
    this.inverseWorldInertia = Matrix.identity();

    this.rotation = Quaternion.identity();
    // this.angularMomentum = Vector.zero();
    this.angularVelocity = Vector.zero();
    this.torque = Vector.zero();

    this.frozen = false;
    this.lockRotation = false;

    this.gravity = new Vector(0, -9.82, 0);
    this.gravityScale = 1;
  }

  set inertia(inertia) {
    Vector.set(this._inertia, inertia);
    Matrix.set(this._inverseLocalInertiaMatrix,
      1 / this.inertia.x, 0, 0, 0,
      0, 1 / this.inertia.y, 0, 0,
      0, 0, 1 / this.inertia.z, 0,
      0, 0, 0, 1
    );
  }

  get inertia() {
    return this._inertia;
  }

  // set angularVelocity(vel) {
  //   this.angularMomentum = Vector.compMultiply(vel, this.getWorldInertiaTensor());
  // }

  // get angularVelocity() {
  //   return Vector.compDivide(this.angularMomentum, this.getWorldInertiaTensor());
  // }

  _updateInverseWorldInertiaMatrix() {
    // bruh
    if (this.gameObject) {
      var R = Matrix.removeTranslation(Matrix.copy(this.gameObject.transform.worldMatrix));

      Matrix.identity(this.inverseWorldInertia);
      Matrix.multiply(R, this._inverseLocalInertiaMatrix, this.inverseWorldInertia);
      Matrix.multiply(this.inverseWorldInertia, Matrix.transpose(R), this.inverseWorldInertia);

      // Matrix.copy(this._inverseLocalInertiaMatrix, this.inverseWorldInertia);
    }
  }

  getWorldCOMOffset() {
    // bruh
    if (this.gameObject) {
      var mat = Matrix.removeTranslation(Matrix.copy(this.gameObject.transform.worldMatrix));
      return Matrix.transformVector(mat, this.COMOffset);
    }

    return this.COMOffset;
  }

  GetPointVelocity(position) {
    var r = Vector.subtract(position, Vector.add(this.position, this.getWorldCOMOffset()));
    return Vector.add(this.velocity, Vector.cross(this.angularVelocity, r));
  }

  AddForceAtPosition(force, position) {
    if (this.frozen) {
      return;
    }
    
    this.AddForce(force);
    var r = Vector.subtract(position, Vector.add(this.position, this.getWorldCOMOffset()));
    this.AddTorque(Vector.cross(r, force));
  }

  AddImpulseAtPosition(force, position) {
    if (this.frozen) {
      return;
    }

    this.velocity = Vector.add(this.velocity, Vector.multiply(force, 1 / this.mass));
    var r = Vector.subtract(position, Vector.add(this.position, this.getWorldCOMOffset()));
    var torque = Vector.cross(r, force);
    this._updateInverseWorldInertiaMatrix(); // bruh
    this.angularVelocity = Vector.add(this.angularVelocity, Matrix.transformVector(this.inverseWorldInertia, torque));
    // this.angularVelocity = Vector.add(this.angularVelocity, Vector.compMultiply(torque, this.getInverseWorldInertiaMatrix()));
  }

  AddForce(force) {
    if (this.frozen) {
      return;
    }

    this.force = Vector.add(this.force, force);
  }

  AddTorque(torque) {
    if (this.frozen) {
      return;
    }

    this.torque = Vector.add(this.torque, torque);
  }

  applyForces(dt) {
    if (this.frozen) {
      return;
    }

    // Apply force
    this.velocity = Vector.add(this.velocity, Vector.multiply(this.force, dt / this.mass));
    this.force = Vector.zero();

    // Apply gravity
    this.velocity = Vector.add(this.velocity, Vector.multiply(this.gravity, this.gravityScale * dt));

    // Apply torque
    if (!this.lockRotation) {
      this._updateInverseWorldInertiaMatrix(); // bruh
      this.angularVelocity = Vector.add(this.angularVelocity, Matrix.transformVector(this.inverseWorldInertia, this.torque));
      // this.angularVelocity = Vector.add(this.angularVelocity, Vector.multiply(Vector.compDivide(this.torque, this.getWorldInertiaTensor()), dt));
    }
    this.torque = Vector.zero();
  }

  integrate(dt) {
    if (this.frozen) {
      return;
    }

    this.position = Vector.add(this.position, Vector.multiply(this.velocity, dt));

    if (this.lockRotation) {
      this.rotation = Quaternion.identity();
    }
    else {
      var w = new Quaternion(
        this.angularVelocity.x,
        this.angularVelocity.y,
        this.angularVelocity.z,
        0
      );
      this.rotation = Quaternion.add(this.rotation, Quaternion.multiply(Quaternion.QxQ(w, this.rotation), dt / 2));
    }

    this.updateGameObject();
  }

  updateGameObject() {
    if (this.gameObject != null) {
      this.gameObject.transform.position = this.position;
      this.gameObject.transform.rotation = this.rotation;
    }

    this._updateInverseWorldInertiaMatrix();
  }
}

export {
  CreateCubeCollider,
  AABBCollider,
  MeshCollider,
  Octree,
  AABB,
  PhysicsEngine,
  Collider,
  SphereCollider,
  CapsuleCollider,
  Rigidbody
};