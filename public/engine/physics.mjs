// if (typeof window == "undefined") {
//   import("module").then(e => {
//     var { createRequire } = e;
//     const require = createRequire(import.meta.url);
//     const { performance } = require('perf_hooks');
//     global.performance = performance;
//   });
// }

import Vector from "./vector.mjs";
import Matrix from "./matrix.mjs";
import Quaternion from "./quaternion.mjs";
import { clamp } from "./helper.mjs";

import {
  AABBToAABB,
  rayToTriangle,
  AABBTriangleToAABB,
  AABBToTriangle,
  rayToAABB,
  getTriangleNormal,
  sphereToTriangle,
  capsuleToTriangle,
  rayToAABBTriangle,
  triangleTriangleIntersection,
  AABBTriangleToAABBTriangle,
} from "./algebra.mjs";
import { Scene } from "./scene.mjs";
import { EventHandler } from "./eventHandler.mjs";
import { CubeGeometry, MeshGeometry, VClip, computeDistance } from "./vclip.mjs";

// export function CreateCubeCollider(pos, scale, rot) {
//   var aabb = new AABBCollider(Vector.subtract(pos, scale), Vector.add(pos, scale), Matrix.transform([
//     ["rx", rot.x],
//     ["ry", rot.y],
//     ["rz", rot.z]
//   ]));
//   colliders.push(aabb);
// }

// export function AABBCollider(bl, tr, matrix = Matrix.identity(), inverted = false) {
//   this.bl = bl || {x: -5, y: -5, z: -5};
//   this.tr = tr || {x: 5, y: 5, z: 5};
//   this.inverted = inverted;
//   this.matrix = matrix;
//   this.inverseMatrix = Matrix.inverse(this.matrix);

//   this.vertices = [
//     {x: this.tr.x, y: this.tr.y, z: this.tr.z},
//     {x: this.bl.x, y: this.tr.y, z: this.tr.z},
//     {x: this.bl.x, y: this.tr.y, z: this.bl.z},
//     {x: this.tr.x, y: this.tr.y, z: this.bl.z},

//     {x: this.tr.x, y: this.bl.y, z: this.tr.z},
//     {x: this.bl.x, y: this.bl.y, z: this.tr.z},
//     {x: this.bl.x, y: this.bl.y, z: this.bl.z},
//     {x: this.tr.x, y: this.bl.y, z: this.bl.z},
//   ];

//   this.planes = [
//     [0, 1, 2, 3],
//     [4, 5, 6, 7],
//     [0, 1, 5, 4],
//     [1, 2, 6, 5],
//     [2, 3, 7, 6],
//     [0, 3, 7, 4]
//   ];

//   this.planeNormals = [
//     {x: 0, y: 1, z: 0},
//     {x: 0, y: -1, z: 0},
//     {x: 0, y: 0, z: 1},
//     {x: -1, y: 0, z: 0},
//     {x: 0, y: 0, z: -1},
//     {x: 1, y: 0, z: 0}
//   ];

//   if (this.inverted) {
//     for (var i = 0; i < this.planeNormals.length; i++) {
//       this.planeNormals[i] = Vector.multiply(this.planeNormals[i], -1);
//     }
//   }

//   var aabbGameObject = scene.root.getChild("AABB");
//   if (aabbGameObject) {
//     aabbGameObject.meshRenderer.addInstance(Matrix.multiply(Matrix.transform([
//       ["translate", Vector.divide(Vector.add(this.bl, this.tr), 2)],
//       ["sx", (this.tr.x - this.bl.x) / 2],
//       ["sy", (this.tr.y - this.bl.y) / 2],
//       ["sz", (this.tr.z - this.bl.z) / 2]
//     ]), Matrix.copy(this.matrix)));
//   }

//   this.getNormal = function(point) {
//     var aabbPos = Vector.divide(Vector.add(this.bl, this.tr), 2);
//     point = Matrix.matrixToVector(Matrix.multiplyMat4Vec(this.matrix, Matrix.vectorToMatrix(Vector.subtract(point, aabbPos))));
//     point = Vector.add(point, aabbPos);

//     var smallestDistance = Infinity;
//     var plane;

//     for (var i = 0; i < this.planes.length; i++) {
//       var normal = this.planeNormals[i];
//       var distance = Vector.dot(normal, Vector.subtract(point, this.vertices[this.planes[i][0]]));
//       var pointOnPlane = Vector.subtract(point, Vector.multiply(normal, distance));

//       pointOnPlane.x = clamp(pointOnPlane.x, this.bl.x, this.tr.x);
//       pointOnPlane.y = clamp(pointOnPlane.y, this.bl.y, this.tr.y);
//       pointOnPlane.z = clamp(pointOnPlane.z, this.bl.z, this.tr.z);

//       distance = Vector.distance(pointOnPlane, point);

//       if (distance < smallestDistance) {
//         smallestDistance = distance;
//         plane = i;
//       }
//     }

//     return {
//       normal: Matrix.matrixToVector(Matrix.multiplyMat4Vec(this.inverseMatrix, Matrix.vectorToMatrix(this.planeNormals[plane]))),
//       distance: smallestDistance
//     };
//   };

//   this.pointInside = function(point) {
//     var aabbPos = Vector.divide(Vector.add(this.bl, this.tr), 2);
//     point = Matrix.matrixToVector(Matrix.multiplyMat4Vec(this.matrix, Matrix.vectorToMatrix(Vector.subtract(point, aabbPos))));
//     point = Vector.add(point, aabbPos);

//     return xor(this.inverted, point.x >= this.bl.x && point.x <= this.tr.x &&
//                               point.y >= this.bl.y && point.y <= this.tr.y &&
//                               point.z >= this.bl.z && point.z <= this.tr.z);
//   };
// }

// function MeshCollider(data, matrix = Matrix.identity()) {
//   this.vertices = data.position.bufferData;
//   this.indices = data.indices.bufferData;
//   this.matrix = matrix;

//   this.raycast = function(origin, direction) {
//     var smallestDistance = Infinity;
//     var normal;
//     var point;

//     for (var i = 0; i < this.indices.length; i += 3) {
//       var i1 = this.indices[i];
//       var i2 = this.indices[i + 1];
//       var i3 = this.indices[i + 2];

//       var a = {
//         x: this.vertices[i1 * 3],
//         y: this.vertices[i1 * 3 + 1],
//         z: this.vertices[i1 * 3 + 2]
//       };

//       var b = {
//         x: this.vertices[i2 * 3],
//         y: this.vertices[i2 * 3 + 1],
//         z: this.vertices[i2 * 3 + 2]
//       };

//       var c = {
//         x: this.vertices[i3 * 3],
//         y: this.vertices[i3 * 3 + 1],
//         z: this.vertices[i3 * 3 + 2]
//       };

//       a = Matrix.transformVector(this.matrix, a);
//       b = Matrix.transformVector(this.matrix, b);
//       c = Matrix.transformVector(this.matrix, c);

//       var hitPoint = rayToTriangle(origin, direction, a, b, c);
//       if (hitPoint && hitPoint.distance < smallestDistance) {
//         smallestDistance = hitPoint.distance;
//         normal = Vector.normalize(Vector.cross(Vector.subtract(b, a), Vector.subtract(c, a)));
//         point = hitPoint.point;
//       }
//     }

//     return {
//       distance: smallestDistance,
//       normal: normal,
//       point: point
//     };
//   }

//   this.getNormal = function(point) {
//     var smallestDistance = Infinity;
//     var normal;

//     for (var i = 0; i < this.indices.length; i += 3) {
//       var i1 = this.indices[i];
//       var i2 = this.indices[i + 1];
//       var i3 = this.indices[i + 2];

//       var a = {
//         x: this.vertices[i1 * 3],
//         y: this.vertices[i1 * 3 + 1],
//         z: this.vertices[i1 * 3 + 2]
//       }

//       var b = {
//         x: this.vertices[i2 * 3],
//         y: this.vertices[i2 * 3 + 1],
//         z: this.vertices[i2 * 3 + 2]
//       }

//       var c = {
//         x: this.vertices[i3 * 3],
//         y: this.vertices[i3 * 3 + 1],
//         z: this.vertices[i3 * 3 + 2]
//       }

//       var pointOnTriangle = closestPointOnTriangle(point, a, b, c);
//       if (pointOnTriangle) {
//         var distance = Vector.distance(point, pointOnTriangle);
//         if (distance < smallestDistance) {
//           smallestDistance = distance;
//           normal = Vector.normalize(Vector.cross(Vector.subtract(b, a), Vector.subtract(c, a)));
//         }
//       }
//     }

//     return {
//       normal: normal,
//       distance: smallestDistance
//     };
//   }
// }

