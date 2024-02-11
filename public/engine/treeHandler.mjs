import * as simpleFoliage from "../assets/shaders/custom/simpleFoliage.glsl.mjs";

import { GameObject } from "./gameObject.mjs";
import { clamp01 } from "./helper.mjs";
import Matrix from "./matrix.mjs";
import { AABB } from "./physics.mjs";
import Vector from "./vector.mjs";

export default function TreeHandler(scene, camera) {
  const renderer = scene.renderer;
  const instancedFoliage = new renderer.CustomProgram(simpleFoliage.instanced);

  const variants = [];

  this.addVariant = async function(treePath, levels) {
    if (!isAscending(levels)) {
      throw new Error("Levels must be in ascending order");
    }

    const variant = new TreeVariant(treePath, levels);
    await variant.setup();

    variants.push(variant);
    return variant;
  };

  this.addRandomVariant = function(matrix) {
    variants[Math.floor(Math.random() * variants.length)].addTree(matrix);
  };

  class TreeVariant {
    constructor(treePath, levels) {
      const trees = [];
      const meshRenderers = [];
      const grid = new Map();
      const bounds = new AABB();

      this.crossFadeDistance = 15;
      this.lastLODIsBillboard = true;
      this.useUnlitForBillboard = true;
      this.generateUpNormalsForBillboard = false;
      this.billboardShadows = false;
      this.randomizeColor = true;

      const treeParent = new GameObject("Tree handler");
      treeParent.addComponent({
        update: (frameTime) => {
          const position = camera.transform.position;
          const center = new Vector(
            Math.floor(position.x / cellSize),
            Math.floor(position.y / cellSize),
            Math.floor(position.z / cellSize)
          );
          const trees = [];
          for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
              for (let z = -1; z <= 1; z++) {
                const cell = grid.get(`${center.x + x}@${center.y + y}@${center.z + z}`);
                if (cell) {
                  trees.push(...cell);
                }
              }
            }
          }

          for (const tree of trees) {
            const distance = Vector.distance(camera.transform.position, tree.position);
            const newLevel = levels.findIndex(l => distance < l);

            const addTo = [];
            if (newLevel !== -1) {
              addTo.push(meshRenderers[newLevel]);

              if (distance > levels[newLevel] - this.crossFadeDistance && meshRenderers[newLevel + 1]) {
                addTo.push(meshRenderers[newLevel + 1]);
              }
            }

            for (const meshRenderer of meshRenderers) {
              if (tree.addedTo.includes(meshRenderer) && !addTo.includes(meshRenderer)) {
                meshRenderer.removeInstance(tree.instance);
              }
            }

            if (newLevel !== -1) {
              // if (newLevel !== tree.level) {
              //   tree.targetDither = 0;
              //   tree.currentDither = 1;
              // }

              // if (meshRenderers[newLevel - 1] && !tree.addedTo.includes(meshRenderers[newLevel - 1])) {
              //   meshRenderers[newLevel - 1].addInstanceDontCopy(tree.instance);
              // }
              // if (!tree.addedTo.includes(meshRenderers[newLevel])) {
              //   meshRenderers[newLevel].addInstanceDontCopy(tree.instance);
              // }
              // if (meshRenderers[newLevel + 1] && !tree.addedTo.includes(meshRenderers[newLevel + 1])) {
              //   meshRenderers[newLevel + 1].addInstanceDontCopy(tree.instance);
              // }

              // meshRenderers[newLevel - 1]?.setDitherAmount(tree.instance, 2 - tree.currentDither);
              // meshRenderers[newLevel + 0]?.setDitherAmount(tree.instance, tree.currentDither);
              // meshRenderers[newLevel + 1]?.setDitherAmount(tree.instance, 2 - tree.currentDither);

              const f = clamp01(1 - (levels[newLevel] - distance) / this.crossFadeDistance);

              if (!tree.addedTo.includes(meshRenderers[newLevel])) {
                meshRenderers[newLevel].addInstanceDontCopy(tree.instance);
                meshRenderers[newLevel].setColor(tree.instance, tree.color);
              }
              meshRenderers[newLevel].setDitherAmount(tree.instance, f);

              if (distance > levels[newLevel] - this.crossFadeDistance && meshRenderers[newLevel + 1]) {
                if (!tree.addedTo.includes(meshRenderers[newLevel + 1])) {
                  meshRenderers[newLevel + 1].addInstanceDontCopy(tree.instance);
                  meshRenderers[newLevel + 1].setColor(tree.instance, tree.color);
                }
                meshRenderers[newLevel + 1].setDitherAmount(tree.instance, 2 - f);
              }
            }

            tree.addedTo = [...addTo];

            tree.currentDither += Math.sign(tree.currentDither - tree.targetDither) * 2 * frameTime;

            tree.level = newLevel;

            // if (newLevel !== tree.level) {
            //   if (Math.abs(levels[tree.level] - distance) > 10) {
            //     for (const meshRenderer of meshRenderers) {
            //       meshRenderer.removeInstance(tree.instance);
            //     }
            //   }
            //   if (newLevel !== -1) {
            //     meshRenderers[newLevel].addInstanceDontCopy(tree.instance);
            //   }
            //   tree.level = newLevel;
            // }
            // if (newLevel !== -1) {
            //   meshRenderers[tree.level].setDitherAmount(tree.instance, 0);
            //   // meshRenderers[tree.level].setDitherAmount(tree.instance, clamp01(1 - (levels[tree.level] - distance) / 10));
            // }
          }
        }
      });
      scene.add(treeParent);

      const getCellSize = () => {
        if (levels.length === 1) {
          return levels[0];
        }

        return levels[levels.length - 2];
      };
      const cellSize = getCellSize();

      this.setup = async function () {
        const treeLODs = await renderer.loadGLTF(treePath, { loadVertexColors: false });

        for (let i = 0; i < levels.length; i++) {
          const name = `LOD${i + 1}`;
          const tree = treeLODs.getChild(name);

          if (!tree) {
            throw new Error("Can't find " + name);
          }

          // const tree = await renderer.loadGLTF(path, { loadVertexColors: false });
          const batchedTree = treeParent.add(renderer.BatchGameObject(tree));
          batchedTree.disableFrustumCulling = true;

          batchedTree.meshRenderer = batchedTree.meshRenderer.getInstanceMeshRenderer();

          // for (const material of batchedTree.meshRenderer.materials) {
          //   material.programContainer = instancedFoliage;
          // }
          // batchedTree.meshRenderer.materials[batchedTree.meshRenderer.materials.length - 1].programContainer = instancedFoliage;
          const isBillboard = (
            this.lastLODIsBillboard &&
            i === levels.length - 1
          );

          if (isBillboard) {
            // Make all normals point up
            if (this.generateUpNormalsForBillboard) {
              const meshData = batchedTree.meshRenderer.meshData[0];
              const oldNormals = meshData.data.normal;
              const newNormals = new Float32Array(oldNormals.bufferData.length);
              for (let i = 0; i < newNormals.length; i += 3) {
                newNormals[i + 0] = 0;
                newNormals[i + 1] = 1;
                newNormals[i + 2] = 0;
              }
              meshData.setAttribute("normal", {
                bufferData: newNormals,
                size: oldNormals.size
              });

              // When we make all normals point up, we assume that
              // the model comes with mirrored geometry instead of
              // a material with `doubleSided` set to true since
              // such a material would cause the backface to have flipped
              // normals (pointing down) which we don't want. So we disable
              // double sided material to gain performance.
              for (const material of batchedTree.meshRenderer.materials) {
                material.doubleSided = false;
                material.doubleSidedShadows = false;
              }
            }

            // Use unlit
            if (this.useUnlitForBillboard) {
              for (const material of batchedTree.meshRenderer.materials) {
                material.programContainer = renderer.programContainers.unlitInstanced;
              }
            }

            // Disable shadows if option is set
            batchedTree.castShadows = this.billboardShadows;
            batchedTree.receiveShadows = this.billboardShadows;
          }
          else {
            batchedTree.meshRenderer.materials[batchedTree.meshRenderer.materials.length - 1].programContainer = instancedFoliage;
          }

          try {
            // if (path.indexOf("imposter") === -1) throw new Error();
            // batchedTree.meshRenderer.materials[1].programContainer = instancedFoliage;
          }
          catch {
            // batchedTree.meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
            // batchedTree.castShadows = false;
            // batchedTree.receiveShadows = false;
            // const meshData = batchedTree.meshRenderer.meshData[0];
            // const oldNormals = meshData.data.normal;
            // const newNormals = new Float32Array(oldNormals.bufferData.length);
            // for (let i = 0; i < newNormals.length; i += 3) {
            //   newNormals[i + 0] = 0;
            //   newNormals[i + 1] = 1;
            //   newNormals[i + 2] = 0;
            // }
            // meshData.setAttribute("normal", {
            //   bufferData: newNormals,
            //   size: oldNormals.size
            // });
          }

          meshRenderers.push(batchedTree.meshRenderer);
        }

        for (const child of treeParent.children) {
          child.forceAABBUpdate(); // Make sure child has a AABB when later accessing it
        }
      };

      this.addTree = function (matrix) {
        if (!Matrix.isMatrix(matrix)) {
          throw new Error("Pass a valid transform matrix to create a new tree");
        }

        const color = this.randomizeColor ? [
          1,
          0.5 + Math.random() * 0.5,
          1,
          1
        ] : [1, 1, 1, 1];
        const instance = Matrix.copy(matrix);

        const meshRenderer = meshRenderers[meshRenderers.length - 1];
        meshRenderer.addInstanceDontCopy(instance);

        // Set color for this tree across all mesh renderers
        for (const meshRenderer of meshRenderers) {
          meshRenderer.setColor(instance, color);
        }

        const position = Matrix.getPosition(instance);
        const tree = {
          position,
          color,
          instance,
          level: 0,
          targetDither: 0,
          currentDither: 0,
          addedTo: [meshRenderer]
        };
        trees.push(tree);

        const cellIndex = new Vector(
          Math.floor(position.x / cellSize),
          Math.floor(position.y / cellSize),
          Math.floor(position.z / cellSize)
        );
        const cell = grid.get(`${cellIndex.x}@${cellIndex.y}@${cellIndex.z}`);
        if (cell) {
          cell.push(tree);
        }
        else {
          grid.set(`${cellIndex.x}@${cellIndex.y}@${cellIndex.z}`, [tree]);
        }

        bounds.extend(tree.position);
        for (const child of treeParent.children) {
          const aabb = child.getAABB();
          Vector.copy(bounds.bl, aabb.bl);
          Vector.copy(bounds.tr, aabb.tr);
        }
      };
    }
  }
}

function isAscending(arr) {
  return arr.every(function (x, i) {
    return i === 0 || x >= arr[i - 1];
  });
}