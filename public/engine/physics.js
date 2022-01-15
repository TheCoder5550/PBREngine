import Vector from "./vector.js";
import Matrix from "./matrix.js";
import Quaternion from "./quaternion.js";

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
} from "./helper.js";

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
} from "./algebra.js";

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

function Octree(aabb, maxDepth = 7) {
  this.aabb = aabb;
  this.children = [];
  this.items = [];
  this.maxDepth = maxDepth;
  this.divided = false;

  this.queryAABB = function(aabb, output = []) {
    if (!AABBToAABB(this.aabb, aabb)) {
      return;
    }

    for (var i = 0; i < this.items.length; i++) {
      output.push(this.items[i]);
    }

    for (var i = 0; i < this.children.length; i++) {
      this.children[i].queryAABB(aabb, output);
    }

    return output;
  }

  this.query = function(origin, direction, output = []) {
    if (!rayToAABB(origin, direction, this.aabb)) {
      return;
    }

    for (var i = 0; i < this.items.length; i++) {
      output.push(this.items[i]);
    }

    for (var i = 0; i < this.children.length; i++) {
      this.children[i].query(origin, direction, output);
    }

    return output;
  }

  this.addTriangle = function(triangle, depth = 0) {
    if (depth >= this.maxDepth || !AABBToTriangle(this.aabb, triangle)) {
      return false;
    }

    if (!this.divided) {
      this.subdivide();
      this.divided = true;
    }

    var found = false;
    for (var i = 0; i < this.children.length; i++) {
      if (this.children[i].addTriangle(triangle, depth + 1)) {
        found = true;
      }
    }
  
    if (!found) {
      this.items.push(triangle);
    }

    return true;
  }

  this.subdivide = function() {
    this.children.push(
      new Octree(new AABB(this.aabb.bl, Vector.average(this.aabb.bl, this.aabb.tr))),
      new Octree(new AABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.bl.y, z: this.aabb.bl.z}, {x: this.aabb.tr.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: (this.aabb.bl.z + this.aabb.tr.z) / 2})),
      new Octree(new AABB({x: this.aabb.bl.x, y: this.aabb.bl.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.tr.z})),
      new Octree(new AABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.bl.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: this.aabb.tr.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.tr.z})),

      new Octree(new AABB({x: this.aabb.bl.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.bl.z}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.tr.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2})),
      new Octree(new AABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.bl.z}, {x: this.aabb.tr.x, y: this.aabb.tr.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2})),
      new Octree(new AABB({x: this.aabb.bl.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.tr.y, z: this.aabb.tr.z})),
      new Octree(new AABB(Vector.average(this.aabb.bl, this.aabb.tr), this.aabb.tr))
    );
  }

  this.render = function(topCall = true) {
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
        this.children[i].render(false);
      }
    }
    
    if (topCall) {
      scene.root.getChild("AABB").meshRenderer.updateMatrixData();
    }
  }
}