function Octree(aabb, maxDepth = 5) {
  this.aabb = aabb;
  this.children = [];
  this.items = [];
  this.maxDepth = maxDepth;
  this.divided = false;

  this.trianglesArray = null;
  this.gameObjectLookup = null;
  this.gameObjects = null;

  this.query = function(origin, direction) {
    var indices = this._query((cAABB) => {
      return rayToAABB(origin, direction, cAABB);
    });
    
    if (!indices) {
      return false;
    }

    var triangles = new Array(indices.length);
    var gameObjectIndices = new Array(indices.length);

    for (let i = 0; i < indices.length; i++) {
      triangles[i] = this.getTriangleFromIndex(this.trianglesArray, indices[i]);
      if (this.gameObjectLookup) {
        gameObjectIndices[i] = this.gameObjectLookup[indices[i] / 9];
      }
    }

    return {
      triangles,
      gameObjectIndices,
    };
  };

  this.queryAABB = function(aabb) {
    var indices = this._query((cAABB) => {
      return AABBToAABB(cAABB, aabb);
    });

    if (!indices) {
      return false;
    }

    var triangles = new Array(indices.length);
    var nameIndices = new Array(indices.length);

    for (let i = 0; i < indices.length; i++) {
      triangles[i] = this.getTriangleFromIndex(this.trianglesArray, indices[i]);
      // nameIndices[i] = this.gameObjectLookup[indices[i]];
    }

    return {
      triangles,
      nameIndices,
    };
  };

  this._query = function(func, output = []) {
    if (!func(this.aabb)) {
      return;
    }

    for (let i = 0; i < this.items.length; i++) {
      // if (!output.includes(this.items[i])) {
      output.push(this.items[i]);
      // }
    }

    for (let i = 0; i < this.children.length; i++) {
      this.children[i]._query(func, output);
    }

    return output;
  };

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

  this.addTriangles = function(trianglesArray, gameObjectLookup, gameObjects) {
    if (typeof window !== "undefined") window.aabbcalls = 0;

    this.trianglesArray = trianglesArray;
    this.gameObjectLookup = gameObjectLookup;
    this.gameObjects = gameObjects;
    
    for (var i = 0; i < this.trianglesArray.length; i += 9) {
      var v1 = {x: this.trianglesArray[i + 0], y: this.trianglesArray[i + 1], z: this.trianglesArray[i + 2]};
      var v2 = {x: this.trianglesArray[i + 3], y: this.trianglesArray[i + 4], z: this.trianglesArray[i + 5]};
      var v3 = {x: this.trianglesArray[i + 6], y: this.trianglesArray[i + 7], z: this.trianglesArray[i + 8]};
      this.addTriangle(i, [v1, v2, v3]);
    }
  };

  this.addTriangle = function(index, triangle, depth = 0) {
    if (depth > this.maxDepth || !(AABBTriangleToAABB(triangle[0], triangle[1], triangle[2], this.aabb) && AABBToTriangle(this.aabb, triangle))) {
      return false;
    }

    if (!this.divided && depth < this.maxDepth) {
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
  };

  this.getTriangleFromIndex = function(arr, i) {
    var v1 = {x: arr[i + 0], y: arr[i + 1], z: arr[i + 2]};
    var v2 = {x: arr[i + 3], y: arr[i + 4], z: arr[i + 5]};
    var v3 = {x: arr[i + 6], y: arr[i + 7], z: arr[i + 8]};
    return [v1, v2, v3];
  };

  this.getGameObjectFromIndex = function(index) {
    if (Array.isArray(this.gameObjects)) {
      return this.gameObjects[index];
    }

    return null;
  };

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
  };

  this.render = function(scene, topCall = true) {
    if (this.items.length > 0) {
      var aabb = this.aabb;
      scene.root.getChild("AABB").meshRenderer.addInstance(Matrix.transform([
        ["translate", Vector.divide(Vector.add(aabb.bl, aabb.tr), 2)],
        ["sx", (aabb.tr.x - aabb.bl.x) / 2],
        ["sy", (aabb.tr.y - aabb.bl.y) / 2],
        ["sz", (aabb.tr.z - aabb.bl.z) / 2]
      ]), false);
    }

    if (this.children.length == 0) {
      // var aabb = this.aabb;
      // scene.root.getChild("AABB").meshRenderer.addInstance(Matrix.transform([
      //   ["translate", Vector.divide(Vector.add(aabb.bl, aabb.tr), 2)],
      //   ["sx", (aabb.tr.x - aabb.bl.x) / 2],
      //   ["sy", (aabb.tr.y - aabb.bl.y) / 2],
      //   ["sz", (aabb.tr.z - aabb.bl.z) / 2]
      // ]), false);
    }
    else {
      for (var i = 0; i < this.children.length; i++) {
        this.children[i].render(scene, false);
      }
    }
    
    if (topCall) {
      scene.root.getChild("AABB").meshRenderer.updateMatrixData();
    }
  };
}

function SimpleAABB(bl, tr) {
  if (typeof window !== "undefined") window.aabbcalls++;
  this.bl = bl;
  this.tr = tr;
}

function AABB(bl, tr) {
  this.isEmpty = !bl && !tr;

  this.bl = bl ?? Vector.zero();
  this.tr = tr ?? Vector.zero();

  var infVec = Vector.fill(Infinity);
  var negInfVec = Vector.fill(-Infinity);

  this.copy = function(dst) {
    let aabb = dst || new AABB();
    aabb.bl = Vector.copy(this.bl); // bruh gc
    aabb.tr = Vector.copy(this.tr); // ^
    aabb.isEmpty = this.isEmpty;
    return aabb;
  };

  this.addPadding = function(padding = 0) {
    this.bl.x -= padding;
    this.bl.y -= padding;
    this.bl.z -= padding;
    this.tr.x += padding;
    this.tr.y += padding;
    this.tr.z += padding;
  };

  this.extend = function(pointOrAABBorPadding) {
    if (pointOrAABBorPadding instanceof AABB) {
      var aabb = pointOrAABBorPadding;
      Vector.compFunc(this.isEmpty ? infVec : this.bl, aabb.bl, Math.min, this.bl);
      Vector.compFunc(this.isEmpty ? negInfVec : this.tr, aabb.tr, Math.max, this.tr);
    }
    else if (Vector.isVectorIsh(pointOrAABBorPadding)) {
      var point = pointOrAABBorPadding;
      Vector.compFunc(this.isEmpty ? infVec : this.bl, point, Math.min, this.bl);
      Vector.compFunc(this.isEmpty ? negInfVec : this.tr, point, Math.max, this.tr);
    }
    else {
      this.addPadding(pointOrAABBorPadding);
    }

    this.isEmpty = false;
  };

  // this.extend = function(pointOrAABBorPadding) {
  //   if (pointOrAABBorPadding instanceof AABB) {
  //     var aabb = pointOrAABBorPadding;
  //     this.bl = Vector.compFunc(this.isEmpty ? infVec : this.bl, aabb.bl, Math.min);
  //     this.tr = Vector.compFunc(this.isEmpty ? negInfVec : this.tr, aabb.tr, Math.max);
  //   }
  //   else if (Vector.isVectorIsh(pointOrAABBorPadding)) {
  //     var point = pointOrAABBorPadding;
  //     this.bl = Vector.compFunc(this.isEmpty ? infVec : this.bl, point, Math.min);
  //     this.tr = Vector.compFunc(this.isEmpty ? negInfVec : this.tr, point, Math.max);
  //   }
  //   else {
  //     this.addPadding(pointOrAABBorPadding);
  //   }

  //   this.isEmpty = false;
  // };

  this.pointInside = function(point) {
    return point.x >= this.bl.x && point.y >= this.bl.y && point.z >= this.bl.z &&
           point.x <= this.tr.x && point.y <= this.tr.y && point.z <= this.tr.z;
  };

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
  };

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

  const _center = new Vector();
  this.getCenter = function() {
    Vector.average(this.tr, this.bl, _center);
    return Vector.copy(_center);
  };

  const _size = new Vector();
  this.getSize = function() {
    Vector.subtract(this.tr, this.bl, _size);
    return Vector.copy(_size);
  };
  
  this.translate = function(t) {
    Vector.addTo(this.bl, t);
    Vector.addTo(this.tr, t);
  };

  // this.transform = function(matrix) {
  //   return new AABB(
  //     Matrix.transformVector(matrix, this.bl),
  //     Matrix.transformVector(matrix, this.tr)
  //   );
  // }

  const _transformedVertex = new Vector();
  this.approxTransform = function(matrix) {
    var vertices = this.getVertices();

    this.isEmpty = true;
    Vector.zero(this.bl);
    Vector.zero(this.tr);

    for (var vertex of vertices) {
      Matrix.transformVector(matrix, vertex, _transformedVertex);
      this.extend(_transformedVertex);
    }
    return this;
  };

  this.isInsideFrustum = function(frustum) {
    return (
      this.isAbovePlane(frustum.leftPlane) &&
      this.isAbovePlane(frustum.rightPlane) &&
      this.isAbovePlane(frustum.nearPlane) &&
      this.isAbovePlane(frustum.farPlane) &&
      this.isAbovePlane(frustum.topPlane) &&
      this.isAbovePlane(frustum.bottomPlane)
    );
  };

  const _halfSize = new Vector();
  this.isAbovePlane = function(plane) {
    Vector.subtract(this.tr, this.bl, _halfSize);
    Vector.divideTo(_halfSize, 2);

    Vector.average(this.tr, this.bl, _center);

    const r =
      _halfSize.x * Math.abs(plane.normal.x) +
      _halfSize.y * Math.abs(plane.normal.y) +
      _halfSize.z * Math.abs(plane.normal.z);

    return -r <= plane.getSignedDistanceToPlane(_center);
  };
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
};

// bruh generates garbage together with physics octree
function GetMeshAABB(gameObject, padding, ignoreGameObjects) {
  var aabb = new AABB();

  gameObject.traverse(o => {
    if (ignoreGameObjects && ignoreGameObjects.includes(o)) {
      return;
    }

    if (o.meshRenderer && !o.meshRenderer.skin) {
      // var noTranslateWorldMatrix = Matrix.copy(o.transform.worldMatrix);
      // Matrix.removeTranslation(noTranslateWorldMatrix);

      for (var i = 0; i < o.meshRenderer.meshData.length; i++) {
        var md = o.meshRenderer.meshData[i];

        if (md.data.position && md.data.indices) {
          for (var j = 0; j < md.data.position.bufferData.length; j += 3) {
            var v = {
              x: md.data.position.bufferData[j],
              y: md.data.position.bufferData[j + 1],
              z: md.data.position.bufferData[j + 2]
            };
            v = Matrix.transformVector(o.transform.worldMatrix, v);
            aabb.extend(v);
          }
        }
      }
    }
  });

  if (padding) {
    aabb.addPadding(padding);
  }

  return aabb;
}

