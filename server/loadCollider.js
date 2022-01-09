const Vector = require("../public/vector.js");
const Matrix = require("../public/matrix.js");
const fs = require('fs');

async function LoadCollider(path) {
  var obj = (await CreateGameObjectFromGLTF(path))[0];
  octree = new Octree(new AABB({x: -50, y: -20.5, z: -50}, {x: 50, y: 20, z: 50}));

  for (var i = 0; i < obj.children.length; i++) {
    var child = obj.children[i];
    if (child.meshData && child.name != "Water") {
      var worldMatrix = child.getWorldMatrix();
      for (var j = 0; j < child.meshData.length; j++) {
        var md = child.meshData[j];
        for (var k = 0; k < md.indices.bufferData.length; k += 3) {
          var vertices = [];
          for (var l = 0; l < 3; l++) {
            var currentIndex = md.indices.bufferData[k + l] * 3;
            var vec = Vector.fromArray(md.position.bufferData, currentIndex);
            vec = {x: vec.x, y: vec.y, z: vec.z};
            var transVec = Matrix.transformVector(worldMatrix, vec);
            vertices.push(transVec);
          }

          octree.addTriangle(vertices);
        }
      }
    }
  }

  return octree;
}

var typedArrayLookup = {
  "5120": Int8Array,
  "5121": Uint8Array,
  "5122": Int16Array,
  "5123": Uint16Array,
  "5125": Uint32Array,
  "5126": Float32Array
};

var typeComponents = {
  "SCALAR": 1,
  "VEC2": 2,
  "VEC3": 3,
  "VEC4": 4,
  "MAT2": 4,
  "MAT3": 9,
  "MAT4": 16
};

async function CreateGameObjectFromGLTF(path, globalOptions = {}) {
  return new Promise(resolve => {
    fs.readFile(path, (err, data) => {
      if (err) {
        console.error(err);
        return;
      }

      var arrayBuffer = data;
      if (arrayBuffer) {
        let utf8decoder = new TextDecoder();
        var byteArray = new Uint8Array(arrayBuffer);

        var json;
        var buffers = [];

        var i = 12;
        while (i < byteArray.byteLength) {
          var chunkLength = Uint8ToUint32(byteArray.slice(i, i + 4));
          var chunkType = Uint8ToUint32(byteArray.slice(i + 4, i + 8));
          var chunkData = byteArray.slice(i + 2 * 4, i + 2 * 4 + chunkLength);

          if (chunkType == 0x4E4F534A) {
            var text = utf8decoder.decode(chunkData);
            json = JSON.parse(text);
          }
          else if (chunkType == 0x004E4942) {
            buffers.push(chunkData);
          }
          else {
            console.log("Invalid chunk type: " + chunkType.toString(16));
          }

          i += chunkLength + 8;
        }

        // console.log(path, json);

        var end = path.indexOf(".glb") + 4;
        var start = path.lastIndexOf("/", end) + 1;
        var mainParent = new GameObject(path.slice(start, end));

        var outObjects = [];
        var currentScene = json.scenes[json.scene];
        for (var i = 0; i < currentScene.nodes.length; i++) {
          outObjects = outObjects.concat(AddChildrenRecursive(currentScene.nodes[i]));
        }

        mainParent.addChildren(outObjects);

        resolve([mainParent]);
      }

      function AddChildrenRecursive(nodeIndex, depth = 0) {
        var node = json.nodes[nodeIndex];
      
        var mat = Matrix.identity();
        if (node.translation) mat = Matrix.translate(Vector.fromArray(node.translation));
        if (node.rotation) mat = Matrix.multiply(mat, Matrix.fromQuaternion(Vector.fromArray(node.rotation)));
        if (node.scale) Matrix.transform([["scale", Vector.fromArray(node.scale)]], mat);
        
        var gameObject = new GameObject(node.name, {matrix: mat, ...globalOptions});
        gameObject.nodeIndex = nodeIndex;
      
        if (node.mesh != undefined) {
          var mesh = json.meshes[node.mesh];
      
          var meshDatas = [];
      
          for (var i = 0; i < mesh.primitives.length; i++) {
            var currentPrimitive = mesh.primitives[i];
            var meshData = {};
            var indexAccessor = json.accessors[currentPrimitive.indices];
            var indexView = json.bufferViews[indexAccessor.bufferView];
            var indexBuffer = new Uint32Array(new Uint16Array(buffers[indexView.buffer].slice(indexView.byteOffset, indexView.byteOffset + indexView.byteLength).buffer));
            meshData.indices = {
              bufferData: indexBuffer
            };
      
            var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.POSITION);
            meshData.position = { bufferData: accAndBuffer.buffer, size: accAndBuffer.size };

            meshDatas.push(meshData);
          }
      
          gameObject.meshData = meshDatas;
          // gameObject.meshRenderer = new MeshRenderer(materials, meshDatas);
        }
      
        var out = [];
        if (node.children != undefined) {
          for (var j = 0; j < node.children.length; j++) {
            out = out.concat(AddChildrenRecursive(node.children[j], depth + 1));
          }
        }
      
        gameObject.addChildren(out);
      
        return [gameObject];
      }
      
      function getAccessorAndBuffer(index) {
        if (index != undefined && index >= 0) {
          var accessor = json.accessors[index];
          var view = json.bufferViews[accessor.bufferView];
          var buffer = buffers[view.buffer].slice(view.byteOffset, view.byteOffset + view.byteLength);
          return {
            buffer: new typedArrayLookup[accessor.componentType](buffer.buffer),
            size: typeComponents[accessor.type],
            type: accessor.componentType
          };
        }
      }
    });
  });
}