function AABB(bl, tr) {
  this.bl = bl;
  this.tr = tr;

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

function PhysicsEngine(scene) {
  this.scene = scene;

  var constraintsToSolve = [];
  this.constraintIterations = 5;
  this.constraintBias = 0.4;

  this.dt = 1 / 60;
  var lastTime = performance.now();
  var accumulator = 0;
  this.time = 0;

  this.fixedUpdate = () => {};

  // var octree = new Octree(new AABB({x: -50, y: -20.5, z: -50}, {x: 50, y: 20, z: 50}));
  var octree = new Octree(new AABB(Vector.fill(-200), Vector.fill(200))); // Bruh offset by epsilon for plane at y=0
  this.octree = octree;

  this.Raycast = function(origin, direction) {
    var outArray = [];
  
    var q = octree.query(origin, direction);
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

  this.addMeshToOctree = function(gameObject) {
    addMeshToOctreeRec(gameObject);

    for (var i = 0; i < gameObject.children.length; i++) {
      var child = gameObject.children[i];
      addMeshToOctreeRec(child);
    }
  }

  function addMeshToOctreeRec(gameObject) {
    if (gameObject.meshRenderer) {
      var worldMatrix = gameObject.transform.worldMatrix;

      gameObject.meshColliders = [];
      // gameObject.octrees = [];
      for (var j = 0; j < gameObject.meshRenderer.meshData.length; j++) {
        gameObject.meshColliders.push(new MeshCollider(gameObject.meshRenderer.meshData[j].data, worldMatrix));

        var md = gameObject.meshRenderer.meshData[j].data;
        for (var k = 0; k < md.indices.bufferData.length; k += 3) {
          var vertices = [];
          for (var l = 0; l < 3; l++) {
            var currentIndex = md.indices.bufferData[k + l] * 3;
            var vec = Vector.fromArray(md.position.bufferData, currentIndex);
            vec = {x: vec.x, y: vec.y, z: vec.z};
            var transVec = Matrix.transformVector(worldMatrix, vec);
            vertices.push(transVec);
          }

          // var aabb = AABB.bounds(vertices);
          // this.scene.root.getChild("AABB").meshRenderer.addInstance(Matrix.transform([
          //   ["translate", Vector.divide(Vector.add(aabb.bl, aabb.tr), 2)],
          //   ["sx", (aabb.tr.x - aabb.bl.x) / 2],
          //   ["sy", (aabb.tr.y - aabb.bl.y) / 2],
          //   ["sz", (aabb.tr.z - aabb.bl.z) / 2]
          // ]));

          octree.addTriangle(vertices);
        }
      }
    }
  }

  var updatePhysics = () => {
    constraintsToSolve = [];

    var allRigidbodies = [];

    this.scene.root.traverse(function(gameObject) {
      var rigidbodies = gameObject.findComponents("Rigidbody");
      var rigidbody = rigidbodies[0];
      if (rigidbody) {
        allRigidbodies.push(rigidbody);

        var sphereColliders = rigidbody.gameObject.findComponents("SphereCollider");
        for (var collider of sphereColliders) {
          var mat = Matrix.removeTranslation(Matrix.copy(rigidbody.gameObject.transform.worldMatrix));
          var pos = Vector.add(rigidbody.position, Matrix.transformVector(mat, collider.offset));

          var s = Vector.fill(collider.radius * 4);
          var q = octree.queryAABB(new AABB(
            Vector.subtract(pos, s),
            Vector.add(pos, s)
          ));

          if (q) {
            for (var k = 0; k < q.length; k++) {
              var col = sphereToTriangle(pos, collider.radius, q[k][0], q[k][1], q[k][2], true);
              if (col) {
                // window.debugCube.transform.position = pos;

                var normal = col.normal;//getTriangleNormal(q[k]); // col.normal;

                // console.log({
                //   normal,
                //   pA: Vector.add(pos, Vector.multiply(normal, -collider.radius + col.depth * 0)),
                //   pos,
                //   r: collider.radius,
                //   C: -col.depth
                // });
                
                // if (Vector.lengthSqr(normal) > 0.1 * 0.1 && col.depth > 0.001) {
                  constraintsToSolve.push({
                    bodyA: rigidbody,
                    normal: normal,
                    pA: col.point,//Vector.add(pos, Vector.multiply(normal, -collider.radius)),
                    C: -col.depth
                  });

                  var p = Vector.add(pos, Vector.multiply(normal, -collider.radius));
                  debugCube.transform.matrix = Matrix.transform([["scale", new Vector(0.1, 0.1, 0.5)]], Matrix.lookAt(p, Vector.add(p, col.normal), new Vector(0.1, 0.9, 0)));

                  // break;
                // }
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
          var q = octree.queryAABB(new AABB(
            Vector.subtract(center, s),
            Vector.add(center, s)
          ));

          if (q) {
            for (var k = 0; k < q.length; k++) {
              var col = capsuleToTriangle(a, b, collider.radius, q[k][0], q[k][1], q[k][2], true);
              // var col = sphereToTriangle(pos, collider.radius, q[k][0], q[k][1], q[k][2], true);
              if (col) {
                var normal = col.normal;
                
                if (Vector.lengthSqr(normal) > 0.1 * 0.1 && col.depth > 0.001) {
                  constraintsToSolve.push({
                    bodyA: rigidbody,
                    normal: Vector.negate(normal),
                    pA: col.point,
                    C: col.depth
                  });
                }
              }
            }
          }
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

    var lambdaAccumulated = new Array(constraintsToSolve.length).fill(0);
    for (var i = 0; i < this.constraintIterations; i++) {
      for (var constraint of constraintsToSolve) {
        var C = constraint.C ?? 0;

        var jacobian = [];
        var frictionJacobian = [];
        var velocities = [];
        var masses = [];

        if (constraint.bodyA) {
          var cp1 = Vector.cross(Vector.subtract(constraint.pA, constraint.bodyA.position), constraint.normal);

          jacobian.push(
            constraint.normal.x,
            constraint.normal.y,
            constraint.normal.z,
            cp1.x,
            cp1.y,
            cp1.z
          );

          var tangent = Vector.length(constraint.bodyA.velocity) < 0.01 ? new Vector(1, 0, 0) : Vector.normalize(Vector.projectOnPlane(constraint.bodyA.velocity, constraint.normal));
          var cp1 = Vector.cross(Vector.subtract(constraint.pA, constraint.bodyA.position), tangent);

          frictionJacobian.push(
            tangent.x,
            tangent.y,
            tangent.z,
            cp1.x,
            cp1.y,
            cp1.z
          );

          velocities.push(
            constraint.bodyA.velocity.x,
            constraint.bodyA.velocity.y,
            constraint.bodyA.velocity.z,
            constraint.bodyA.angularVelocity.x,
            constraint.bodyA.angularVelocity.y,
            constraint.bodyA.angularVelocity.z
          );

          masses.push(
            constraint.bodyA.mass,
            constraint.bodyA.mass,
            constraint.bodyA.mass,
            constraint.bodyA.inertia.x,
            constraint.bodyA.inertia.y,
            constraint.bodyA.inertia.z
          );
        }

        if (constraint.bodyB) {
          var cp2 = Vector.cross(Vector.subtract(constraint.pB, constraint.bodyB.position), constraint.normal);

          jacobian = jacobian.concat([
            -constraint.normal.x,
            -constraint.normal.y,
            -constraint.normal.z,
            -cp2.x,
            -cp2.y,
            -cp2.z
          ]);

          velocities = velocities.concat([
            constraint.bodyB.velocity.x,
            constraint.bodyB.velocity.y,
            constraint.bodyB.velocity.z,
            constraint.bodyB.angularVelocity.x,
            constraint.bodyB.angularVelocity.y,
            constraint.bodyB.angularVelocity.z
          ]);

          masses = masses.concat([
            constraint.bodyB.mass,
            constraint.bodyB.mass,
            constraint.bodyB.mass,
            constraint.bodyB.inertia.x,
            constraint.bodyB.inertia.y,
            constraint.bodyB.inertia.z
          ]);
        }

        // Collision
        var { impulses, lambda } = getConstraintImpulse(jacobian, velocities, masses, C, this.dt, this.constraintBias, lambdaAccumulated, i);

        if (!impulses.some(item => isNaN(item))) {
          var ind = 0;
          if (constraint.bodyA) {
            constraint.bodyA.velocity.x += impulses[ind + 0] / masses[ind + 0];
            constraint.bodyA.velocity.y += impulses[ind + 1] / masses[ind + 1];
            constraint.bodyA.velocity.z += impulses[ind + 2] / masses[ind + 2];
            constraint.bodyA.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
            constraint.bodyA.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
            constraint.bodyA.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
            ind += 6;
          }

          if (constraint.bodyB) {
            constraint.bodyB.velocity.x += impulses[ind + 0] / masses[ind + 0];
            constraint.bodyB.velocity.y += impulses[ind + 1] / masses[ind + 1];
            constraint.bodyB.velocity.z += impulses[ind + 2] / masses[ind + 2];
            constraint.bodyB.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
            constraint.bodyB.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
            constraint.bodyB.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
          }
        }
        else {
          console.warn("NaN in impulses", {
            constraint, impulses, jacobian, velocities, masses, C, dt: this.dt
          });
        }

        // Friction
        // if (!(frictionJacobian[3] == 0 && frictionJacobian[4] == 0 && frictionJacobian[5] == 0)) {
        //   var bias = 0;
        //   var effectiveMass = getEffectiveMass(frictionJacobian, masses);
        //   var frictionLambda = getLambda(effectiveMass, frictionJacobian, velocities, bias);

        //   var friction = 0.5;
        //   frictionLambda = clamp(frictionLambda, -friction * lambda, friction * lambda);
        
        //   var impulses = [];
        //   for (var i = 0; i < frictionJacobian.length; i++) {
        //     impulses[i] = frictionJacobian[i] * frictionLambda;
        //   }

        //   if (!impulses.some(item => isNaN(item))) {
        //     var ind = 0;
        //     if (constraint.bodyA) {
        //       constraint.bodyA.velocity.x += impulses[ind + 0] / masses[ind + 0];
        //       constraint.bodyA.velocity.y += impulses[ind + 1] / masses[ind + 1];
        //       constraint.bodyA.velocity.z += impulses[ind + 2] / masses[ind + 2];
        //       constraint.bodyA.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
        //       constraint.bodyA.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
        //       constraint.bodyA.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
        //       ind += 6;
        //     }

        //     if (constraint.bodyB) {
        //       constraint.bodyB.velocity.x += impulses[ind + 0] / masses[ind + 0];
        //       constraint.bodyB.velocity.y += impulses[ind + 1] / masses[ind + 1];
        //       constraint.bodyB.velocity.z += impulses[ind + 2] / masses[ind + 2];
        //       constraint.bodyB.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
        //       constraint.bodyB.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
        //       constraint.bodyB.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
        //     }
        //   }
        //   else {
        //     console.warn("NaN in impulses", {
        //       constraint, impulses, jacobian, velocities, masses, C, dt: this.dt
        //     });
        //   }
        // }
      }
    }

    for (var rigidbody of allRigidbodies) {
      rigidbody.integrate(this.dt);
    }
  }

  this.update = function() {
    // var newTime = performance.now();
    // var frameTime = (newTime - lastTime) / 1000;
    // if (frameTime > 0.25)
    //   frameTime = 0.25;
    // lastTime = newTime;

    // accumulator += frameTime;

    // while (accumulator >= this.dt) {
    //   this.fixedUpdate(this.dt);
    //   updatePhysics();
    //   accumulator -= this.dt;
    //   this.time += this.dt;
    // }


    this.fixedUpdate(this.dt);
    updatePhysics();
    this.time += this.dt;
  }

  this.getConstraintImpulse = getConstraintImpulse;
  function getConstraintImpulse(jacobian, velocities, masses, C, dt, biasFactor = 0.5, lambdaAccumulated, index) {
    var bias = biasFactor / dt * C;
  
    var effectiveMass = getEffectiveMass(jacobian, masses);
    var lambda = getLambda(effectiveMass, jacobian, velocities, bias);

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
}

class Collider {
  constructor() {
    this.gameObject = null;
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

    this.inertia = Vector.one(); // Bruh
    // this.angles = Vector.zero();
    this.rotation = Quaternion.identity();
    this.angularVelocity = Vector.zero();
    this.torque = Vector.zero();

    this.gravityScale = 1;
  }

  getWorldCOMOffset() {
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
    this.AddForce(force);
    var r = Vector.subtract(position, Vector.add(this.position, this.getWorldCOMOffset()));
    this.AddTorque(Vector.cross(r, force));
  }

  AddImpulseAtPosition(force, position) {
    this.velocity = Vector.add(this.velocity, Vector.multiply(force, 1 / this.mass));
    var r = Vector.subtract(position, Vector.add(this.position, this.getWorldCOMOffset()));
    var torque = Vector.cross(r, force);
    this.angularVelocity = Vector.add(this.angularVelocity, Vector.compDivide(torque, this.inertia));
  }

  AddForce(force) {
    this.force = Vector.add(this.force, force);
  }

  AddTorque(torque) {
    this.torque = Vector.add(this.torque, torque);
  }

  integrate(dt) {
    this.velocity = Vector.add(this.velocity, Vector.multiply(this.force, dt / this.mass));
    this.force = Vector.zero();

    this.velocity = Vector.add(this.velocity, Vector.multiply(new Vector(0, -9.82 * this.gravityScale, 0), dt));

    this.position = Vector.add(this.position, Vector.multiply(this.velocity, dt));

    this.angularVelocity = Vector.add(this.angularVelocity, Vector.multiply(Vector.compDivide(this.torque, this.inertia), dt));
    this.torque = Vector.zero();
    // this.angles = Vector.add(this.angles, Vector.multiply(this.angularVelocity, dt));
  
    var w = new Quaternion(
      this.angularVelocity.x,
      this.angularVelocity.y,
      this.angularVelocity.z,
      0
    );
    this.rotation = Quaternion.add(this.rotation, Quaternion.multiply(Quaternion.QxQ(w, this.rotation), dt / 2));
  }

  update() {
    if (this.gameObject != null) {
      this.gameObject.transform.position = this.position;
      this.gameObject.transform.rotation = this.rotation;

      // this.gameObject.transform.rotationMatrix = Matrix.transform([
      //   ["rz", this.angles.z],
      //   ["ry", this.angles.y],
      //   ["rx", this.angles.x],
      // ]);

      // this.gameObject.transform.rotationMatrix = Matrix.transform([
      //   ["rx", this.angles.x],
      //   ["rz", this.angles.z],
      //   ["ry", this.angles.y]
      // ]);
    }
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