function PhysicsEngine(scene, settings = {}) {
  if (typeof scene !== "undefined" && !(scene instanceof Scene)) {
    throw new Error("scene is not of class 'Scene'");
  }

  const physicsEngine = this;
  this.scene = scene;

  this.gravity = new Vector(0, -9.82, 0);

  var components = [];
  let constraintsToSolve = [];
  this.constraintIterations = 100;//20;//5;
  this.constraintBias = 0.4;

  this.dt = 1 / 60;
  var lastTime = performance.now();
  var accumulator = 0;
  this.time = 0;
  this.multipleTimestepsPerFrame = settings.multipleTimestepsPerFrame ?? true;

  this.fixedUpdate = () => {};

  // bruh make dynamicly resize when adding mesh
  var meshCollidersToAdd = [];
  // var aabb = new AABB(new Vector(-250, -35.33, -250), new Vector(250, 30, 250));
  // var aabb = new AABB(new Vector(-30.33, -35.33, -40.33), new Vector(30, 3.6, 40));
  // this.octree = new Octree(aabb, 4);
  this.octree = new Octree(new AABB(Vector.fill(-1), Vector.fill(1)), settings.octreeLevels ?? 4);

  this.eventHandler = new EventHandler();
  this.on = this.eventHandler.on.bind(this.eventHandler);

  this.add = function(component) {
    components.push(component);
    return component;
  };

  const v1 = new Vector();
  const v2 = new Vector();
  const v3 = new Vector();

  const triangle = [
    new Vector(),
    new Vector(),
    new Vector(),
  ];
  const point = new Vector();

  function RaycastHit(distance = 0, normal = new Vector(), point = new Vector(), gameObject = null) {
    this.distance = distance;
    this.normal = normal;
    this.point = point;
    this.gameObject = gameObject;
  }

  this.Raycast = function(origin, direction, raycastHit = new RaycastHit()) {
    let smallestDistance = Infinity;
    let didHit = false;

    let gameObjectIndex;
    let octree;
  
    var q = this.octree.query(origin, direction);
    if (q) {
      let triangles = q.triangles;
      for (let k = 0; k < triangles.length; k++) {
        let hitPoint = rayToTriangle(origin, direction, triangles[k][0], triangles[k][1], triangles[k][2]);
        if (hitPoint && hitPoint.distance < smallestDistance) {
          didHit = true;
          smallestDistance = hitPoint.distance;

          Vector.set(triangle[0], triangles[k][0]);
          Vector.set(triangle[1], triangles[k][1]);
          Vector.set(triangle[2], triangles[k][2]);

          Vector.set(point, hitPoint.point);

          gameObjectIndex = q.gameObjectIndices[k];
          octree = this.octree;
        }
      }
    }

    if (this.scene) {
      this.scene.root.traverseCondition(function(gameObject) {
        const components = gameObject.getComponents();
        for (const component of components) {
          if (component.type == "MeshCollider") {
            const meshCollider = component;
            const currentOctree = meshCollider.octree;

            if (currentOctree) {
              const arr = currentOctree.trianglesArray;

              const indices = []; // bruh gc
              currentOctree._query((cAABB) => rayToAABB(origin, direction, cAABB), indices);

              for (let i = 0; i < indices.length; i++) {
                const index = indices[i];
                
                v1.x = arr[index + 0];
                v1.y = arr[index + 1];
                v1.z = arr[index + 2];

                v2.x = arr[index + 3];
                v2.y = arr[index + 4];
                v2.z = arr[index + 5];

                v3.x = arr[index + 6];
                v3.y = arr[index + 7];
                v3.z = arr[index + 8];

                if (!rayToAABBTriangle(origin, direction, v1, v2, v3)) {
                  continue;
                }

                const hitPoint = rayToTriangle(origin, direction, v1, v2, v3);

                if (hitPoint && hitPoint.distance < smallestDistance) {
                  didHit = true;
                  smallestDistance = hitPoint.distance;

                  Vector.set(triangle[0], v1);
                  Vector.set(triangle[1], v2);
                  Vector.set(triangle[2], v3);

                  Vector.set(point, hitPoint.point);

                  gameObjectIndex = currentOctree.gameObjectLookup[index / 9];
                  octree = currentOctree;
                }
              }
            }
          }
        }
      }, child => child.active && child.visible);
    }
  
    if (didHit) {
      raycastHit = raycastHit || new RaycastHit();

      const gameObject = octree.getGameObjectFromIndex(gameObjectIndex);

      raycastHit.distance = smallestDistance;
      getTriangleNormal(triangle, raycastHit.normal);
      Vector.set(raycastHit.point, point);
      raycastHit.gameObject = gameObject;

      return raycastHit;
    }

    return null;
  };

  // this.Raycast = function(origin, direction) {
  //   let smallestDistance = Infinity;
  //   let triangle;
  //   let point;
  //   let gameObjectIndex;
  //   let octree;
  
  //   var q = this.octree.query(origin, direction);
  //   if (q) {
  //     let triangles = q.triangles;
  //     for (let k = 0; k < triangles.length; k++) {
  //       let hitPoint = rayToTriangle(origin, direction, triangles[k][0], triangles[k][1], triangles[k][2]);
  //       if (hitPoint && hitPoint.distance < smallestDistance) {
  //         smallestDistance = hitPoint.distance;
  //         triangle = triangles[k];
  //         point = hitPoint.point;
  //         gameObjectIndex = q.gameObjectIndices[k];
  //         octree = this.octree;
  //       }
  //     }
  //   }

  //   if (this.scene) {
  //     this.scene.root.traverseCondition(function(gameObject) {
  //       var components = gameObject.getComponents();
  //       for (var component of components) {
  //         if (component.type == "MeshCollider") {
  //           var meshCollider = component;

  //           if (meshCollider.octree) {
  //             var q = meshCollider.octree.query(origin, direction);
  //             if (q) {
  //               let triangles = q.triangles;
  //               for (var k = 0; k < triangles.length; k++) {
  //                 if (!rayToAABBTriangle(origin, direction, triangles[k][0], triangles[k][1], triangles[k][2])) {
  //                   continue;
  //                 }

  //                 var hitPoint = rayToTriangle(origin, direction, triangles[k][0], triangles[k][1], triangles[k][2]);

  //                 if (hitPoint && hitPoint.distance < smallestDistance) {
  //                   smallestDistance = hitPoint.distance;
  //                   triangle = triangles[k];
  //                   point = hitPoint.point;
  //                   gameObjectIndex = q.gameObjectIndices[k];
  //                   octree = meshCollider.octree;
  //                 }
  //               }
  //             }
  //           }
  //         }
  //       }
  //     }, child => child.active && child.visible);
  //   }
  
  //   if (point && triangle) {
  //     let normal = getTriangleNormal(triangle);
  //     let gameObject = octree.getGameObjectFromIndex(gameObjectIndex);

  //     return {
  //       distance: smallestDistance,
  //       normal,
  //       point,
  //       gameObject
  //     };
  //   }

  //   return null;
  // };

  this.RaycastAll = function(origin, direction, outArray) {
    outArray = outArray || [];
  
    var q = this.octree.query(origin, direction);
    if (q) {
      let smallestDistance = Infinity;
      let normal;
      let point;
      let gameObjectIndex;
  
      // bruh, keep all hits here
      let triangles = q.triangles;

      for (let k = 0; k < triangles.length; k++) {
        let hitPoint = rayToTriangle(origin, direction, triangles[k][0], triangles[k][1], triangles[k][2]);
        if (hitPoint && hitPoint.distance < smallestDistance) {
          smallestDistance = hitPoint.distance;
          normal = getTriangleNormal(triangles[k]);
          point = hitPoint.point;
          gameObjectIndex = q.gameObjectIndices[k];
        }
      }
  
      if (point) {
        let d = {
          distance: smallestDistance,
          normal: normal,
          point: point,
          gameObject: this.octree.getGameObjectFromIndex(gameObjectIndex),
        };

        outArray.push(d);
      }
    }

    if (this.scene) {
      this.scene.root.traverseCondition(function(gameObject) {
        // var meshColliders = gameObject.findComponents("MeshCollider");
        var components = gameObject.getComponents();
        for (var component of components) {
          if (component.type == "MeshCollider") {
          // if (component instanceof MeshCollider) {
            var meshCollider = component;

            // if (!meshCollider.octree) {
            //   meshCollider.setup();
            // }

            if (meshCollider.octree) {
              var q = meshCollider.octree.query(origin, direction);
              if (q) {
                let triangles = q.triangles;
                for (var k = 0; k < triangles.length; k++) {
                  // if (!rayToAABBTriangle(origin, direction, q[k][0], q[k][1], q[k][2])) {
                  //   continue;
                  // }

                  if (!rayToAABBTriangle(origin, direction, triangles[k][0], triangles[k][1], triangles[k][2])) {
                    continue;
                  }

                  var hitPoint = rayToTriangle(origin, direction, triangles[k][0], triangles[k][1], triangles[k][2]);
                  if (hitPoint) {
                    outArray.push({
                      distance: hitPoint.distance,
                      normal: getTriangleNormal(triangles[k]),
                      point: hitPoint.point,
                      gameObject: meshCollider.octree.getGameObjectFromIndex(q.gameObjectIndices[k]),
                    });
                  }
                }
              }
            }
          }
        }
      }, child => child.active && child.visible);
    }

    // this.scene.root.traverse(function(gameObject) {
    //   if (gameObject.meshRenderer && rayToAABB(origin, direction, gameObject.meshRenderer.aabb)) {
    //     var worldMatrix = gameObject.transform.worldMatrix;

    //     for (var j = 0; j < gameObject.meshRenderer.meshData.length; j++) {
    //       var md = gameObject.meshRenderer.meshData[j].data;

    //       for (var k = 0; k < md.indices.bufferData.length; k += 3) {
    //         function getVertex(index) {
    //           var currentIndex = md.indices.bufferData[k + index] * 3;
    //           var vec = Vector.fromArray(md.position.bufferData, currentIndex);
    //           vec = {x: vec.x, y: vec.y, z: vec.z};
    //           var transVec = Matrix.transformVector(worldMatrix, vec);
    //           return transVec;
    //         }

    //         var tri = [
    //           getVertex(0),
    //           getVertex(1),
    //           getVertex(2)
    //         ];

    //         var hitPoint = rayToTriangle(origin, direction, tri[0], tri[1], tri[2]);
    //         if (hitPoint) {
    //           outArray.push({
    //             distance: hitPoint.distance,
    //             normal: getTriangleNormal(tri),
    //             point: hitPoint.point
    //           });
    //         }

    //         // for (var l = 0; l < 3; l++) {
    //         //   var currentIndex = md.indices.bufferData[k + l] * 3;
    //         //   var vec = Vector.fromArray(md.position.bufferData, currentIndex);
    //         //   vec = {x: vec.x, y: vec.y, z: vec.z};
    //         //   var transVec = Matrix.transformVector(worldMatrix, vec);

    //         //   trianglesArray[triangleIndex * 9 + l * 3 + 0] = transVec.x;
    //         //   trianglesArray[triangleIndex * 9 + l * 3 + 1] = transVec.y;
    //         //   trianglesArray[triangleIndex * 9 + l * 3 + 2] = transVec.z;
    //         // }

    //         // triangleIndex++;
    //       }
    //     }
    //   }
    // });
  
    var smallestDistance = Infinity;
    var smallestElement;
    for (var i = 0; i < outArray.length; i++) {
      var d = outArray[i].distance;
      if (d < smallestDistance) {
        smallestDistance = d;
        smallestElement = outArray[i];
      }
    }

    // var smallestElement;
    // if (outArray.length > 0) {
    //   smallestElement = outArray.reduce(function(prev, curr) {
    //     return prev.distance < curr.distance ? prev : curr;
    //   });
    // }
  
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
  };

  this.addMeshCollider = function(gameObject) {
    // this._addMeshToOctree(gameObject);
    meshCollidersToAdd.push(gameObject);
  };

  this.setupMeshCollider = function() {
    var aabb;

    if (settings.bounds) {
      aabb = settings.bounds;
    }
    else {
      aabb = new AABB(Vector.zero(), Vector.zero()); // bruh should work without having the origin within the bounds
      for (let c of meshCollidersToAdd) {
        aabb.extend(GetMeshAABB(c, 0.1));
      }
    }

    this.octree = new Octree(aabb, settings.octreeLevels ?? 4);

    for (let c of meshCollidersToAdd) {
      this._addMeshToOctree(c);
    }

    meshCollidersToAdd = [];
  };

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

    var gameObjects = [];
    var triangleIndex = 0;

    var gameObjectLookup = new Uint16Array(nrTriangles);
    var trianglesArray = new Float32Array(nrTriangles * 3 * 3);

    gameObject.traverse(o => {
      if (o.meshRenderer) {
        gameObjects.push(o);
        let gameObjectIndex = gameObjects.length - 1;

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

            gameObjectLookup[triangleIndex] = gameObjectIndex;

            triangleIndex++;
          }
        }
      }
    });

    this.octree.addTriangles(trianglesArray, gameObjectLookup, gameObjects);
  };

  var updatePhysics = () => {
    constraintsToSolve = [];

    var allRigidbodies = [];
    var rigidbodiesWithColliders = [];

    // // External fixed update
    // this.fixedUpdate(this.dt);
    // this.eventHandler.fireEvent("fixedUpdate", this.dt);

    // Find constraints
    if (this.scene) {
      this.scene.root.traverseCondition(gameObject => {
        var rigidbodies = gameObject.findComponents("Rigidbody");
        var rigidbody = rigidbodies[0];
        if (rigidbody) {
          allRigidbodies.push(rigidbody);

          rigidbody.grounded = false;
          let hasConstraints = false;

          // Sphere to world
          var sphereColliders = rigidbody.gameObject.findComponents("SphereCollider");
          for (let collider of sphereColliders) {
            hasConstraints = true;

            var mat = Matrix.removeTranslation(Matrix.copy(rigidbody.gameObject.transform.worldMatrix));
            var pos = Vector.add(rigidbody.position, Matrix.transformVector(mat, collider.offset));

            var s = Vector.fill(collider.radius * 1.1);
            var q = physicsEngine.octree.queryAABB(new AABB(
              Vector.subtract(pos, s),
              Vector.add(pos, s)
            ))?.triangles;

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

          // Capsule to world
          var capsuleColliders = rigidbody.gameObject.findComponents("CapsuleCollider");
          for (let collider of capsuleColliders) {
            hasConstraints = true;

            let mat = Matrix.removeTranslation(Matrix.copy(rigidbody.gameObject.transform.worldMatrix));
            let a = Vector.add(rigidbody.position, Matrix.transformVector(mat, collider.a));
            let b = Vector.add(rigidbody.position, Matrix.transformVector(mat, collider.b));

            let s = Vector.fill(collider.radius * 10);
            let center = Vector.average(a, b);
            let q = physicsEngine.octree.queryAABB(new AABB(
              Vector.subtract(center, s),
              Vector.add(center, s)
            ))?.triangles;

            if (q) {
              for (let k = 0; k < q.length; k++) {
                let col = capsuleToTriangle(a, b, collider.radius, q[k][0], q[k][1], q[k][2], true);
                if (col) {
                  // bruh getTriangleNormal(q[k]) is good for character controller maybe
                  // let dp = Vector.dot(Vector.up(), col.normal);
                  // let normal = Vector.length(Vector.projectOnPlane(rigidbody.velocity, col.normal)) < 2 && dp > 0.8 ? new Vector(0, 1, 0) : col.normal;
                  
                  let normal = col.normal;

                  let depth = col.depth / Vector.dot(normal, col.normal);
                  let pA = Vector.add(col.point, Vector.multiply(col.normal, -col.depth));

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

                  window.Debug?.Vector(pA, normal, depth);
                }
              }
            }
          }

          let _tmpConstraintsToSolve = [];

          // // Box to plane
          // var boxColliders = rigidbody.gameObject.findComponents("BoxCollider");
          // for (let collider of boxColliders) {
          //   hasConstraints = true;

          //   var planeY = -0.5;//collider.planeY;

          //   var m = collider.gameObject.transform.worldMatrix;
          //   for (var point of collider.aabb.getVertices()) {
          //     var transformedPoint = Matrix.transformVector(m, point);
              
          //     if (transformedPoint.y < planeY) {
          //       constraintsToSolve.push({
          //         C: transformedPoint.y - planeY,
          //         bodies: [
          //           {
          //             collider: collider,
          //             body: rigidbody,
          //             normal: Vector.up(),
          //             p: transformedPoint
          //           }
          //         ]
          //       });
          //     }
          //   }
          // }

          // VClip collision
          const boxColliders = rigidbody.gameObject.findComponents("BoxCollider");
          for (const boxCollider of boxColliders) {
            if (!boxCollider.vclipGeometry) {
              throw new Error("Missing vclip geometry in boxcollider");
              // continue;
            }

            // Draw bounds of BoxCollider
            window.Debug?.Bounds(boxCollider.aabb, rigidbody.gameObject.transform.worldMatrix);

            this.scene.root.traverseCondition(otherGameObject => {
              // Don't collide with self
              if (otherGameObject === gameObject) {
                return;
              }

              /**
               * @type {MeshCollider[]}
               */
              const otherMeshColliders = otherGameObject.findComponents("MeshCollider");
              for (const otherMeshCollider of otherMeshColliders) {
                if (!otherMeshCollider.vclipGeometry) {
                  throw new Error("Missing vclip geometry in meshcollider");
                  // continue;
                }

                if (!otherMeshCollider.convex) {
                  continue;
                }

                // const boxGeometry = new CubeGeometry(rigidbody.gameObject.transform.matrix, Vector.fill(2));
                // const boxGeometry = new MeshGeometry(rigidbody.gameObject.transform.matrix, rigidbody.gameObject.meshRenderer.meshData[0]);
                // const otherGeometry = new CubeGeometry(Matrix.translate(new Vector(0, -10.5, 0)), new Vector(50, 20, 50));
                // const otherGeometry = new MeshGeometry(otherGameObject.transform.matrix, otherGameObject.meshRenderer.meshData[0]);
                const otherGeometry = otherMeshCollider.vclipGeometry;//new MeshGeometry(otherGameObject.transform.matrix, otherGameObject.meshRenderer.meshData[0]);
                otherGeometry.updateMatrix(otherGameObject.transform.matrix);

                const getDeepestPenetration = (matrix) => {
                  const maxIterations = 20;

                  let penetration = false;
                  const point = new Vector();
                  const totalTranslation = Vector.zero();
                  const newBoxGeometry = new MeshGeometry(matrix, rigidbody.gameObject.meshRenderer.meshData[0]);

                  for (let depth = 0; depth < maxIterations; depth++) {
                    const intersectionData = VClip(otherGeometry, newBoxGeometry);
                    if (intersectionData.status !== 2) { // 2 = intersection
                      break;
                    }
    
                    if (!intersectionData.penetrationPoint || !intersectionData.penetrationDepth || !intersectionData.penetrationNormal) {
                      break;
                    }

                    intersectionData.featureA.render();
                    intersectionData.featureB.render();
                    window.Debug?.Vector(intersectionData.penetrationPoint, intersectionData.penetrationNormal, -intersectionData.penetrationDepth, [0, 1, 0]);
                    window.Debug?.Point(intersectionData.penetrationPoint, 0.03, [0, 1, 0.2]);

                    penetration = true;

                    Vector.set(point, Vector.subtract(intersectionData.penetrationPoint, totalTranslation));

                    const translate = Vector.multiply(intersectionData.penetrationNormal, -intersectionData.penetrationDepth + 0.001);
                    for (const vertex of newBoxGeometry.vertices) {
                      Vector.addTo(vertex.position, translate);
                    }

                    Vector.addTo(totalTranslation, translate);

                    // window.Debug.Point(point, 0.02);
                    // window.Debug.Vector(point, intersectionData.penetrationNormal, -intersectionData.penetrationDepth + 0.001);

                    // return;

                    if (depth == maxIterations - 1) {
                      console.warn("max");
                    }
                  }

                  if (!penetration) {
                    return null;
                  }

                  const diff = Vector.copy(totalTranslation);
                  const normal = Vector.normalize(diff);
                  const depth = Vector.length(diff);

                  window.Debug?.Vector(point, normal, depth, [0, 0, 1]);
                  window.Debug?.Point(point, 0.03, [0, 0.2, 1]);

                  return {
                    normal,
                    depth,
                    point
                  };
                };

                // const getContact = (matrix) => {
                //   return getDeepestPenetration(matrix);
                // };

                const getContact = (matrix) => {
                  // const newBoxGeometry = new MeshGeometry(matrix, rigidbody.gameObject.meshRenderer.meshData[0]);
                  // const newBoxGeometry = new CubeGeometry(matrix, boxCollider.aabb.getSize());
                  const newBoxGeometry = boxCollider.vclipGeometry;
                  newBoxGeometry.updateMatrix(matrix);

                  const vclipData = VClip(otherGeometry, newBoxGeometry);
                  if (vclipData.status !== 1) { // 1 = Not intersecting
                    return null;
                  }

                  vclipData.featureA.render();
                  vclipData.featureB.render();

                  const { pointA, pointB, distance, vector } = computeDistance(vclipData.featureA, vclipData.featureB);

                  const margin = 0.1;

                  if (distance > margin * 2) {
                    return null;
                  }

                  const point = pointB;
                  const normal = Vector.normalize(vector);
                  const depth = -(distance - margin * 2);

                  // Vector.set(normal, new Vector(0, 1, 0));
                  // console.log(normal);

                  // if (normal.y < 0) {
                  //   Vector.negateTo(normal);
                  //   Vector.set(point, pointB);
                  // }

                  window.Debug?.Point(pointA, 0.05);
                  window.Debug?.Point(pointB, 0.05);
                  window.Debug?.Vector(pointA, vector, 1, [0, 1, 0]);
                  window.Debug?.Vector(point, normal, 1, [1, 1, 0]);
                  // console.log(point, normal, depth);

                  return {
                    point,
                    normal,
                    depth
                  };
                };

                const perturbationAngle = Math.PI * 0.004 * 0.1;

                const getPerturbationMatrix = (baseMatrix, x, z) => {
                  const matrix = Matrix.copy(baseMatrix);
                  Matrix.applyRotationX(perturbationAngle * x, matrix);
                  Matrix.applyRotationZ(perturbationAngle * z, matrix);
                  return matrix;
                };

                const matrices = [
                  // getPerturbationMatrix(rigidbody.gameObject.transform.matrix, 0, 0),
                  getPerturbationMatrix(rigidbody.gameObject.transform.matrix, 1, 1),
                  getPerturbationMatrix(rigidbody.gameObject.transform.matrix, 1, -1),
                  getPerturbationMatrix(rigidbody.gameObject.transform.matrix, -1, 1),
                  getPerturbationMatrix(rigidbody.gameObject.transform.matrix, -1, -1),
                ];

                for (const matrix of matrices) {
                  const penetrationData = getContact(matrix);
                  if (!penetrationData) {
                    continue;
                  }

                  // window.Debug.Point(penetrationData.point, 0.04);
  
                  if (this.dt !== 0) {
                    _tmpConstraintsToSolve.push({
                      C: -penetrationData.depth,
                      bodies: [
                        {
                          collider: boxCollider,
                          body: rigidbody,
                          normal: penetrationData.normal,
                          p: penetrationData.point,
                        }
                      ]
                    });
                  }
                }

                // this.dt = 0;
                // return;

                // const penetrationData = getDeepestPenetration(rigidbody.gameObject.transform.matrix);
                // if (!penetrationData) {
                //   continue;
                // }

                // _tmpConstraintsToSolve.push({
                //   C: -penetrationData.depth,
                //   bodies: [
                //     {
                //       collider: boxCollider,
                //       body: rigidbody,
                //       normal: penetrationData.normal,
                //       p: penetrationData.point,
                //     }
                //   ]
                // });





                // // const intersectionData = VClip(otherGeometry, boxGeometry);
                // // if (intersectionData.status !== 2) { // 2 = intersection
                // //   continue;
                // // }

                // // // console.log(intersectionData);

                // // if (!intersectionData.penetrationPoint || !intersectionData.penetrationDepth || !intersectionData.penetrationNormal) {
                // //   continue;
                // // }

                // // const originalPosition = Vector.copy(rigidbody.gameObject.transform.position);
                // const point = new Vector();//Vector.copy(intersectionData.penetrationPoint);
                // let intersection = false;

                // // Vector.addTo(rigidbody.gameObject.transform.position, Vector.multiply(intersectionData.penetrationNormal, -intersectionData.penetrationDepth + 0.001));

                // // window.Debug.Point(point, 0.07);
                // // window.Debug.Vector(point, intersectionData.penetrationNormal, -intersectionData.penetrationDepth + 0.001);

                // // _tmpConstraintsToSolve.push({
                // //   C: -(-intersectionData.penetrationDepth + 0.001),
                // //   bodies: [
                // //     {
                // //       collider: boxCollider,
                // //       body: rigidbody,
                // //       normal: intersectionData.penetrationNormal,
                // //       p: Vector.copy(point),
                // //     }
                // //   ]
                // // });

                // // this.dt = 0;
                // // return;

                // // console.log("---");

                // const totalTranslation = Vector.zero();
                // const newBoxGeometry = new MeshGeometry(rigidbody.gameObject.transform.matrix, rigidbody.gameObject.meshRenderer.meshData[0]);

                // for (let depth = 0; depth < 40; depth++) {
                //   // const newBoxGeometry = new CubeGeometry(rigidbody.gameObject.transform.matrix, Vector.fill(2));
                //   // const newBoxGeometry = new MeshGeometry(rigidbody.gameObject.transform.matrix, rigidbody.gameObject.meshRenderer.meshData[0]);
                  
                //   const intersectionData = VClip(otherGeometry, newBoxGeometry);
                //   if (intersectionData.status !== 2) { // 2 = intersection
                //     break;
                //   }
  
                //   if (!intersectionData.penetrationPoint || !intersectionData.penetrationDepth || !intersectionData.penetrationNormal) {
                //     break;
                //   }

                //   intersection = true;

                //   // window.Debug.Point(intersectionData.featureA.a.position, 0.05);
                //   // window.Debug.Point(intersectionData.featureA.b.position, 0.05);

                //   Vector.set(point, Vector.subtract(intersectionData.penetrationPoint, totalTranslation));
                //   // Vector.set(point, Vector.subtract(intersectionData.penetrationPoint, Vector.subtract(rigidbody.gameObject.transform.position, originalPosition)));
                  
                //   const translate = Vector.multiply(intersectionData.penetrationNormal, -intersectionData.penetrationDepth + 0.001);
                //   for (const vertex of newBoxGeometry.vertices) {
                //     Vector.addTo(vertex.position, translate);
                //   }

                //   Vector.addTo(totalTranslation, translate);
                //   // Vector.addTo(rigidbody.gameObject.transform.position, translate);
                
                //   // window.Debug.Point(point, 0.02);
                //   // window.Debug.Vector(point, intersectionData.penetrationNormal, -intersectionData.penetrationDepth + 0.001);

                //   // _tmpConstraintsToSolve.push({
                //   //   C: -(-intersectionData.penetrationDepth + 0.001),
                //   //   bodies: [
                //   //     {
                //   //       collider: boxCollider,
                //   //       body: rigidbody,
                //   //       normal: intersectionData.penetrationNormal,
                //   //       p: Vector.copy(point),
                //   //     }
                //   //   ]
                //   // });

                //   if (depth == 39) {
                //     console.log("max");
                //   }
                // }

                // if (!intersection) {
                //   continue;
                // }

                // // console.log("+++");

                // const diff = Vector.copy(totalTranslation);//Vector.subtract(rigidbody.gameObject.transform.position, originalPosition);
                // const normal = Vector.normalize(diff);
                // const depth = Vector.length(diff);

                // // rigidbody.gameObject.transform.position = point;

                // // window.Debug.Point(point, 0.02);
                // window.Debug.Vector(point, normal, depth);
                // // console.log(point, normal, depth);

                // // this.dt = 0; 
                // // return;

                // _tmpConstraintsToSolve.push({
                //   C: -depth,
                //   bodies: [
                //     {
                //       collider: boxCollider,
                //       body: rigidbody,
                //       normal: normal,
                //       p: point,
                //     }
                //   ]
                // });
              }
            });
          }

          // Mesh to Mesh
          let meshColliders = rigidbody.gameObject.findComponents("MeshCollider");
          for (let collider of meshColliders) {
            hasConstraints = true;

            let worldMatrix = gameObject.transform.worldMatrix;
            // collider.setup();
            let transformedAABB = collider.gameObject.meshRenderer.getAABB().approxTransform(worldMatrix);
            // let transformedAABB = collider.gameObject.getAABB().copy();

            this.scene.root.traverseCondition(otherGameObject => {
              // Don't collide with self
              if (otherGameObject === gameObject) {
                return;
              }

              let otherWorldMatrix = otherGameObject.transform.worldMatrix;
              // let otherTransformedAABB = otherGameObject.meshRenderer.getAABB().approxTransform(otherWorldMatrix);
              // if (!otherTransformedAABB || !AABBToAABB(transformedAABB, otherTransformedAABB)) {
              //   return;
              // }

              let otherMeshColliders = otherGameObject.findComponents("MeshCollider");
              for (let otherCollider of otherMeshColliders) {
                var q = otherCollider.octree?.queryAABB(transformedAABB)?.triangles;
                if (q) {
                  console.log(q.length);
                  for (var k = 0; k < q.length; k++) {
                    let otherTriangle = q[k];

                    if (collider.gameObject && collider.gameObject.meshRenderer) {
                      for (let m = 0; m < collider.gameObject.meshRenderer.meshData.length; m++) {
                        let md = collider.gameObject.meshRenderer.meshData[m].data;
                
                        for (let n = 0; n < md.indices.bufferData.length; n += 3) {
                          let triangle = [];

                          for (let o = 0; o < 3; o++) {
                            let currentIndex = md.indices.bufferData[n + o] * 3;
                            let vec = Vector.fromArray(md.position.bufferData, currentIndex);
                            vec = {x: vec.x, y: vec.y, z: vec.z};
                            let vertex = Matrix.transformVector(worldMatrix, vec);
                            triangle.push(vertex);
                          }

                          if (AABBTriangleToAABBTriangle(triangle[0], triangle[1], triangle[2], otherTriangle[0], otherTriangle[1], otherTriangle[2])) {
                            let intersectData = triangleTriangleIntersection(triangle, otherTriangle);
                            if (intersectData) {
                              for (let itersection of intersectData) {
                                // console.log(itersection);

                                if (window.gldebug) window.gldebug.Vector(itersection.point, itersection.normal, itersection.depth * -1000);

                                // if (this.scene.renderer.getKey(32)) {
                                _tmpConstraintsToSolve.push({
                                  C: itersection.depth,
                                  bodies: [
                                    {
                                      collider: collider,
                                      body: rigidbody,
                                      normal: itersection.normal,
                                      p: itersection.point,
                                    }
                                  ]
                                });
                                // }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }

                // if (otherCollider.gameObject && otherCollider.gameObject.meshRenderer) {
                //   // let otherTransformedAABB = otherCollider.aabb;
                //   let otherTransformedAABB = otherGameObject.meshRenderer.getAABB().approxTransform(otherWorldMatrix);
                //   // let otherTransformedAABB = otherGameObject.getAABB().copy();
                //   if (!otherTransformedAABB || !AABBToAABB(transformedAABB, otherTransformedAABB)) {
                //     return;
                //   }

                //   for (let j = 0; j < otherCollider.gameObject.meshRenderer.meshData.length; j++) {
                //     let md = otherCollider.gameObject.meshRenderer.meshData[j].data;
            
                //     for (let k = 0; k < md.indices.bufferData.length; k += 3) {
                //       let otherTriangle = [];

                //       for (let l = 0; l < 3; l++) {
                //         let currentIndex = md.indices.bufferData[k + l] * 3;
                //         let vec = Vector.fromArray(md.position.bufferData, currentIndex);
                //         vec = {x: vec.x, y: vec.y, z: vec.z};
                //         let vertex = Matrix.transformVector(otherWorldMatrix, vec);
                //         otherTriangle.push(vertex);
                //       }

                //       if (collider.gameObject && collider.gameObject.meshRenderer) {
                //         for (let m = 0; m < collider.gameObject.meshRenderer.meshData.length; m++) {
                //           let md = collider.gameObject.meshRenderer.meshData[m].data;
                  
                //           for (let n = 0; n < md.indices.bufferData.length; n += 3) {
                //             let triangle = [];

                //             for (let o = 0; o < 3; o++) {
                //               let currentIndex = md.indices.bufferData[n + o] * 3;
                //               let vec = Vector.fromArray(md.position.bufferData, currentIndex);
                //               vec = {x: vec.x, y: vec.y, z: vec.z};
                //               let vertex = Matrix.transformVector(worldMatrix, vec);
                //               triangle.push(vertex);
                //             }

                //             if (AABBTriangleToAABB(triangle[0], triangle[1], triangle[2], otherTransformedAABB) && AABBTriangleToAABBTriangle(triangle[0], triangle[1], triangle[2], otherTriangle[0], otherTriangle[1], otherTriangle[2])) {
                //               let intersectData = triangleTriangleIntersection(triangle, otherTriangle);
                //               if (intersectData) {
                //                 for (let itersection of intersectData) {
                //                   // console.log(itersection);

                //                   if (window.gldebug) window.gldebug.Vector(itersection.point, itersection.normal, itersection.depth * -1000);

                //                   // if (this.scene.renderer.getKey(32)) {
                //                   _tmpConstraintsToSolve.push({
                //                     C: itersection.depth,
                //                     bodies: [
                //                       {
                //                         collider: collider,
                //                         body: rigidbody,
                //                         normal: itersection.normal,
                //                         p: itersection.point,
                //                       }
                //                     ]
                //                   });
                //                   // }
                //                 }
                //               }
                //             }
                //           }
                //         }
                //       }
                //     }
                //   }
                // }
              }
            });
          }
          constraintsToSolve = constraintsToSolve.concat(_tmpConstraintsToSolve); // Linter does not like using "constraintsToSolve" in function above

          if (hasConstraints) {
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
      }, child => child.active && child.visible);
    }

    // console.log(constraintsToSolve);

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

    // External fixed update
    this.fixedUpdate(this.dt);
    this.eventHandler.fireEvent("fixedUpdate", this.dt);

    // Components fixed update
    for (let component of components) {
      component.fixedUpdate?.(this.dt);
    }

    // Solve constraints
    var lambdaAccumulated = new Array(constraintsToSolve.length).fill(0);
    let lambdaAccumulatedComponents = new Array(components.length).fill(0);

    for (var i = 0; i < this.constraintIterations; i++) {
      // Components constraints
      
      for (let compIndex = 0; compIndex < components.length; compIndex++) {
        const component = components[compIndex];
        component.solveConstraint?.(this.dt, lambdaAccumulatedComponents, compIndex);
      }

      for (let constraintIndex = 0; constraintIndex < constraintsToSolve.length; constraintIndex++) {
        const constraint = constraintsToSolve[constraintIndex];
        const C = constraint.C ?? 0;
        const slop = -0.01;

        if (C < 0/*-0.007 * 0*/) {
          // const jacobian = [];
          // const tangentJacobian = [];
          // const bitangentJacobian = [];
          // const velocities = [];
          // const masses = [];

          if (constraint.bodies.length > 0) {
            const jacobian = [];
            const tangentJacobian = [];
            const bitangentJacobian = [];
            const velocities = [];
            const masses = [];

            for (const body of constraint.bodies) {
              const m = body.collider.disableRotationImpulse ? 0 : 1;

              let pc = Vector.cross(Vector.subtract(body.p, body.body.position), body.normal);
              jacobian.push(
                body.normal.x,
                body.normal.y,
                body.normal.z,
                pc.x * m,
                pc.y * m,
                pc.z * m
              );

              const [ tangent, bitangent ] = Vector.formOrthogonalBasis(body.normal);

              // if (i == 0) {
              //   window.Debug.Vector(body.p, tangent, 1, [0, 0, 1]);
              //   window.Debug.Vector(body.p, bitangent, 1, [1, 0, 0]);
              // }

              pc = Vector.cross(Vector.subtract(body.p, body.body.position), tangent);
              // Vector.negateTo(pc);
              tangentJacobian.push(
                tangent.x,
                tangent.y,
                tangent.z,
                pc.x * m,
                pc.y * m,
                pc.z * m
              );

              pc = Vector.cross(Vector.subtract(body.p, body.body.position), bitangent);
              // Vector.negateTo(pc);
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

              const it = body.body.inverseWorldInertia;

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

            // const { impulses, lambda } = getConstraintImpulse(jacobian, velocities, masses, C, this.dt, this.constraintBias, undefined, undefined, slop);
            const { impulses, lambda } = getConstraintImpulse(jacobian, velocities, masses, C, this.dt, this.constraintBias, lambdaAccumulated, constraintIndex, slop);

            if (!impulses.some(item => isNaN(item))) {
              let ind = 0;
              for (const body of constraint.bodies) {
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
            else {
              throw new Error("NaN in impulses");
            }

            // Friction
            const bias = 0;
            const friction = getCombinedFriction(constraint.bodies);

            if (friction > 0.0001 && lambda > 0) {
              const jacobians = [ tangentJacobian, bitangentJacobian ];

              for (let jacobian of jacobians) {
                // Recalculate velocities (better stability)
                velocities.length = 0;
                for (const body of constraint.bodies) {
                  velocities.push(
                    body.body.velocity.x,
                    body.body.velocity.y,
                    body.body.velocity.z,
                    body.body.angularVelocity.x,
                    body.body.angularVelocity.y,
                    body.body.angularVelocity.z
                  );
                }

                const effectiveMass = getEffectiveMass(jacobian, masses);
                let frictionLambda = getLambda(effectiveMass, jacobian, velocities, bias);

                const f = Math.max(1e-4, Math.abs(friction) * Math.abs(lambda));
                frictionLambda = clamp(frictionLambda, -f, f);

                // if (Math.abs(lambda) > 1e-4)
                //   console.log(lambda);

                const impulses = [];
                for (let _i = 0; _i < jacobian.length; _i++) {
                  impulses[_i] = jacobian[_i] * frictionLambda;
                }

                if (!impulses.some(item => isNaN(item))) {
                  let ind = 0;
                  for (const body of constraint.bodies) {
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
                else {
                  throw new Error("NaN in impulses");
                }
              }
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
    for (let rigidbody of allRigidbodies) {
      rigidbody.integrate(this.dt);
    }
  };

  this.update = function() {
    if (this.multipleTimestepsPerFrame) {
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
    else {
      updatePhysics();
      this.time += this.dt;
    }
  };

  this.getConstraintImpulse = getConstraintImpulse;
  this.getLambda = getLambda;
  this.getEffectiveMass = getEffectiveMass;
}

class Collider {
  constructor() {
    this.componentType = "Collider";
    this.gameObject = null;

    this.isStatic = false;
    this.friction = 0.5;
    this.disableRotationImpulse = false;
  }
}

class MeshCollider extends Collider {
  #_octree = null;
  #_vclipGeometry = null;

  constructor() {
    super();
    this.componentType = "MeshCollider";
    this.type = "MeshCollider";

    this.convex = false;
  }

  get octree() {
    if (!this.#_octree) {
      this.#setup();
    }
    return this.#_octree;
  }

  get vclipGeometry() {
    if (this.convex && !this.#_vclipGeometry) {
      this.#setup();
    }
    return this.#_vclipGeometry;
  }

  clear() {
    this.#_octree = null;
    this.aabb = null;
  }

  #setup() {
    if (this.gameObject && this.gameObject.meshRenderer) {
      // var aabb = GetMeshAABB(this.gameObject, 0.1);

      var aabb = new AABB(Vector.fill(Infinity), Vector.fill(-Infinity));

      var nrTriangles = 0;

      console.error("Mesh to mesh collision is off!");
      // if (!this.gameObject.meshRenderer.isConvex()) {
      //   console.warn("Mesh is not convex!");
      //   console.log(this.gameObject.name, this.gameObject.meshRenderer.meshData.length, this.gameObject);
      
      //   this.convex = false;
      // }
      // else {
      //   this.convex = true;
      // }

      for (let j = 0; j < this.gameObject.meshRenderer.meshData.length; j++) {
        let md = this.gameObject.meshRenderer.meshData[j].data;
        nrTriangles += md.indices.bufferData.length / 3;
      }

      var gameObjects = [ this.gameObject ];
      var gameObjectLookup = new Uint16Array(nrTriangles);
      var trianglesArray = new Float32Array(nrTriangles * 3 * 3);
      var triangleIndex = 0;

      var worldMatrix = this.gameObject.transform.worldMatrix;

      for (let j = 0; j < this.gameObject.meshRenderer.meshData.length; j++) {
        let md = this.gameObject.meshRenderer.meshData[j].data;

        for (var k = 0; k < md.indices.bufferData.length; k += 3) {
          for (var l = 0; l < 3; l++) {
            var currentIndex = md.indices.bufferData[k + l] * 3;
            var vec = Vector.fromArray(md.position.bufferData, currentIndex);
            vec = {x: vec.x, y: vec.y, z: vec.z};
            var transVec = Matrix.transformVector(worldMatrix, vec);

            if (transVec.x < aabb.bl.x) aabb.bl.x = transVec.x;
            if (transVec.y < aabb.bl.y) aabb.bl.y = transVec.y;
            if (transVec.z < aabb.bl.z) aabb.bl.z = transVec.z;
            if (transVec.x > aabb.tr.x) aabb.tr.x = transVec.x;
            if (transVec.y > aabb.tr.y) aabb.tr.y = transVec.y;
            if (transVec.z > aabb.tr.z) aabb.tr.z = transVec.z;

            trianglesArray[triangleIndex * 9 + l * 3 + 0] = transVec.x;
            trianglesArray[triangleIndex * 9 + l * 3 + 1] = transVec.y;
            trianglesArray[triangleIndex * 9 + l * 3 + 2] = transVec.z;
          }

          gameObjectLookup[triangleIndex] = 0;

          triangleIndex++;
        }
      }

      aabb.addPadding(0.1);

      const trianglesPerSection = 1000;
      const d = nrTriangles <= 0 ? 0 : Math.max(0, Math.floor(Math.log(nrTriangles / trianglesPerSection) / Math.log(8) + 1));
      this.#_octree = new Octree(aabb, d);
      // this.#_octree = new Octree(aabb, 4 - 3);
      this.#_octree.addTriangles(trianglesArray, gameObjectLookup, gameObjects);
      this.aabb = aabb;

      // bruh allow for multiple meshdatas
      if (this.convex) {
        this.#_vclipGeometry = new MeshGeometry(this.gameObject.transform.matrix, this.gameObject.meshRenderer.meshData[0]);
      }
    }
    else {
      this.#_octree = null;
      this.aabb = null;
    }
  }
}

class SphereCollider extends Collider {
  constructor(radius, offset = Vector.zero()) {
    super();
    this.componentType = "SphereCollider";
    this.radius = radius;
    this.offset = offset;
  }
}

class CapsuleCollider extends Collider {
  constructor(radius, a = Vector.zero(), b = Vector.up()) {
    super();
    this.componentType = "CapsuleCollider";
    this.radius = radius;
    this.a = a;
    this.b = b;
  }
}

class BoxCollider extends Collider {
  constructor(aabb = new AABB(Vector.fill(-1), Vector.fill(1))) {
    super();
    this.componentType = "BoxCollider";
    this.aabb = aabb;
    // this.planeY = planeY;

    this.vclipGeometry = new CubeGeometry(Matrix.identity(), this.aabb.getSize());
  }
}

var r = new Vector();
var c = new Vector();

class Rigidbody {
  #gravitydt = new Vector();
  #f = new Vector();
  #q = new Quaternion();
  #mat = new Matrix();

  constructor() {
    this.componentType = "Rigidbody";
    this.gameObject = null;

    this.COMOffset = Vector.zero();

    this.mass = 1;
    this.position = Vector.zero();
    this.velocity = Vector.zero();
    this.acceleration = Vector.zero();
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

    this._worldCOMOffset = Vector.zero();
    this.lastVelocity = new Vector();
  }

  /**
   * @param {GameObject} gameObject 
   */
  onAdd(gameObject) {
    Vector.set(this.position, gameObject.transform.worldPosition);
    Quaternion.set(this.rotation, gameObject.transform.worldRotation);
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
      // Get rotation-only matrix (called R below)
      Matrix.copy(this.gameObject.transform.worldMatrix, this.#mat);
      Matrix.removeTranslation(this.#mat);
      Matrix.setScale(this.#mat, Vector.one());

      // Iwi = R * Ili * R^T
      Matrix.identity(this.inverseWorldInertia);
      Matrix.multiply(this.#mat, this._inverseLocalInertiaMatrix, this.inverseWorldInertia);

      Matrix.transpose(this.#mat, this.#mat);
      Matrix.multiply(this.inverseWorldInertia, this.#mat, this.inverseWorldInertia);

      // Matrix.copy(this._inverseLocalInertiaMatrix, this.inverseWorldInertia);
    }
  }

  _updateWorldCOMOffset() {
    // bruh
    if (this.gameObject) {
      Matrix.copy(this.gameObject.transform.worldMatrix, this.#mat);
      Matrix.removeTranslation(this.#mat);
      Matrix.transformVector(this.#mat, this.COMOffset, this._worldCOMOffset);
    }
    else {
      Vector.set(this._worldCOMOffset, this.COMOffset);
    }
  }

  getWorldCOMOffset() {
    return this._worldCOMOffset;
  }

  GetPointVelocity(position, dst) {
    dst = dst || new Vector();

    let worldCOM = this.getWorldCOMOffset();

    Vector.set(r, position);
    Vector.subtractTo(r, this.position);
    Vector.subtractTo(r, worldCOM);

    Vector.set(dst, this.velocity);
    Vector.cross(this.angularVelocity, r, c);
    Vector.addTo(dst, c);

    return dst;

    // var worldCOM = this.getWorldCOMOffset();
    // var r = Vector.subtract(position, Vector.add(this.position, worldCOM));
    // return Vector.add(this.velocity, Vector.cross(this.angularVelocity, r));
  }

  AddForceAtPosition(force, position) {
    if (Vector.isNaN(force)) {
      console.error("Force is NaN: ", force);
      return;
    }

    if (Vector.isNaN(position)) {
      console.error("Position is NaN: ", position);
      return;
    }

    if (this.frozen) {
      return;
    }
    
    this.AddForce(force);

    var worldCOM = this.getWorldCOMOffset();
    Vector.set(r, position);
    Vector.subtractTo(r, this.position);
    Vector.subtractTo(r, worldCOM);
    Vector.cross(r, force, r);
    this.AddTorque(r);
  }

  AddImpulseAtPosition(force, position) {
    if (Vector.isNaN(force)) {
      console.error("Impulse is NaN: ", force);
      return;
    }

    if (Vector.isNaN(position)) {
      console.error("Position is NaN: ", position);
      return;
    }

    if (this.frozen) {
      return;
    }

    Vector.set(r, force);
    Vector.multiplyTo(r, 1 / this.mass);
    Vector.addTo(this.velocity, r);

    var worldCOM = this.getWorldCOMOffset();

    Vector.set(r, position);
    Vector.subtractTo(r, this.position);
    Vector.subtractTo(r, worldCOM);
    Vector.cross(r, force, r);
    Matrix.transformVector(this.inverseWorldInertia, r, r);
    Vector.addTo(this.angularVelocity, r);
  }

  AddForce(force) {
    if (Vector.isNaN(force)) {
      console.error("Force is NaN: ", force);
      return;
    }

    if (this.frozen) {
      return;
    }

    Vector.addTo(this.force, force);
  }

  AddTorque(torque) {
    if (Vector.isNaN(torque)) {
      console.error("Torque is NaN: ", torque);
      return;
    }

    if (this.frozen) {
      return;
    }

    Vector.addTo(this.torque, torque);
  }

  applyForces(dt) {
    if (this.frozen) {
      return;
    }

    Vector.set(this.lastVelocity, this.velocity);

    // Apply force
    Vector.set(this.#f, this.force);
    Vector.multiplyTo(this.#f, dt / this.mass);
    Vector.addTo(this.velocity, this.#f);
    Vector.zero(this.force);

    // Apply gravity
    Vector.set(this.#gravitydt, this.gravity);
    Vector.multiplyTo(this.#gravitydt, dt * this.gravityScale);
    Vector.addTo(this.velocity, this.#gravitydt);

    // Apply torque
    if (!this.lockRotation) {
      Matrix.transformVector(this.inverseWorldInertia, this.torque, this.#f);
      Vector.addTo(this.angularVelocity, this.#f);
    }
    Vector.zero(this.torque);
  }

  // !
  integrate(dt) {
    if (this.frozen) {
      return;
    }

    Vector.set(this.#f, this.velocity);
    Vector.multiplyTo(this.#f, dt);
    Vector.addTo(this.position, this.#f);

    if (this.lockRotation) {
      Quaternion.identity(this.rotation);
    }
    else {
      new Quaternion(
        this.angularVelocity.x,
        this.angularVelocity.y,
        this.angularVelocity.z,
        0,
        this.#q
      );
      // !
      this.rotation = Quaternion.add(this.rotation, Quaternion.multiply(Quaternion.QxQ(this.#q, this.rotation), dt / 2));
    }

    Vector.set(this.acceleration, this.velocity);
    Vector.subtractTo(this.acceleration, this.lastVelocity);
    Vector.multiplyTo(this.acceleration, dt);

    this.updateGameObject();
  }

  updateGameObject() {
    if (this.gameObject != null) {
      // this.gameObject.transform.position = this.position;
      // this.gameObject.transform.rotation = this.rotation;

      // Set world position instead of local position
      this.gameObject.transform.worldPosition = this.position;
      this.gameObject.transform.worldRotation = this.rotation;
    }

    this._updateInverseWorldInertiaMatrix();
    this._updateWorldCOMOffset();
  }
}

function DistanceConstraint(rbA, offsetA, rbB, offsetB, distance = 0) {
  this.rbA = rbA;
  this.rbB = rbB;
  this.offsetA = offsetA;
  this.offsetB = offsetB;
  this.distance = distance;

  let bias = 0.4 * 0.1;

  this.debugSphereA = null;
  this.debugSphereB = null;

  this.solveConstraint = function(dt, lambdaAccumulated, lambdaAccumulatedIndex) {
    if (this.rbA.frozen && this.rbB.frozen) {
      return;
    }

    let worldOffsetA = Matrix.transformVector(this.rbA.gameObject.transform.worldMatrix, this.offsetA);
    let worldOffsetB = Matrix.transformVector(this.rbB.gameObject.transform.worldMatrix, this.offsetB);

    if (this.debugSphereA) {
      this.debugSphereA.transform.position = worldOffsetA;
    }
    if (this.debugSphereB) {
      this.debugSphereB.transform.position = worldOffsetB;
    }

    let difference = Vector.subtract(worldOffsetA, worldOffsetB);
    let distance = Vector.length(difference);

    let normal = Vector.normalize(difference);
    let pcA = Vector.cross(Vector.subtract(worldOffsetA, this.rbA.position), normal);
    let pcB = Vector.cross(Vector.subtract(worldOffsetB, this.rbB.position), Vector.negate(normal));
    let itA = this.rbA.inverseWorldInertia;
    let itB = this.rbB.inverseWorldInertia;

    let jacobian = [
      normal.x,
      normal.y,
      normal.z,
      pcA.x,
      pcA.y,
      pcA.z,

      -normal.x,
      -normal.y,
      -normal.z,
      pcB.x,
      pcB.y,
      pcB.z,
    ];

    let velocities = [
      this.rbA.velocity.x,
      this.rbA.velocity.y ,
      this.rbA.velocity.z,
      this.rbA.angularVelocity.x,
      this.rbA.angularVelocity.y,
      this.rbA.angularVelocity.z,

      this.rbB.velocity.x,
      this.rbB.velocity.y,
      this.rbB.velocity.z,
      this.rbB.angularVelocity.x,
      this.rbB.angularVelocity.y,
      this.rbB.angularVelocity.z,
    ];

    let masses = [
      this.rbA.mass,
      this.rbA.mass,
      this.rbA.mass,
      1 / itA[0],
      1 / itA[5],
      1 / itA[10],

      this.rbB.mass,
      this.rbB.mass,
      this.rbB.mass,
      1 / itB[0],
      1 / itB[5],
      1 / itB[10]
    ];

    // console.log(jacobian, velocities, masses);

    let C = distance - this.distance;
    let slop = null;

    lambdaAccumulated = undefined;
    lambdaAccumulatedIndex = undefined;

    // console.log(C);

    let { impulses } = getConstraintImpulse(jacobian, velocities, masses, C, dt, bias, lambdaAccumulated, lambdaAccumulatedIndex, slop);

    // console.log(impulses);

    if (!impulses.some(item => isNaN(item))) {
      if (!this.rbA.frozen) {
        this.rbA.velocity.x += impulses[0] / masses[0];
        this.rbA.velocity.y += impulses[1] / masses[1];
        this.rbA.velocity.z += impulses[2] / masses[2];

        if (!this.rbA.lockRotation) {
          this.rbA.angularVelocity.x += impulses[3] / masses[3];
          this.rbA.angularVelocity.y += impulses[4] / masses[4];
          this.rbA.angularVelocity.z += impulses[5] / masses[5];
        }
      }

      if (!this.rbB.frozen) {
        this.rbB.velocity.x += impulses[6] / masses[6];
        this.rbB.velocity.y += impulses[7] / masses[7];
        this.rbB.velocity.z += impulses[8] / masses[8];

        if (!this.rbB.lockRotation) {
          this.rbB.angularVelocity.x += impulses[9] / masses[9];
          this.rbB.angularVelocity.y += impulses[10] / masses[10];
          this.rbB.angularVelocity.z += impulses[11] / masses[11];
        }
      }

      // var ind = 0;
      // for (var body of constraint.bodies) {
      //   body.body.velocity.x += impulses[ind + 0] / masses[ind + 0];
      //   body.body.velocity.y += impulses[ind + 1] / masses[ind + 1];
      //   body.body.velocity.z += impulses[ind + 2] / masses[ind + 2];

      //   if (!body.body.lockRotation) {
      //     body.body.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
      //     body.body.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
      //     body.body.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
      //   }

      //   ind += 6;
      // }
    }
  };
}

//

function getConstraintImpulse(jacobian, velocities, masses, C, dt, biasFactor = 0.5, lambdaAccumulated, index, slop = -0.01) {
  var bias;
  if (!isNaN(parseFloat(slop))) {
    if (C < slop) {
      bias = biasFactor / dt * (C - slop);
    }
    else {
      bias = 0;
    }
  }
  else {
    bias = biasFactor / dt * C;
  }

  var effectiveMass = getEffectiveMass(jacobian, masses);
  var lambda = getLambda(effectiveMass, jacobian, velocities, bias);

  // bruh not recommended
  // lambda = Math.max(lambda, 0);

  // Clamp lambda
  if (Array.isArray(lambdaAccumulated)) {
    // if (lambdaAccumulated[index] + lambda < 0) {
    //   lambda = -lambdaAccumulated[index];
    // }
    // lambdaAccumulated[index] += lambda;

    // use this instead
    const clampFunction = l => Math.max(l, 0);

    const oldLambda = lambdaAccumulated[index];
    lambdaAccumulated[index] += lambda;
    lambdaAccumulated[index] = clampFunction(lambdaAccumulated[index]);
    const delta = lambdaAccumulated[index] - oldLambda;
    lambda = delta;
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
  let sum = 0;
  for (let i = 0; i < jacobian.length; i++) {
    sum += jacobian[i] * velocities[i];
  }
  const lambda = -effectiveMass * (sum + bias);

  if (!isFinite(lambda) || isNaN(lambda)) {
    console.error(lambda, effectiveMass, jacobian, velocities, bias, sum);
    throw new Error("Lambda is NaN");
  }

  return lambda;
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

//

export {
  GetMeshAABB,
  Octree,
  AABB,
  PhysicsEngine,
  Collider,
  MeshCollider,
  SphereCollider,
  CapsuleCollider,
  BoxCollider,
  Rigidbody,
  DistanceConstraint,
};