function Uint8ToUint32(num) {
  return new DataView(Uint8Array.from(num).buffer).getInt32(0, true);
}

function GameObject(name, options = {}) {
  this.name = name;
  this.children = def(options.children, []);
  this.parent = null;

  this.matrix = def(options.matrix, Matrix.identity());
  this.baseMatrix = Matrix.copy(this.matrix);
  this.translationMatrix = Matrix.getTranslationMatrix(this.matrix);
  this.rotationMatrix = Matrix.getRotationMatrix(this.matrix);
  this.scaleMatrix = Matrix.getScaleMatrix(this.matrix);
  this.worldMatrix = null;

  this.visible = def(options.visible, true);

  this.addChildren = function(children) {
    for (var i = 0; i < children.length; i++) {
      children[i].parent = this;
      this.children.push(children[i]);
    }
    return children;
  }

  this.getWorldMatrix = function(stopParent, matrices = [], doMult = true) {
    matrices.push(this.matrix);
    if (this.parent && this.parent != stopParent) {
      this.parent.getWorldMatrix(stopParent, matrices, false);
    }
    
    if (doMult) {
      var newMats = [...matrices].reverse();
      var outMatrix = Matrix.identity();
      for (var i = 0; i < newMats.length; i++) {
        outMatrix = Matrix.multiply(outMatrix, newMats[i]);
      }
      return outMatrix;
    }
  }
}

function def(current, d) {
  return typeof current == "undefined" ? d : current;
}

function Octree(aabb) {
  this.aabb = aabb;
  this.children = [];
  this.items = [];
  this.maxDepth = 4;
  this.divided = false;

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
    if (!AABBToTriangle(this.aabb, triangle) || depth >= this.maxDepth) {
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

function rayToAABB(origin, direction, AABB) {
  var dirfrac = {
    x: 1 / direction.x,
    y: 1 / direction.y,
    z: 1 / direction.z
  };

  var t1 = (AABB.bl.x - origin.x) * dirfrac.x;
  var t2 = (AABB.tr.x - origin.x) * dirfrac.x;
  var t3 = (AABB.bl.y - origin.y) * dirfrac.y;
  var t4 = (AABB.tr.y - origin.y) * dirfrac.y;
  var t5 = (AABB.bl.z - origin.z) * dirfrac.z;
  var t6 = (AABB.tr.z - origin.z) * dirfrac.z;

  var tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
  var tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

  if (tmax < 0) return false;
  if (tmin > tmax) return false;
  return {
    min: tmin,
    max: tmax
  };
}

/* Slow? Prolly */
function AABBToTriangle(box, triangle) {
  for (var i = 0; i < 3; i++) {
    if (box.pointInside(triangle[i])) {
      return true;
    }
  }

  for (var i = 0; i < 3; i++) {
    var origin = triangle[i];
    var diff = Vector.subtract(triangle[(i + 1) % 3], triangle[i]);
    var direction = Vector.normalize(diff);
    var len = Vector.length(diff);

    var hit = rayToAABB(origin, direction, box);
    if (hit && Math.min(Math.abs(hit.min), Math.abs(hit.max)) <= len) {
      return true;
    }
  }

  var vertices = box.getVertices();
  var edges = box.getEdges();

  for (var i = 0; i < edges.length; i++) {
    var v1 = vertices[edges[i][0]];
    var v2 = vertices[edges[i][1]];

    var origin = v1;
    var diff = Vector.subtract(v2, v1);
    var direction = Vector.normalize(diff);
    var len = Vector.length(diff);

    var hit = rayToTriangle(origin, direction, triangle[0], triangle[1], triangle[2]);
    if (hit && hit.distance <= len) {
      return true;
    }
  }

  return false;
}

function rayToTriangle(rayOrigin, rayVector, a, b, c) {
  var EPSILON = 0.0000001;
  var vertex0 = a;
  var vertex1 = b;
  var vertex2 = c;

  var h, s, q;
  var a,f,u,v;

  var edge1 = Vector.subtract(vertex1, vertex0);
  var edge2 = Vector.subtract(vertex2, vertex0);
  var h = Vector.cross(rayVector, edge2);
  var a = Vector.dot(edge1, h);

  if (a > -EPSILON && a < EPSILON)
    return false;

  var f = 1 / a;
  var s = Vector.subtract(rayOrigin, vertex0);
  var u = Vector.dot(s, h) * f;
  if (u < 0.0 || u > 1.0)
    return false;

  var q = Vector.cross(s, edge1);
  var v = f * Vector.dot(rayVector, q);
  if (v < 0.0 || u + v > 1.0)
    return false;

  var t = f * Vector.dot(edge2, q);
  if (t > EPSILON) {
    return {
      point: Vector.add(rayOrigin, Vector.multiply(rayVector, t)),
      distance: t
    };
  }
  else
    return false;
}

exports.LoadCollider = LoadCollider;