async function CreateGameObjectFromGLTF(path, globalOptions = {}) {
  return new Promise(resolve => {
    var oReq = new XMLHttpRequest();
    oReq.open("GET", path, true);
    oReq.responseType = "arraybuffer";

    oReq.onload = function (oEvent) {
      var arrayBuffer = oReq.response;
      if (arrayBuffer) {
        console.log("Loading GLTF:", path);
        console.time("LoadGLTF");

        let utf8decoder = new TextDecoder();
        var byteArray = new Uint8Array(arrayBuffer);

        var json;
        var buffers = [];

        var i = 12;
        while (i < byteArray.byteLength) {
          var chunkLength = Uint8ToUint32(byteArray.slice(i, i + 4));//parseInt("0x" + byteArray[i + 3].toString(16) + byteArray[i + 2].toString(16) + byteArray[i + 1].toString(16) + byteArray[i].toString(16));
          var chunkType = Uint8ToUint32(byteArray.slice(i + 4, i + 8));//parseInt("0x" + byteArray[i + 7].toString(16) + byteArray[i + 6].toString(16) + byteArray[i + 5].toString(16) + byteArray[i + 4].toString(16));
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

        console.log(path, json);

        var end = path.indexOf(".glb") + 4;
        var start = path.lastIndexOf("/", end) + 1;
        var mainParent = new GameObject(path.slice(start, end));

        var currentNodes = [];
        var texturesCreated = [];
        var outObjects = [];
        var skinsToResolve = [];

        var currentScene = json.scenes[json.scene];
        for (var i = 0; i < currentScene.nodes.length; i++) {
          outObjects = outObjects.concat(AddChildrenRecursive(currentScene.nodes[i]));
        }

        mainParent.addChildren(outObjects);

        if (json.animations) {
          mainParent.animationController = new AnimationController();

          for (var animation of json.animations) {
            var currentChannels = [];

            for (var channel of animation.channels) {
              var sampler = animation.samplers[channel.sampler];

              // var input = getAccessorAndBuffer(sampler.input);
              // var output = getAccessorAndBuffer(sampler.output);

              // var outBuf = output.buffer;
              // if (output.size == 3) {
              //   var outputVectors = [];
              //   for (var k = 0; k < output.buffer.byteLength / 4; k += 3) {
              //     outputVectors.push({
              //       x: output.buffer[k],
              //       y: output.buffer[k + 1],
              //       z: output.buffer[k + 2]
              //     });
              //   }
    
              //   outBuf = outputVectors;
              // }
              // else if (output.size == 4) {
              //   var outputVectors = [];
              //   for (var k = 0; k < output.buffer.byteLength / 4; k += 4) {
              //     outputVectors.push({
              //       x: output.buffer[k],
              //       y: output.buffer[k + 1],
              //       z: output.buffer[k + 2],
              //       w: output.buffer[k + 3]
              //     });
              //   }
    
              //   outBuf = outputVectors;
              // }
    
              // currentChannels.push({
              //   "target": currentNodes[channel.target.node],
              //   "path": channel.target.path,
              //   "interpolation": sampler.interpolation,
              //   "inputBuffer": input.buffer,
              //   "outputBuffer": outBuf
              // });

              var inputAccessor = json.accessors[sampler.input];
              var inputView = json.bufferViews[inputAccessor.bufferView];
              var inputBuffer = buffers[inputView.buffer].slice(inputView.byteOffset, inputView.byteOffset + inputView.byteLength);
              inputBuffer = new typedArrayLookup[inputAccessor.componentType](inputBuffer.buffer);
    
              var outputAccessor = json.accessors[sampler.output];
              var outputView = json.bufferViews[outputAccessor.bufferView];
              var outputBuffer = buffers[outputView.buffer].slice(outputView.byteOffset, outputView.byteOffset + outputView.byteLength);
              outputBuffer = new typedArrayLookup[outputAccessor.componentType](outputBuffer.buffer);
    
              var outBuf = outputBuffer;
              if (outputAccessor.type == "VEC3") {
                var outputVectors = [];
                for (var k = 0; k < outputBuffer.byteLength / 4; k += 3) {
                  outputVectors.push({
                    x: outputBuffer[k],
                    y: outputBuffer[k + 1],
                    z: outputBuffer[k + 2]
                  });
                }
    
                outBuf = outputVectors;
              }
              else if (outputAccessor.type == "VEC4") {
                var outputVectors = [];
                for (var k = 0; k < outputBuffer.byteLength / 4; k += 4) {
                  outputVectors.push({
                    x: outputBuffer[k],
                    y: outputBuffer[k + 1],
                    z: outputBuffer[k + 2],
                    w: outputBuffer[k + 3]
                  });
                }
    
                outBuf = outputVectors;
              }
    
              currentChannels.push({
                "target": currentNodes[channel.target.node],
                "path": channel.target.path,
                "interpolation": sampler.interpolation,
                "inputBuffer": inputBuffer,
                "outputBuffer": outBuf
              });
            }

            var animData = new AnimationData(animation.name, currentChannels);
            mainParent.animationController.animations.push(animData);
          }
        }

        // for (var obj of outObjects) {
        //   addAnimationsToParent(obj, obj);
        // }

        for (var i = 0; i < skinsToResolve.length; i++) {
          var skin = skinsToResolve[i];
          var outJoints = [];
          for (var j = 0; j < skin.joints.length; j++) {
            var match = currentNodes[skin.joints[j]];
            if (match) {
              outJoints[j] = match;
            }
            else {
              console.log("Invalid joint index!");
            }
          }

          var mats = [];
          for (var j = 0; j < skin.obj.meshRenderer.materials.length; j++) {
            var currentMat = skin.obj.meshRenderer.materials[j];
            mats.push(new Material(litSkinned, currentMat.uniforms, currentMat.textures));
          }

          skin.obj.meshRenderer = new SkinnedMeshRenderer(mats, new Skin(outJoints, skin.inverseBindMatrixData), skin.obj.meshRenderer.meshData);
          skin.obj.meshRenderer.skin.parentNode = skin.obj.parent;
        }

        console.timeEnd("LoadGLTF");

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
        currentNodes[nodeIndex] = gameObject;
      
        if (node.mesh != undefined) {
          var mesh = json.meshes[node.mesh];
      
          var materials = [];
          var meshDatas = [];
      
          for (var i = 0; i < mesh.primitives.length; i++) {
            var currentPrimitive = mesh.primitives[i];
            var meshData = {};
            var indexAccessor = json.accessors[currentPrimitive.indices];
            var indexView = json.bufferViews[indexAccessor.bufferView];
            var indexBuffer = new Uint32Array(new Uint16Array(buffers[indexView.buffer].slice(indexView.byteOffset, indexView.byteOffset + indexView.byteLength).buffer));
            meshData.indices = {
              bufferData: indexBuffer,
              target: gl.ELEMENT_ARRAY_BUFFER
            };
      
            var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.POSITION);
            meshData.position = { bufferData: accAndBuffer.buffer, size: accAndBuffer.size };
      
            var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.NORMAL);
            if (accAndBuffer) {
              meshData.normal = { bufferData: accAndBuffer.buffer, size: accAndBuffer.size };
            }
      
            var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.TANGENT);
            if (accAndBuffer) {
              meshData.tangent = { bufferData: accAndBuffer.buffer, size: accAndBuffer.size };
            }
      
            var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.TEXCOORD_0);
            if (accAndBuffer) {
              meshData.uv = { bufferData: accAndBuffer.buffer, size: accAndBuffer.size };
              for (var j = 0; j < meshData.uv.bufferData.byteLength; j += 2) {
                meshData.uv.bufferData[j + 1] = 1 - meshData.uv.bufferData[j + 1];
              }
            }
      
            if (currentPrimitive.attributes.JOINTS_0) {
              var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.JOINTS_0);
              meshData.joints = {
                bufferData: accAndBuffer.buffer,
                size: accAndBuffer.size,
                type: accAndBuffer.type
              };
            }
            if (currentPrimitive.attributes.WEIGHTS_0) {
              var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.WEIGHTS_0);
              meshData.weights = {
                bufferData: accAndBuffer.buffer,
                size: accAndBuffer.size,
                type: accAndBuffer.type
              };
            }
      
            var emissiveFactor = [0, 0, 0];
            var albedoColor = [1, 1, 1, 1];
            var albedoTexture = undefined;
            var normalTexture = undefined;
            var metallicRoughnessTexture = undefined;
            var emissiveTexture = undefined;
            var occlusionTexture = undefined;

            var metallic = 1;
            var roughness = 1;
      
            var materialIndex = currentPrimitive.material;
            if (materialIndex != undefined) {
              var material = json.materials[materialIndex];
              var pbr = material.pbrMetallicRoughness;

              console.log(material);

              if (pbr != undefined) {
                albedoColor = pbr.baseColorFactor ?? [1, 1, 1, 1];

                if (true) {
                  if (pbr.baseColorTexture) {
                    if (texturesCreated[pbr.baseColorTexture.index] == undefined) {
                      albedoTexture = createTexture(pbr.baseColorTexture.index/*, {internalFormat: gl.SRGB8_ALPHA8}*/);
                      texturesCreated[pbr.baseColorTexture.index] = albedoTexture;
                    }
                    else {
                      albedoTexture = texturesCreated[pbr.baseColorTexture.index];
                    }
                  }
                  
                  if (pbr.metallicRoughnessTexture) {
                    if (texturesCreated[pbr.metallicRoughnessTexture.index] == undefined) {
                      metallicRoughnessTexture = createTexture(pbr.metallicRoughnessTexture.index);
                      texturesCreated[pbr.metallicRoughnessTexture.index] = metallicRoughnessTexture;
                    }
                    else {
                      metallicRoughnessTexture = texturesCreated[pbr.metallicRoughnessTexture.index];
                    }
                  }

                  if (material.normalTexture) {
                    if (texturesCreated[material.normalTexture.index] == undefined) {
                      normalTexture = createTexture(material.normalTexture.index);
                      texturesCreated[material.normalTexture.index] = normalTexture;
                    }
                    else {
                      normalTexture = texturesCreated[material.normalTexture.index];
                    }
                  }

                  if (material.emissiveTexture != undefined) {
                    if (texturesCreated[material.emissiveTexture.index] == undefined) {
                      emissiveTexture = createTexture(material.emissiveTexture.index);
                      texturesCreated[material.emissiveTexture.index] = emissiveTexture;
                    }
                    else {
                      emissiveTexture = texturesCreated[material.emissiveTexture.index];
                    }
                  }

                  if (material.occlusionTexture != undefined) {
                    if (texturesCreated[material.occlusionTexture.index] == undefined) {
                      occlusionTexture = createTexture(material.occlusionTexture.index);
                      texturesCreated[material.occlusionTexture.index] = occlusionTexture;
                    }
                    else {
                      occlusionTexture = texturesCreated[material.occlusionTexture.index];
                    }
                  }
                }

                if (material.emissiveFactor != undefined) {
                  emissiveFactor = material.emissiveFactor;
                }
                if (pbr.metallicFactor != undefined) {
                  metallic = pbr.metallicFactor;
                }
                if (pbr.roughnessFactor != undefined) {
                  roughness = pbr.roughnessFactor;
                }
              }
            }

            materials.push(new PBRMaterial({
              albedo: albedoColor,
              emissive: emissiveFactor,
              metallic: metallic,
              roughness: roughness,

              albedoTexture: albedoTexture,
              emissiveTexture: emissiveTexture,
              metallicRoughnessTexture: metallicRoughnessTexture,
              normalTexture: normalTexture
            }));
      
            // materials.push(CreateLitMaterial({
            //   sunDirection,
            //   diffuseCubemap,
            //   specularCubemap,
            //   splitsumTexture
            // },
            // {
            //   albedoColor,
            //   albedoTexture,
            //   normalMap: normalTexture,
            //   metallicRoughnessTexture,
            //   roughness,
            //   metallic,
            //   emissiveFactor,
            //   emissiveTexture,
            //   occlusionTexture
            // }));
            meshDatas.push(new MeshData(meshData));
          }
      
          /*var instMats = [];
          for (var k = 0; k < 10; k++) {
            instMats.push(Matrix.translate({x: 0, y: 40 * k, z: 0}));
          }
      
          gameObject.meshRenderer = new MeshInstanceRenderer(materials, meshDatas, instMats);*/
      
          gameObject.meshRenderer = new MeshRenderer(materials, meshDatas);
        }
      
        if (node.skin != undefined) {
          var skin = json.skins[node.skin];
          var inverseBindMatrixAccessor = json.accessors[skin.inverseBindMatrices];
          var view = json.bufferViews[inverseBindMatrixAccessor.bufferView];
          var buffer = buffers[view.buffer].slice(view.byteOffset, view.byteOffset + view.byteLength);
          var inverseBindMatrixData = new typedArrayLookup[inverseBindMatrixAccessor.componentType](buffer.buffer);
      
          var joints = skin.joints;
      
          skinsToResolve.push({
            obj: gameObject,
            joints,
            inverseBindMatrixData
          });
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
      
      function createTexture(index, settings = {}) {
        return null;

        // console.time("CreateTextureSrc");

        var ind = json.textures[index].source;
        var view = json.bufferViews[json.images[ind].bufferView];
        var buffer = buffers[view.buffer].slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);

        /*var texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE10 + textureIndexOffset);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);*/
      
        var o = "";
        for (var i = 0; i < buffer.length; i += 100000) {
          o += String.fromCharCode.apply(null, buffer.slice(i, i + 100000));
        }
        var src = "data:" + json.images[ind].mimeType + ";base64," + btoa(o);
      
        // console.timeEnd("CreateTextureSrc");
        // console.time("CreateTexture");
        var texture = loadTexture(src, settings);
        // console.timeEnd("CreateTexture");
        return texture;
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
    }

    oReq.send(null);
  });
}