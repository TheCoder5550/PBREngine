import { GameObject } from "./gameObject.mjs";
import Vector from "./vector.mjs";
import Matrix from "./matrix.mjs";
import { PostProcessingSettings } from "./postprocessingSettings.mjs";
import { BloomSettings } from "./bloomSettings.mjs";
import { NewMaterial } from "./material.mjs";

function Scene(name) {
  this.renderer = null;
  this.name = name;
  this.root = new GameObject("root");

  this.sunDirection = Vector.normalize({x: -0.8, y: 1.3, z: -1.2});
  this.sunIntensity = Vector.multiply(new Vector(1, 0.9, 0.85), 10);
  this.skyboxVisible = true;
  this.smoothSkybox = false;
  this.environmentIntensity = 1;
  this.environmentMinLight = 0.25;
  this.ambientColor = [0, 0, 0];
  this.fogDensity = 0.0035;
  this.fogColor = [0.23, 0.24, 0.26, 1];
  this.shadowQuality = 2;

  this.postprocessing = new PostProcessingSettings();
  this.bloom = new BloomSettings();

  var lights = [];

  this.setupUBO = function() {
    // if (this.renderer.renderpipeline instanceof this.renderer.DeferredPBRRenderpipeline) {
    //   return;
    // }

    var uboData = this.renderer.programContainers.lit.uniformBuffers["sharedPerScene"];
    if (uboData) {
      this.sharedUBO = new this.renderer.UniformBuffer(this.renderer.UBOLocationCounter++, uboData.blockSize);

      var gl = this.renderer.gl;
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.sharedUBO.buffer);

      gl.bufferSubData(gl.UNIFORM_BUFFER, uboData.offsets[3], new Float32Array([ this.renderer.shadowCascades.shadowmaps[1].bias ]), 0);
      gl.bufferSubData(gl.UNIFORM_BUFFER, uboData.offsets[3] + 16, new Float32Array([ this.renderer.shadowCascades.shadowmaps[0].bias ]), 0);
    }
  };

  this.updateUniformBuffers = function(projectionMatrix, viewMatrix, inverseViewMatrix) {
    if (this.sharedUBO) {
      var uboData = this.renderer.programContainers.lit.uniformBuffers["sharedPerScene"];
      var gl = this.renderer.gl;
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.sharedUBO.buffer);

      gl.bufferSubData(gl.UNIFORM_BUFFER, uboData.offsets[0], projectionMatrix, 0);
      gl.bufferSubData(gl.UNIFORM_BUFFER, uboData.offsets[1], viewMatrix, 0);
      gl.bufferSubData(gl.UNIFORM_BUFFER, uboData.offsets[2], inverseViewMatrix, 0);
    }
  };

  this.loadEnvironment = async function(settings = {}) {
    if (this.renderer) {
      this.specularCubemap = null;

      var res = settings.res ?? 1024;
      if (settings.hdr) {
        this.skyboxCubemap = await this.renderer.createCubemapFromHDR(settings.hdr, res);
          
        console.warn("No prebaked diffuse map. Generating one...");
        this.diffuseCubemap = await this.renderer.getDiffuseCubemap(this.skyboxCubemap);
      }
      else if (settings.hdrFolder) {
        var hdrFolder = settings.hdrFolder;

        this.skyboxCubemap = await this.renderer.createCubemapFromHDR(hdrFolder + "/skybox.hdr", res);
      
        try {
          // bruh res should be 32
          this.diffuseCubemap = await this.renderer.createCubemapFromHDR(hdrFolder + "/diffuse.hdr", 32/*res*/);
        }
        catch (e) {
          console.warn("No prebaked diffuse map. Generating one...");
          this.diffuseCubemap = await this.renderer.getDiffuseCubemap(this.skyboxCubemap);
        }

        try {
          if (this.renderer.version <= 1) {
            // throw new Error("Version 1 can't use prebaked specular map!");
          }
          this.specularCubemap = await this.renderer.createSpecularCubemapFromHDR(hdrFolder, res);
        }
        catch (e) {
          console.error(e);
          console.warn("No prebaked specular map. Generating one...");
        }
      }
      else if (settings.cubemap) {
        this.skyboxCubemap = settings.cubemap;
        this.diffuseCubemap = await this.renderer.getDiffuseCubemap(this.skyboxCubemap);
      }
      else {
        var program = new this.renderer.ProgramContainer(await this.renderer.createProgramFromFile(this.renderer.path + `assets/shaders/built-in/webgl${this.renderer.version}/procedualSkybox`));
        var mat = new NewMaterial(program);
        this.skyboxCubemap = await this.renderer.createCubemapFromCube(mat, res);
        this.diffuseCubemap = await this.renderer.getDiffuseCubemap(this.skyboxCubemap);
      }

      if (!this.specularCubemap) {
        this.specularCubemap = await this.renderer.getSpecularCubemap(this.skyboxCubemap);
      }

      if (this.smoothSkybox) {
        this.skyboxCubemap = this.diffuseCubemap;
      }

      return true;
    }
    console.error("Add scene to renderer before loading environment");
    return false;
  };

  this.copyEnvironment = function(scene) {
    this.skyboxCubemap = scene.skyboxCubemap;
    this.diffuseCubemap = scene.diffuseCubemap;
    this.specularCubemap = scene.specularCubemap;
  };

  this.add = function(gameObject) {
    if (Array.isArray(gameObject)) {
      return this.root.addChildren(gameObject);
    }
    else {
      return this.root.addChild(gameObject);
    }
  };

  this.remove = function(gameObject) {
    if (Array.isArray(gameObject)) {
      for (var go of gameObject) {
        this.root.removeChild(go);
      }
    }
    else {
      this.root.removeChild(gameObject);
    }
  };

  this.update = function(dt) {
    this.updateLights(); // bruh should probably only be run when a light changes
    this.root.update(dt);
  };

  this.render = function() {
    this.root.render(...arguments);
  };

  this.getLights = function() {
    return lights;
  };

  this.updateLights = function() {
    lights = [];

    this.root.traverseCondition(g => {
      let comps = g.getComponents();
      for (var light of comps) {
        if (light.constructor.name == "Light") {
          lights.push({
            type: light.type,
            position: Matrix.getPosition(g.transform.worldMatrix),
            direction: Matrix.getForward(g.transform.worldMatrix),
            angle: light.angle,
            color: light.color
          });
        }
      }
    }, child => child.active && child.visible);

    // var uboData = this.renderer.programContainers.lit.uniformBuffers["sharedPerScene"];
    // var gl = this.renderer.gl;
    // gl.bindBuffer(gl.UNIFORM_BUFFER, uboData.ubo.buffer);
    // gl.bufferSubData(gl.UNIFORM_BUFFER, uboData.offsets[6], new Float32Array([lights.length]), 0);

    return true;

    // return [
    //   { type: 0, position: new Vector(1, 1, 1.5), color: [100, 1000, 1000] },
    //   { type: 0, position: new Vector(-1, 1, 1.5), color: [1000, 500, 100] }
    // ];
  };

  // this.render = function(camera, overrideMaterial, shadowPass) {
  //   if ((camera.layer ?? 0) == 0) {
  //     // skybox.render(camera);
  //   }

  //   this.root.render(camera, overrideMaterial, shadowPass);
  // }
}

export {
  Scene
};