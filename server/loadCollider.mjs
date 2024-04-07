import { createRequire } from "module";
const require = createRequire(import.meta.url);

import Vector from "../public/engine/vector.mjs";
import Matrix from "../public/engine/matrix.mjs";
import { GameObject } from "../public/engine/gameObject.mjs";
import { Transform } from "../public/engine/transform.mjs";
import { Octree, AABB } from "../public/engine/physics.mjs";
import { Uint8ToUint32 } from "../public/engine/helper.mjs";
const fs = require("fs");

export default async function LoadCollider(path) {
  var gameObject = (await CreateGameObjectFromGLTF(path))[0];
  var octree = new Octree(new AABB({x: -50, y: -20.5, z: -50}, {x: 50, y: 20, z: 50}), 4);

  var nrTriangles = 0;

  gameObject.traverse(o => {
    if (o.meshRenderer) {
      for (var j = 0; j < o.meshRenderer.meshData.length; j++) {
        var md = o.meshRenderer.meshData[j];
        nrTriangles += md.indices.bufferData.length / 3;
      }
    }
  });

  var trianglesArray = new Float32Array(nrTriangles * 3 * 3);
  var triangleIndex = 0;

  gameObject.traverse(o => {
    if (o.meshRenderer) {
      var worldMatrix = o.getWorldMatrix();

      for (var j = 0; j < o.meshRenderer.meshData.length; j++) {
        var md = o.meshRenderer.meshData[j];

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

  octree.addTriangles(trianglesArray);

  return octree;

  for (var i = 0; i < gameObject.children.length; i++) {
    var child = gameObject.children[i];
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

export async function CreateGameObjectFromGLTF(path, globalOptions = {}) {
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

        mainParent.traverse(o => {
          o.transform.matrix = o.transform.matrix;
        });

        resolve([mainParent]);
      }

      function AddChildrenRecursive(nodeIndex, depth = 0) {
        var node = json.nodes[nodeIndex];
      
        var mat = Matrix.identity();
        if (node.matrix) {
          Matrix.copy(node.matrix, mat);
        }
        else {
          if (node.translation) Matrix.translate(Vector.fromArray(node.translation), mat);
          if (node.rotation) Matrix.multiply(mat, Matrix.fromQuaternion(Vector.fromArray(node.rotation)), mat);
          if (node.scale) Matrix.transform([["scale", Vector.fromArray(node.scale)]], mat);
        }
        
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

            meshDatas.push({
              data: meshData
            });
          }
      
          gameObject.meshRenderer = {
            meshData: meshDatas
          };
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

// function GameObject(name, options = {}) {
//   this.name = name;
//   this.children = def(options.children, []);
//   this.parent = null;

//   this.matrix = def(options.matrix, Matrix.identity());
//   this.baseMatrix = Matrix.copy(this.matrix);
//   this.translationMatrix = Matrix.getTranslationMatrix(this.matrix);
//   this.rotationMatrix = Matrix.getRotationMatrix(this.matrix);
//   this.scaleMatrix = Matrix.getScaleMatrix(this.matrix);
//   this.worldMatrix = null;

//   this.visible = def(options.visible, true);

//   this.traverse = function(func) {
//     func(this);
//     for (var child of this.children) {
//       child.traverse(func);
//     }
//   }

//   this.addChildren = function(children) {
//     for (var i = 0; i < children.length; i++) {
//       children[i].parent = this;
//       this.children.push(children[i]);
//     }
//     return children;
//   }

//   this.getWorldMatrix = function(stopParent, matrices = [], doMult = true) {
//     matrices.push(this.matrix);
//     if (this.parent && this.parent != stopParent) {
//       this.parent.getWorldMatrix(stopParent, matrices, false);
//     }
    
//     if (doMult) {
//       var newMats = [...matrices].reverse();
//       var outMatrix = Matrix.identity();
//       for (var i = 0; i < newMats.length; i++) {
//         outMatrix = Matrix.multiply(outMatrix, newMats[i]);
//       }
//       return outMatrix;
//     }
//   }

//   this.getChild = function(name, recursive = false) {
//     if (recursive) {
//       var found;
      
//       this.traverse(o => {
//         if (o.name === name && !found) {
//           found = o;
//         }
//       });

//       return found;
//     }
//     else {
//       return this.children.find(e => e.name == name);
//     }
//   }
// }

// function def(current, d) {
//   return typeof current == "undefined" ? d : current;
// }

// function Octree(aabb) {
//   this.aabb = aabb;
//   this.children = [];
//   this.items = [];
//   this.maxDepth = 4;
//   this.divided = false;

//   this.queryAABB = function(aabb, output = []) {
//     if (!AABBToAABB(aabb, this.aabb)) {
//       return;
//     }

//     for (var i = 0; i < this.items.length; i++) {
//       output.push(this.items[i]);
//     }

//     for (var i = 0; i < this.children.length; i++) {
//       this.children[i].queryAABB(aabb, output);
//     }

//     return output;
//   }

//   this.query = function(origin, direction, output = []) {
//     if (!rayToAABB(origin, direction, this.aabb)) {
//       return;
//     }

//     for (var i = 0; i < this.items.length; i++) {
//       output.push(this.items[i]);
//     }

//     for (var i = 0; i < this.children.length; i++) {
//       this.children[i].query(origin, direction, output);
//     }

//     return output;
//   }

//   this.addTriangle = function(triangle, depth = 0) {
//     if (!AABBToTriangle(this.aabb, triangle) || depth >= this.maxDepth) {
//       return false;
//     }

//     if (!this.divided) {
//       this.subdivide();
//       this.divided = true;
//     }

//     var found = false;
//     for (var i = 0; i < this.children.length; i++) {
//       if (this.children[i].addTriangle(triangle, depth + 1)) {
//         found = true;
//       }
//     }
  
//     if (!found) {
//       this.items.push(triangle);
//     }

//     return true;
//   }

//   this.subdivide = function() {
//     this.children.push(
//       new Octree(new AABB(this.aabb.bl, Vector.average(this.aabb.bl, this.aabb.tr)), this.maxDepth),
//       new Octree(new AABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.bl.y, z: this.aabb.bl.z}, {x: this.aabb.tr.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}), this.maxDepth),
//       new Octree(new AABB({x: this.aabb.bl.x, y: this.aabb.bl.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.tr.z}), this.maxDepth),
//       new Octree(new AABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.bl.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: this.aabb.tr.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.tr.z}), this.maxDepth),

//       new Octree(new AABB({x: this.aabb.bl.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.bl.z}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.tr.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}), this.maxDepth),
//       new Octree(new AABB({x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: this.aabb.bl.z}, {x: this.aabb.tr.x, y: this.aabb.tr.y, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}), this.maxDepth),
//       new Octree(new AABB({x: this.aabb.bl.x, y: (this.aabb.bl.y + this.aabb.tr.y) / 2, z: (this.aabb.bl.z + this.aabb.tr.z) / 2}, {x: (this.aabb.bl.x + this.aabb.tr.x) / 2, y: this.aabb.tr.y, z: this.aabb.tr.z}), this.maxDepth),
//       new Octree(new AABB(Vector.average(this.aabb.bl, this.aabb.tr), this.aabb.tr), this.maxDepth)
//     );
//   }
// }