import Vector from "./vector.js";
import Matrix from "./matrix.js";
import Quaternion from "./quaternion.js";

import { LoadHDR, CreateHDR } from "./HDRReader.js";
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

var ENUMS = {
  RENDERPASS: { SHADOWS: 0b001, OPAQUE: 0b010, ALPHA: 0b100 },
  LIGHT: { POINT: 0, SPOT: 1 }
};

// bruh load shaders as javascript with import

// bruh make lit shader template

// bruh use drawingBufferWidth instead of canvas.width
// bruh resize every frame if width doesnt match clientWidth

// bruh make setter for every uniform in material

// bruh only bind override material once when rendering shadowmap

// bruh skin shadows

function Renderer() {
  var renderer = this;
  var gl;
  var time = 0;
  var lastUpdate;

  this.eventHandler = new EventHandler();

  this.mouse = {x: 0, y: 0, left: false, right: false, middle: false, movement: {x: 0, y: 0}};
  var keys = [];
  var keysDown = [];
  var keysUp = [];

  this.currentScene = 0;
  this.scenes = [];

  this.godrays = null;
  this.postprocessing = null;
  this.bloom = null;
  this.skybox = null;
  this.shadowCascades = null;

  var materialTextureUnitOffset = 3;
  var diffuseCubemapUnit = 2;
  var specularCubemapUnit = 1;
  var splitsumUnit = 0;

  // var blankTexture;

  this.litContainer = null;
  this.litInstancedContainer = null;
  this.particleContainer = null;
  this.unlitInstancedContainer = null;
  this.litSkinnedContainer = null;
  this.litBillboardContainer = null;
  this.trailLitContainer = null;

  // var _loadedPrograms = {};
  // Object.defineProperty(this, 'lit', {
  //   get: function() {
  //     var name = "lit";
  //     if (!_loadedPrograms[name]) {
  //       _loadedPrograms[name] = await loadLitProgram(path);
  //     }
      
  //     return _loadedPrograms[name];
  //   }
  // });

  var currentProgram = null;
  var currentClearColor;

  var errorEnums;

  var _settings = {
    enableShadows: true,
    enableBloom: true,
    enablePostProcessing: true,
    loadTextures: true
  };

  this.settings = {
    get enableShadows() { return _settings.enableShadows },
    set enableShadows(val) {
      _settings.enableShadows = val;
      if (!val) {
        renderer.shadowCascades.clearShadowmaps();
      }
    },

    get enableBloom() { return _settings.enableBloom },
    set enableBloom(val) {
      _settings.enableBloom = val;
      if (!val) {
        renderer.bloom.clearBloom();
      }
    },
    
    get enablePostProcessing() { return _settings.enablePostProcessing },
    set enablePostProcessing(val) { _settings.enablePostProcessing = val },

    get loadTextures() { return _settings.loadTextures },
    set loadTextures(val) { _settings.loadTextures = val },
  };

  this.setupSettings = null;

  // Stats
  var drawCalls = 0;

  /*

    Public methods

  */

  this.setup = async function(settings = {}) {
    this.setupSettings = settings;
    this.path = settings.path ?? "./";

    this.canvas = settings.canvas ?? document.body.appendChild(document.createElement("canvas"));
    setCanvasSize();

    this.version = settings.version ?? 2;
    if (!(this.version === 1 || this.version === 2)) {
      throw new Error("Invalid WebGL version: " + this.version);
    }

    var webglString = "webgl" + (this.version == 2 ? "2" : "");
    var webglSettings = {
      antialias: true,
      premultipliedAlpha: false
      // alpha: false
    };

    gl = this.gl = this.canvas.getContext(webglString, webglSettings);
    if (!this.gl) {
      if (this.version == 2) {
        this.eventHandler.fireEvent("fallbackVersion");
        this.version = 1;
        gl = this.gl = this.canvas.getContext("webgl", webglSettings);

        if (!this.gl) {
          this.eventHandler.fireEvent("error");
          throw new Error("WebGL " + this.version + " is not supported!");
        }
      }
      else {
        this.eventHandler.fireEvent("error");
        throw new Error("WebGL " + this.version + " is not supported!");
      }
    }

    console.log("Webgl version " + this.version + " loaded!");

    var logDrawCall = function() {
      drawCalls++;
    }

    extendFunction(gl, "drawElements", logDrawCall);
    extendFunction(gl, "drawArrays", logDrawCall);
    extendFunction(gl, "drawElementsInstanced", logDrawCall);
    extendFunction(gl, "drawArraysInstanced", logDrawCall);

    function extendFunction(parent, func, extFunc) {
      var oldF = parent[func];
      parent[func] = extendF;
      function extendF() {
        oldF.call(parent, ...arguments);
        extFunc(...arguments);
      }
      
      return oldF;
    }

    this.canvas.addEventListener("webglcontextlost", e => {
      console.error("WebGL context lost!");
      this.eventHandler.fireEvent("contextlost");
    });

    this.canvas.addEventListener("mousedown", e => {
      this.mouse[["left", "middle", "right"][e.button]] = true;
      this.eventHandler.fireEvent("mousedown", e);
    });

    document.addEventListener("mouseup", e => {
      this.mouse[["left", "middle", "right"][e.button]] = false;
      this.eventHandler.fireEvent("mouseup", e);
    });

    this.canvas.onmousemove = (e) => {
      var pos = getMousePos(this.canvas, e);
      this.mouse.x = pos.x;
      this.mouse.y = pos.y;
      this.mouse.movement.x = e.movementX;
      this.mouse.movement.y = e.movementY;

      this.eventHandler.fireEvent("mousemove", e);
    }

    document.addEventListener("keydown", e => {
      keys[e.keyCode] = true;
      keys[e.code] = true;
      this.eventHandler.fireEvent("keydown", e);
    });

    document.addEventListener("keyup", e => {
      keys[e.keyCode] = false;
      keys[e.code] = false;
      this.eventHandler.fireEvent("keyup", e);
    });

    window.addEventListener("resize", () => {
      setCanvasSize();
      if (this.postprocessing) this.postprocessing.resizeFramebuffers();
      if (this.bloom) this.bloom.resizeFramebuffers();

      this.eventHandler.fireEvent("resize");
    });

    errorEnums = {};
    errorEnums[gl.NO_ERROR] = "No error";
    errorEnums[gl.INVALID_ENUM] = "Invalid enum";
    errorEnums[gl.INVALID_VALUE] = "Invalid value";
    errorEnums[gl.INVALID_OPERATION] = "Invalid operation";
    errorEnums[gl.INVALID_FRAMEBUFFER_OPERATION] = "Invalid framebuffer operation";
    errorEnums[gl.OUT_OF_MEMORY] = "Out of memory";
    errorEnums[gl.CONTEXT_LOST_WEBGL] = "Context lost webgl";

    this.indexTypeLookup = {
      "5121": gl.UNSIGNED_BYTE,
      "5123": gl.UNSIGNED_SHORT,
      "5125": gl.UNSIGNED_INT,
    };

    if (gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) < 32) {
      console.warn("Max texture units: ", gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS));
    }

    if (this.version == 2) {
      this.getExtension("OES_texture_float_linear");
      this.getExtension("EXT_color_buffer_float");
      this.getExtension("EXT_float_blend");
      this.floatTextures = true;
    }
    else if (this.version == 1) {
      this.getExtension('OES_element_index_uint');
      this.getExtension('OES_standard_derivatives');
      this.getExtension("EXT_shader_texture_lod");

      this.floatTextures = this.getExtension("OES_texture_float");
      this.floatTextures = this.floatTextures && this.getExtension("WEBGL_color_buffer_float");
      this.getExtension("OES_texture_float_linear");
      this.getExtension("EXT_float_blend");

      this.colorBufferHalfFloatExt = this.getExtension('EXT_color_buffer_half_float');
      this.textureHalfFloatExt = this.getExtension("OES_texture_half_float");

      this.getExtension('WEBGL_depth_texture');
      this.sRGBExt = this.getExtension('EXT_sRGB');
      this.VAOExt = this.getExtension('OES_vertex_array_object');
      this.instanceExt = this.getExtension("ANGLE_instanced_arrays");
    }

    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.cullFace(this.gl.BACK);
    // this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    clearColor(...(settings.clearColor ?? [0, 0, 0, 1]));

    // this.blankTexture = blankTexture = this.gl.createTexture();
    // this.gl.bindTexture(this.gl.TEXTURE_2D, blankTexture);
    // this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array([255, 25, 255, 255]));

    gl.getError(); // Clear errors

    var shadowProgram = await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/shadow`);
    this.shadowCascades = new ShadowCascades(shadowProgram,
      settings.shadowSizes ?? [4, 16],
      settings.shadowBiases ?? [-0.0003, -0.0005],
      settings.shadowResolution ?? 1024
    );
    logGLError("Shadow cascades");

    // this.floatTextures = false;

    var postprocessingProgram = await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/postprocessing`);
    this.postprocessing = new PostProcessing(postprocessingProgram);
    logGLError("Post processing");

    var bloomProgram = await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/bloom`);
    this.bloom = new Bloom(bloomProgram);
    logGLError("Bloom");

    if (settings.enableGodrays) {
      var godrayProgram = new ProgramContainer(await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/godrays`));
      this.godrays = new Godrays(godrayProgram);
    }

    var skyboxProgram = await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/skybox`);
    this.skybox = new Skybox(skyboxProgram);
    logGLError("Skybox");

    console.log("Loading programs...");
    if (!settings.disableLit) {
      var lit = await loadLitProgram(this.path);
      this.litContainer = new ProgramContainer(lit);
    }

    if (!settings.disableLitInstanced) {
      var litInstanced = await loadLitInstancedProgram(this.path);
      this.litInstancedContainer = new ProgramContainer(litInstanced);
    }

    if (!settings.disableParticleProgram) {
      var particleProgram = await loadParticleProgram(this.path);
      this.particleContainer = new ProgramContainer(particleProgram);
    }

    if (!settings.disableUnlitInstanced) {
      var unlitInstanced = await loadUnlitInstancedProgram(this.path);
      this.unlitInstancedContainer = new ProgramContainer(unlitInstanced);
    }

    if (!settings.disableLitSkinned) {
      var litSkinned = await loadLitSkinnedProgram(this.path);
      this.litSkinnedContainer = new ProgramContainer(litSkinned);
    }

    if (!settings.disableLitBillboard) {
      var litBillboard = await loadLitBillboardProgram(this.path);
      this.litBillboardContainer = new ProgramContainer(litBillboard);
    }

    if (!settings.disableTrailLit) {
      var trailProgram = await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/trail`);
      this.trailLitContainer = new ProgramContainer(trailProgram);
    }
    
    logGLError("Programs");

    console.log("PBR Skybox programs");
    this.equirectangularToCubemapProgram = await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/equirectangularToCubemap`);
    this.diffuseCubemapProgram = await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/cubemapConvolution`);
    this.specularCubemapProgram = await this.createProgramFromFile(this.path + `assets/shaders/built-in/webgl${this.version}/prefilterCubemap`);
    
    this.equirectangularToCubemapProgramContainer = new ProgramContainer(this.equirectangularToCubemapProgram);
    this.diffuseCubemapProgramContainer = new ProgramContainer(this.diffuseCubemapProgram);
    this.specularCubemapProgramContainer = new ProgramContainer(this.specularCubemapProgram);

    logGLError("PBR Skybox programs");

    this.splitsumTexture = this.loadSplitsum(this.path + "assets/pbr/splitsum.png");

    // gl.activeTexture(gl.TEXTURE0 + splitsumUnit);
    // gl.bindTexture(gl.TEXTURE_2D, this.splitsumTexture);

    logGLError("Missed error");

    lastUpdate = performance.now();
    requestAnimationFrame(loop);
  }

  function loop() {
    var ft = getFrameTime();
    time += ft;

    drawCalls = 0;

    renderer.eventHandler.fireEvent("renderloop", ft, time);

    document.querySelector("#debug_drawCalls").innerText = drawCalls;

    requestAnimationFrame(loop);
  }

  function getFrameTime() {
    var now = performance.now();
    var frameTime = (now - lastUpdate) / 1000;
    lastUpdate = now;
  
    return frameTime;
  }

  function setCanvasSize() {
    var settings = renderer.setupSettings;
    
    var renderScale = settings.renderScale ?? 1;
    var devicePixelRatio = renderScale * (window.devicePixelRatio || 1);

    renderer.canvas.width = (settings.width ?? innerWidth) * devicePixelRatio;
    renderer.canvas.height = (settings.height ?? innerHeight) * devicePixelRatio;
    renderer.canvas.style.width = (settings.width ?? innerWidth) + "px";
    renderer.canvas.style.height = (settings.height ?? innerHeight) + "px";
  }

  this.render = function(camera, secondaryCameras) {
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // var scene = this.scenes[this.currentScene];
    // if (scene.skyboxVisible) {
    //   this.skybox.render(camera, scene.skyboxCubemap);
    // }

    // gl.activeTexture(gl.TEXTURE0 + diffuseCubemapUnit);
    // gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.diffuseCubemap);

    // gl.activeTexture(gl.TEXTURE0 + specularCubemapUnit);
    // gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.specularCubemap);

    // gl.activeTexture(gl.TEXTURE0 + splitsumUnit);
    // gl.bindTexture(gl.TEXTURE_2D, this.splitsumTexture);

    // // bruh, magic?
    // gl.colorMask(true, true, true, false);

    // gl.disable(gl.BLEND);
    // scene.render(camera, { renderPass: ENUMS.RENDERPASS.OPAQUE });

    // gl.enable(gl.BLEND);
    // gl.depthMask(false);
    // scene.render(camera, { renderPass: ENUMS.RENDERPASS.ALPHA });
    // gl.depthMask(true);

    // bindVertexArray(null);

    // gl.colorMask(true, true, true, true);

    // return;













    var scene = this.scenes[this.currentScene];

    if (this.shadowCascades && _settings.enableShadows && (scene.sunIntensity.x != 0 || scene.sunIntensity.y != 0 || scene.sunIntensity.z != 0)) {
      this.shadowCascades.renderShadowmaps(camera.transform.position);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.postprocessing && _settings.enablePostProcessing ? this.postprocessing.framebuffer : null);
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (scene.skyboxVisible) {
      this.skybox.render(camera, scene.skyboxCubemap);
    }

    // bruh lit sometimes has unused sampler2D (ex occlusionTexture)
    //      with default location 0 so TEXTURE0 must be TEXTURE_2D
    //      (what about unused sampler2D and samplerCube?)

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this.blankTexture);
    // gl.bindTexture(gl.TEXTURE_2D, null);
    // gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

    gl.activeTexture(gl.TEXTURE0 + diffuseCubemapUnit);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.diffuseCubemap);

    gl.activeTexture(gl.TEXTURE0 + specularCubemapUnit);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.specularCubemap);

    gl.activeTexture(gl.TEXTURE0 + splitsumUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.splitsumTexture);

    // bruh, magic?
    gl.colorMask(true, true, true, false);

    gl.disable(gl.BLEND);
    scene.render(camera, { renderPass: ENUMS.RENDERPASS.OPAQUE });

    gl.enable(gl.BLEND);
    gl.depthMask(false);
    scene.render(camera, { renderPass: ENUMS.RENDERPASS.ALPHA });
    gl.depthMask(true);

    if (secondaryCameras) {
      for (var cam of secondaryCameras) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        // bruh args
        scene.render(cam);
      }
    }

    gl.colorMask(true, true, true, true);

    if (this.godrays) {
      this.godrays.render(scene, camera);
    }

    bindVertexArray(null);

    if (this.bloom && _settings.enableBloom) this.bloom.render();
    if (this.postprocessing && _settings.enablePostProcessing) this.postprocessing.render();
  }

  Object.defineProperty(this, 'aspect', {
    get: function() {
      return gl.canvas.clientWidth / gl.canvas.clientHeight;
    }
  });

  this.add = function(scene) {
    this.scenes.push(scene);
    scene.renderer = this;
    return scene;
  }

  this.on = function(event, func) {
    this.eventHandler.addEvent(event, func);
  }

  /*

    Canvas helper
  
  */

  this.disableContextMenu = function() {
    renderer.canvas.addEventListener('contextmenu', function(e) {
      e.preventDefault();
    });
  }

  this.disablePinchToZoom = function() {
    document.addEventListener('touchmove', function(event) {
      if (event.scale !== 1) {
          event.preventDefault();
      }
    }, { passive: false });
  }

  this.isPointerLocked = function() {
    return document.pointerLockElement === this.canvas || document.mozPointerLockElement === this.canvas;
  }

  this.lockPointer = function() {
    this.canvas.requestPointerLock = this.canvas.requestPointerLock || this.canvas.mozRequestPointerLock;
    this.canvas.requestPointerLock();
  }

  this.unlockPointer = function() {
    document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;
    document.exitPointerLock();
  }

  this.getKey = function(key) {
    return !!keys[key];
  }

  this.getKeyDown = function(key) {
    if (this.getKey(key)) {
      if (keysDown[key]) {
        keysDown[key] = false;
        return true;
      }
    }
    else {
      keysDown[key] = true;
    }

    return false;
  }

  this.getKeyUp = function(key) {
    if (!this.getKey(key)) {
      if (keysUp[key]) {
        keysUp[key] = false;
        return true;
      }
    }
    else {
      keysUp[key] = true;
    }

    return false;
  }

  /*
  
    PBR environment
  
  */

  this.createCubemapFromHDR = async function(path, res = 1024) {
    var hdr = await LoadHDR(path);

    var pixelData = hdr.data;
    if (!this.floatTextures) {
      if (renderer.textureHalfFloatExt) {
        pixelData = Float32ToFloat16(pixelData);
      }
      else {
        var exposure = 2;
        pixelData = new Uint8Array(hdr.data.length);
        for (var i = 0; i < hdr.data.length; i++) {
          pixelData[i] = Math.min(255, Math.pow(hdr.data[i] / (hdr.data[i] + 1) * exposure, 1 / 2.2) * 255);
        }
      }
    }
  
    var hdrTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, hdrTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.version == 1 ? gl.RGB : gl.RGB32F, hdr.width, hdr.height, 0, gl.RGB, getFloatTextureType(), pixelData);
  
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
    var hdrCubeMat = new Material(this.equirectangularToCubemapProgramContainer, {
      "equirectangularMap": {type: "1i", name: "equirectangularMap", texture: true, arguments: [0]}
    }, [{type: gl.TEXTURE_2D, texture: hdrTexture}]);
    hdrCubeMat.doubleSided = true;
  
    var hdrCube = new GameObject("Cubemap", {
      meshRenderer: new MeshRenderer([hdrCubeMat], [new MeshData(getCubeData())]),
      castShadows: false
    });
  
    var perspectiveMatrix = Matrix.orthographic({size: 1});//Matrix.perspective({fov: 45 * Math.PI / 180, aspect: canvas.width / canvas.height, near: 0.001, far: 100});
    var views = [
      Matrix.identity(),
      Matrix.inverse(Matrix.transform([["ry", Math.PI]])),
      Matrix.inverse(Matrix.transform([["ry", Math.PI / 2], ["rx", -Math.PI / 2]])),
      Matrix.inverse(Matrix.transform([["ry", Math.PI / 2], ["rx", Math.PI / 2]])),
      Matrix.inverse(Matrix.transform([["ry", Math.PI / 2]])),
      Matrix.inverse(Matrix.transform([["ry", -Math.PI / 2]]))
    ];

    // Framebuffer
    var framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  
    // Depth buffer
    const depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, res, res);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  
    // Cubemap
    var cubemap = gl.createTexture();
    // gl.activeTexture(textureLocation);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
  
    for (var i = 0; i < 6; i++) {
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, this.version == 1 ? gl.RGBA : gl.RGBA32F, res, res, 0, gl.RGBA, getFloatTextureType(), null);
    }
  
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (gl.TEXTURE_WRAP_R) {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    }
  
    // Viewport
    gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, res, res);
  
    for (var i = 0; i < 6; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cubemap, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      hdrCube.render({
        projectionMatrix: perspectiveMatrix,
        viewMatrix: views[i],
        inverseViewMatrix: Matrix.inverse(views[i])
      });
    }

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

    gl.enable(gl.CULL_FACE);
  
    return cubemap;
  }
  
  this.getSpecularCubemap = async function(cubemap, res = 128) {
    // bruh
    if (!renderer.floatTextures && !renderer.textureHalfFloatExt) {
      return cubemap;
    }
  
    var mat = new Material(this.specularCubemapProgramContainer, {
      "environmentMap": {type: "1i", name: "environmentMap", texture: true, arguments: [0]},
      "roughness": {type: "1f", name: "roughness", arguments: [0]}
    }, [{type: gl.TEXTURE_CUBE_MAP, texture: cubemap}]);
    mat.doubleSided = true;
  
    var cube = new GameObject("Cubemap", {
      meshRenderer: new MeshRenderer([mat], [new MeshData(getCubeData())]),
      castShadows: false
    });
  
    var perspectiveMatrix = Matrix.orthographic({size: 1});//Matrix.perspective({fov: 45 * Math.PI / 180, aspect: canvas.width / canvas.height, near: 0.001, far: 100});
    var views = [
      Matrix.inverse(Matrix.transform([["ry", -Math.PI / 2], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["ry",  Math.PI / 2], ["rz", Math.PI]])),

      Matrix.inverse(Matrix.transform([["rx", Math.PI / 2]])),
      Matrix.inverse(Matrix.transform([["rx", -Math.PI / 2]])),

      Matrix.inverse(Matrix.transform([["ry", Math.PI], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["rz", Math.PI]])),
    ];
    // var views = [
    //   Matrix.identity(),
    //   Matrix.inverse(Matrix.transform([["ry", Math.PI]])),
    //   Matrix.inverse(Matrix.transform([["ry", Math.PI / 2], ["rx", -Math.PI / 2]])),
    //   Matrix.inverse(Matrix.transform([["ry", Math.PI / 2], ["rx", Math.PI / 2]])),
    //   Matrix.inverse(Matrix.transform([["ry", Math.PI / 2]])),
    //   Matrix.inverse(Matrix.transform([["ry", -Math.PI / 2]]))
    // ];

    var framebuffer;
    var depthBuffer;
    var framebuffers = [];
  
    if (this.version != 1) {
      framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    
      depthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, res, res);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    }

    // Cubemap
    var newCubemap = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);

    for (var i = 0; i < 6; i++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, this.version == 1 ? gl.RGBA : gl.RGBA16F, res, res, 0, gl.RGBA, getFloatTextureType(), null);
    }
  
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (gl.TEXTURE_WRAP_R) {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    }
  
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  
    // Viewport
    gl.disable(gl.CULL_FACE);
  
    var maxMipLevels = 5;
    for (var mip = 0; mip < maxMipLevels; mip++) {
      var currentRes = res * Math.pow(0.5, mip);

      if (this.version == 1) {
        framebuffers.push(createFramebuffer(currentRes, currentRes));
      }
      else {
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, currentRes, currentRes);
      }

      gl.viewport(0, 0, currentRes, currentRes);
  
      var roughness = mip / (maxMipLevels - 1);
      mat.setUniform("roughness", roughness);
      // mat.uniforms.find((u) => u.name == "roughness").arguments[0] = roughness;
  
      for (var i = 0; i < 6; i++) {
        if (this.version != 1) {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, newCubemap, mip);
        }
        
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
        var viewMatrix = views[i];
        cube.render({
          projectionMatrix: perspectiveMatrix,
          viewMatrix: viewMatrix,
          inverseViewMatrix: Matrix.inverse(viewMatrix)
        });

        if (this.version == 1) {
          gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);
          gl.copyTexSubImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, mip, 0, 0, 0, 0, currentRes, currentRes);
        }

        // await sleep(50);
      }
    }

    for (var framebufferData of framebuffers) {
      gl.deleteFramebuffer(framebufferData.framebuffer);
    }

    gl.enable(gl.CULL_FACE);
  
    return newCubemap;
  }
  
  this.getDiffuseCubemap = async function(cubemap) {
    var res = 32;
  
    var mat = new Material(this.diffuseCubemapProgramContainer, {
      "environmentMap": {type: "1i", name: "environmentMap", texture: true, arguments: [0]}
    }, [{type: gl.TEXTURE_CUBE_MAP, texture: cubemap}]);
  
    return await this.createCubemapFromCube(mat, res);
  }
  
  this.createCubemapFromCube = async function(mat, res) {
    mat.doubleSided = true;
    var cube = new GameObject("Cubemap", {
      meshRenderer: new MeshRenderer([mat], [new MeshData(getCubeData())]),
      castShadows: false
    });
  
    var perspectiveMatrix = Matrix.orthographic({size: 1});
    var views = [
      Matrix.inverse(Matrix.transform([["ry", -Math.PI / 2], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["ry",  Math.PI / 2], ["rz", Math.PI]])),

      Matrix.inverse(Matrix.transform([["rx", Math.PI / 2]])),
      Matrix.inverse(Matrix.transform([["rx", -Math.PI / 2]])),

      Matrix.inverse(Matrix.transform([["ry", Math.PI], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["rz", Math.PI]])),
    ];
    // var views = [
    //   Matrix.identity(),
    //   Matrix.inverse(Matrix.transform([["ry", Math.PI]])),
    //   Matrix.inverse(Matrix.transform([["ry", Math.PI / 2], ["rx", -Math.PI / 2]])),
    //   Matrix.inverse(Matrix.transform([["ry", Math.PI / 2], ["rx", Math.PI / 2]])),
    //   Matrix.inverse(Matrix.transform([["ry", Math.PI / 2]])),
    //   Matrix.inverse(Matrix.transform([["ry", -Math.PI / 2]]))
    // ];
  
    // Framebuffer
    var framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  
    // Depth buffer
    const depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, res, res);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  
    // Cubemap
    var newCubemap = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);
  
    for (var i = 0; i < 6; i++) {
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, this.version == 1 ? gl.RGBA : gl.RGBA32F, res, res, 0, gl.RGBA, getFloatTextureType(), null);
    }
  
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (gl.TEXTURE_WRAP_R) {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    }
  
    // Viewport
    gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, res, res);
  
    for (var i = 0; i < 6; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, newCubemap, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
      cube.render({
        projectionMatrix: perspectiveMatrix,
        viewMatrix: views[i],
        inverseViewMatrix: Matrix.inverse(views[i])
      });

      await sleep(200);
    }

    gl.enable(gl.CULL_FACE);
  
    return newCubemap;
  }

  this.captureReflectionCubemap = function(position = Vector.zero(), res = 512) {
    var projectionMatrix = Matrix.perspective({fov: Math.PI / 4, aspect: 1, near: 0.001, far: 100});//Matrix.orthographic({size: 1});
    var views = [
      Matrix.inverse(Matrix.transform([["translate", position], ["ry", -Math.PI / 2], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["translate", position], ["ry",  Math.PI / 2], ["rz", Math.PI]])),

      Matrix.inverse(Matrix.transform([["translate", position], ["rx", Math.PI / 2]])),
      Matrix.inverse(Matrix.transform([["translate", position], ["rx", -Math.PI / 2]])),

      Matrix.inverse(Matrix.transform([["translate", position], ["ry", Math.PI], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["translate", position], ["rz", Math.PI]])),
    ];
  
    // Framebuffer
    var framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  
    // Depth buffer
    const depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, res, res);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  
    // Cubemap
    var newCubemap = gl.createTexture();
    // bruh
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);
  
    for (var i = 0; i < 6; i++) {
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA32F, res, res, 0, gl.RGBA, getFloatTextureType(), null);
    }
  
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (gl.TEXTURE_WRAP_R) {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    }
  
    // Viewport
    gl.viewport(0, 0, res, res);
  
    for (var i = 0; i < 6; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, newCubemap, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var camera = {
        projectionMatrix: projectionMatrix,
        viewMatrix: views[i],
        inverseViewMatrix: Matrix.inverse(views[i]),
        cameraMatrix: Matrix.inverse(views[i])
      };

      var scene = this.scenes[this.currentScene];

      if (scene.skyboxVisible) {
        this.skybox.render(camera, scene.skyboxCubemap);
      }

      gl.activeTexture(gl.TEXTURE0 + diffuseCubemapUnit);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.diffuseCubemap);

      gl.activeTexture(gl.TEXTURE0 + specularCubemapUnit);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.specularCubemap);

      gl.activeTexture(gl.TEXTURE0 + splitsumUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.splitsumTexture);

      gl.colorMask(true, true, true, false);

      gl.disable(gl.BLEND);
      scene.render(camera, { renderPass: ENUMS.RENDERPASS.OPAQUE });

      gl.enable(gl.BLEND);
      gl.depthMask(false);
      scene.render(camera, { renderPass: ENUMS.RENDERPASS.ALPHA });
      gl.depthMask(true);

      gl.colorMask(true, true, true, true);

      bindVertexArray(null);
    }
  
    return newCubemap;
  }

  this.saveCubemapAsHDR = async function(cubemap, res = 512) {
    var w = res;
    var h = res / 2;

    var framebufferData = createFramebuffer(w, h);

    var program = await this.createProgramFromFile(this.path + "assets/shaders/built-in/webgl2/equirectangularFromCubemap");

    var vertices = new Float32Array([
      -1.0,  1.0, // top left
      -1.0, -1.0, // bottom left
      1.0,  1.0, // top right
      1.0, -1.0, // bottom right
    ]);
    var vertexBuffer = createBuffer(vertices);
    var vertexLocation = gl.getAttribLocation(program, "position");

    var uvs = new Float32Array([
      0, 0,
      0, 1,
      1, 0,
      1, 1
    ]);
    var uvBuffer = createBuffer(uvs);
    var uvLocation = gl.getAttribLocation(program, "uv");

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferData.framebuffer);
    gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, w, h);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    useProgram(program);

    bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.enableVertexAttribArray(vertexLocation);
    gl.vertexAttribPointer(vertexLocation, 2, gl.FLOAT, false, 8, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 8, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
    gl.uniform1i(gl.getUniformLocation(program, "cubemap"), 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    var pixels = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);

    CreateHDR(pixels, w, h, "cubemap");

    return true;
  }

  this.saveCubemapAsImages = async function(cubemap, res = 512) {
    var mat = new Material(new ProgramContainer(await this.createProgramFromFile("../assets/shaders/built-in/webgl2/cubemapVis")), [
      {type: "1i", name: "environmentMap", arguments: [0]}
    ], [{type: gl.TEXTURE_CUBE_MAP, texture: cubemap}]);
    mat.doubleSided = true;
  
    var cube = new GameObject("Cubemap", {
      meshRenderer: new MeshRenderer([mat], [new MeshData(getCubeData())]),
      castShadows: false
    });
  
    var perspectiveMatrix = Matrix.orthographic({size: 1});
    var views = [
      Matrix.inverse(Matrix.transform([["ry", -Math.PI / 2], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["ry",  Math.PI / 2], ["rz", Math.PI]])),

      Matrix.inverse(Matrix.transform([["rx", Math.PI / 2]])),
      Matrix.inverse(Matrix.transform([["rx", -Math.PI / 2]])),

      Matrix.inverse(Matrix.transform([["ry", Math.PI], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["rz", Math.PI]])),
    ];
  
    // Viewport
    var oldWidth = this.canvas.width;
    var oldHeight = this.canvas.height;

    this.canvas.width = res;
    this.canvas.height = res;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, res, res);
  
    for (var i = 0; i < 6; i++) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      cube.render({
        projectionMatrix: perspectiveMatrix,
        viewMatrix: views[i],
        inverseViewMatrix: Matrix.inverse(views[i])
      });
      saveCanvasAsImage(renderer.canvas, "cubemap" + i);
    }

    gl.enable(gl.CULL_FACE);

    this.canvas.width = oldWidth;
    this.canvas.height = oldHeight;

    return true;
  }

  this.loadSplitsum = function(url) {
    return loadTexture(url, {
      TEXTURE_MIN_FILTER: gl.LINEAR,
      TEXTURE_WRAP_S: gl.CLAMP_TO_EDGE,
      TEXTURE_WRAP_T: gl.CLAMP_TO_EDGE
    });
  }

  /*
  
    Shaders
  
  */

  async function loadLitProgram(path) {
    console.log("Lit");
    // await this.createProgramFromFile(`./assets/shaders/built-in/webgl${this.version}/lit/vertex.glsl`, `./assets/shaders/built-in/webgl${this.version}/lit/fragmentMobile.glsl`);
    return await await renderer.createProgramFromFile(path + `assets/shaders/built-in/webgl${renderer.version}/lit`);
  }

  async function loadLitInstancedProgram(path) {
    console.log("Lit instanced");

    var vertexSource = await renderer.loadTextFile(path + `assets/shaders/built-in/webgl${renderer.version}/lit/vertexInstanced.glsl`);
    var fragmentSource = await renderer.loadTextFile(path + `assets/shaders/built-in/webgl${renderer.version}/lit/fragment.glsl`);

    fragmentSource = fragmentSource.replaceAll("modelMatrix", "vModelMatrix");
    if (renderer.version == 1) {
      fragmentSource = fragmentSource.replaceAll("uniform mat4 vModelMatrix", "varying mat4 vModelMatrix");
    }
    else if (renderer.version == 2) {
      fragmentSource = fragmentSource.replaceAll("uniform mat4 vModelMatrix", "in mat4 vModelMatrix");
    }

    return renderer.createProgram(vertexSource, fragmentSource);
  }

  async function loadUnlitInstancedProgram(path) {
    console.log("Unlit instanced");

    var vertexSource = await renderer.loadTextFile(path + `assets/shaders/built-in/webgl${renderer.version}/lit/vertexInstanced.glsl`);
    var fragmentSource = await renderer.loadTextFile(path + `assets/shaders/built-in/webgl${renderer.version}/unlit/fragment.glsl`);

    fragmentSource = fragmentSource.replaceAll("modelMatrix", "vModelMatrix");
    if (renderer.version == 1) {
      fragmentSource = fragmentSource.replaceAll("uniform mat4 vModelMatrix", "varying mat4 vModelMatrix");
    }
    else if (renderer.version == 2) {
      fragmentSource = fragmentSource.replaceAll("uniform mat4 vModelMatrix", "in mat4 vModelMatrix");
    }

    return renderer.createProgram(vertexSource, fragmentSource);
  }

  async function loadParticleProgram(path) {
    console.log("Particle - Unlit instanced");
    var vertexSource = await renderer.loadTextFile(path + `assets/shaders/built-in/webgl${renderer.version}/particleSystem/vertexInstanced.glsl`);
    var fragmentSource = await renderer.loadTextFile(path + `assets/shaders/built-in/webgl${renderer.version}/particleSystem/fragment.glsl`);

    return renderer.createProgram(vertexSource, fragmentSource);
  }

  async function loadLitSkinnedProgram(path) {
    console.log("Lit skinned");
    return await renderer.createProgramFromFile(path + `assets/shaders/built-in/webgl${renderer.version}/lit/vertexSkinned.glsl`, path + `assets/shaders/built-in/webgl${renderer.version}/lit/fragment.glsl`);
  }

  async function loadLitBillboardProgram(path) {
    console.log("Lit billboard");
    return await renderer.createProgramFromFile(path + `assets/shaders/built-in/webgl${renderer.version}/lit/vertexBillboard.glsl`, path + `assets/shaders/built-in/webgl${renderer.version}/lit/fragment.glsl`);
  }

  this.loadTextFile = async function(path) {
    return await (await fetch(path)).text();
  }

  this.createProgramFromFile = async function(shaderPath, fragmentPathOpt) {
    var vertexPath = shaderPath + "/vertex.glsl";
    var fragmentPath = shaderPath + "/fragment.glsl";
    if (fragmentPathOpt != undefined) {
      vertexPath = shaderPath;
      fragmentPath = fragmentPathOpt;
    }
  
    var vertexSource = await this.loadTextFile(vertexPath);
    var fragmentSource = await this.loadTextFile(fragmentPath);

    return this.createProgram(vertexSource, fragmentSource);
  }

  this.createProgram = function(vertexSource, fragmentSource) {
    var vertexShader = compileShader(vertexSource, gl.VERTEX_SHADER);
    var fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);
  
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
  
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var errorMessage = '\nCould not compile WebGL program\n\nLink failed: ' + gl.getProgramInfoLog(program);

      var vertexError = gl.getShaderInfoLog(vertexShader);
      var fragmentError = gl.getShaderInfoLog(fragmentShader);

      if (vertexError) {
        errorMessage += "\nVertex:\n" + vertexError;
      }

      if (fragmentError) {
        errorMessage += "\nFragment:\n" + fragmentError;
      }

      console.log({vertexSource, fragmentSource});
      throw new Error(errorMessage);
    }
    else {
      useProgram(program);
    }
  
    return program;
  }
  
  function compileShader(shaderSource, shaderType) {
    var shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
  
    return shader;
  }

  /*
  
    GL helper
  
  */

  this.enableCulling = function() {
    this.gl.enable(this.gl.CULL_FACE);
  }

  this.disableCulling = function() {
    this.gl.disable(this.gl.CULL_FACE);
  }

  this.getExtension = function(name) {
    var e = this.gl.getExtension(name);
    if (!e) {
      console.error("Could not get extension: " + name);
      return false;
    }
    return e;
  }

  function getFloatTextureType() {
    if (renderer.floatTextures) {
      return gl.FLOAT;
    }

    if (renderer.textureHalfFloatExt) {
      return renderer.textureHalfFloatExt.HALF_FLOAT_OES;
    }

    return gl.UNSIGNED_BYTE;
  }

  function createFramebuffer(currentWidth, currentHeight) {
    var framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    var colorBuffer = gl.createTexture();
    // gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorBuffer);
    gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, currentWidth, currentHeight, 0, gl.RGBA, getFloatTextureType(), null);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorBuffer, 0);

    var depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, currentWidth, currentHeight);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

    return {
      framebuffer,
      colorBuffer,
      depthBuffer,
      width: currentWidth,
      height: currentHeight
    };
  }

  function createBuffer(data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) {
    var buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, usage);
    return buffer;
  }

  function useProgram(program) {
    if (program !== currentProgram) {
      gl.useProgram(program);
      currentProgram = program;
      return true;
    }

    return false;
  }

  function clearColor(r, g, b, a) {
    currentClearColor = [r, g, b, a];
    gl.clearColor(r, g, b, a);
  }

  function getUniformSetType(type) {
    if (type == "FLOAT") {
      return "1f";
    }

    var m = type.match(/FLOAT_VEC([0-9])/);
    if (m) {
      return m[1] + "f";
    }

    if (type == "INT" || type == "UNSIGNED_INT" || type == "BOOL" || type.indexOf("SAMPLER") !== -1) {
      return "1i";
    }

    var m = type.match(/(?:INT|BOOL)_VEC([0-9])/);
    if (m) {
      return m[1] + "i";
    }

    var m = type.match(/FLOAT_MAT([0-9]x?[0-9]?)/);
    if (m) {
      return "Matrix" + m[1] + "fv";
    }

    throw new Error("Invalid uniform type string: " + type);
  }

  var storedEnums = {};
  function glEnumToString(value) {
    var e = storedEnums[value];
    if (e) {
      return e;
    }

    for (const key in gl) {
      if (gl[key] === value) {
        storedEnums[value] = key;
        return key;
      }
    }

    return "";
  }

  /*

    Version helpers

  */

  function createVertexArray() {
    if (renderer.version == 1) {
      return renderer.VAOExt.createVertexArrayOES();
    }
    else if (renderer.version == 2) {
      return gl.createVertexArray();
    }
  }

  function deleteVertexArray(vao) {
    if (renderer.version == 1) {
      return renderer.VAOExt.deleteVertexArrayOES(vao);
    }
    else {
      return gl.deleteVertexArray(vao);
    }
  }

  function bindVertexArray(vao) {
    if (renderer.version == 1) {
      renderer.VAOExt.bindVertexArrayOES(vao);
    }
    else if (renderer.version == 2) {
      gl.bindVertexArray(vao);
    }
  }

  function vertexAttribDivisor(location, divisor) {
    if (renderer.version == 1) {
      renderer.instanceExt.vertexAttribDivisorANGLE(location, divisor);
    }
    else if (renderer.version == 2) {
      gl.vertexAttribDivisor(location, divisor);
    }
  }

  function drawElementsInstanced(mode, count, type, offset, instanceCount) {
    if (renderer.version == 1) {
      renderer.instanceExt.drawElementsInstancedANGLE(mode, count, type, offset, instanceCount);
    }
    else if (renderer.version == 2) {
      gl.drawElementsInstanced(mode, count, type, offset, instanceCount);
    }
  }

  /*

    Error checking

  */

  function assertProgram(program) {
    if (!(program instanceof WebGLProgram)) {
      console.error("Not a program:", program);
    }
  }

  this.logGLError = logGLError;
  function logGLError(label = "", logNoError = false) {
    var error = gl.getError();
    if (logNoError) {
      console[error ? "error" : "log"]("(" + label + ") " + errorEnums[error]);
    }
    else if (error !== 0) {
      console.error("(" + label + ") " + errorEnums[error]);
    }
  }

  /* 
  
    Components

  */

  this.TrailRenderer = TrailRenderer;
  function TrailRenderer() {
    this.gameObject = null;

    var identity = Matrix.identity();

    this.emit = true;
    this.emitPosition = null;
    this.width = 0.1;
    this.maxVertices = 500;
    this.minDistance = 0.05;
    
    var positions = [];
    var uvOffset = 0;

    var vertices = new Float32Array(this.maxVertices * 2 * 3);
    var normals = new Float32Array(this.maxVertices * 2 * 3);
    var uvs = new Float32Array(this.maxVertices * 2 * 2);
    var alphas = new Float32Array(this.maxVertices * 2 * 1);

    for (var i = 0; i < normals.length; i += 3) {
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    }

    this.meshData = new MeshData({
      position: {
        bufferData: vertices,
        size: 3
      },
      normal: {
        bufferData: normals,
        size: 3
      },
      uv: {
        bufferData: uvs,
        size: 2
      },
      alpha: {
        bufferData: alphas,
        size: 1
      }
    });
    this.material = CreateLitMaterial({metallic: 1, albedoColor: [0.003, 0.003, 0.003, 1], albedoTexture: loadTexture(renderer.path + "assets/textures/skidmarksSoft.png")}, renderer.trailLitContainer);
    this.material.setUniform("opaque", 0);
    this.material.setUniform("alphaCutoff", 0);

    this.drawMode = gl.TRIANGLE_STRIP;

    this.attribLocations = this.meshData.getAttribLocations(this.material.program);

    var meshRenderer = new MeshRenderer(this.material, this.meshData);
    meshRenderer.drawMode = gl.TRIANGLE_STRIP;

    this.update = function(dt) {
      var newPos = this.emitPosition ? Vector.copy(this.emitPosition) : Matrix.getPosition(this.gameObject.transform.worldMatrix);

      // if (this.emit) {
        var distSqr = positions.length == 0 ? 0 : Vector.distanceSqr(positions[positions.length - 1].position, newPos);
        if (positions.length == 0 || distSqr > this.minDistance * this.minDistance) {
          positions.push({
            position: newPos,
            alpha: this.emit
          });
          uvOffset += Math.sqrt(distSqr);
        }
      // }

      if (positions.length > this.maxVertices) {
        positions.shift();
      }

      if (positions.length >= 2) {
        var dist = 0;
        for (var i = positions.length - 1; i >= 0; i--) {
          var pos = positions[i].position;

          var diff = Vector.subtract(pos, positions[i - 1 < 0 ? i + 1 : i - 1].position);
          var diffLen = Vector.length(diff);
          var tangent = Vector.divide(diff, diffLen);

          var normal = new Vector(-tangent.z * this.width, tangent.y * this.width, tangent.x * this.width);

          var j = positions.length - 1 - i;
          vertices[j * 6] = pos.x + normal.x;
          vertices[j * 6 + 1] = pos.y + normal.y;
          vertices[j * 6 + 2] = pos.z + normal.z;

          vertices[j * 6 + 3] = pos.x - normal.x;
          vertices[j * 6 + 4] = pos.y - normal.y;
          vertices[j * 6 + 5] = pos.z - normal.z;

          uvs[j * 4] = uvOffset - dist;
          uvs[j * 4 + 1] = 1;
          uvs[j * 4 + 2] = uvOffset - dist;
          uvs[j * 4 + 3] = 0;

          var alpha = clamp(positions[i].alpha, 0, 1);
          alphas[j * 2] = alpha;
          alphas[j * 2 + 1] = alpha;

          dist += diffLen;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshData.buffers[0].buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshData.buffers[2].buffer);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshData.buffers[3].buffer);
        gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW);
      }
    }

    this.render = function(camera, matrix, shadowPass = false, opaquePass = true) {
      // if (!opaquePass) {
      //   var md = this.meshData;
      //   var mat = this.material;

      //   useProgram(mat.program);
      //   md.bindBuffers(mat.program, this.attribLocations);
        
      //   mat.bindModelMatrixUniform(identity);
      //   mat.bindUniforms(camera);

      //   gl.drawArrays(this.drawMode, 0, positions.length * 2);
      // }

      if (!shadowPass) {
        meshRenderer.render(camera, identity, shadowPass, opaquePass);
      }
    }
  }

  this.ParticleSystem = ParticleSystem;
  function ParticleSystem(md, maxParticles = 200) {
    var system = this;

    this.maxParticles = maxParticles;

    this.drawMode = gl.TRIANGLES;
    this.material = CreateLitMaterial({
      albedoTexture: loadTexture("./assets/textures/bulletTrail.png"),
      albedoColor: [40, 10, 5, 1],
    }, renderer.particleContainer);
    // this.material = CreateLitMaterial({albedoTexture: loadTexture("./assets/textures/snowParticle.png"), albedoColor: [2, 2, 2, 1]/*[40, 10, 5, 1]*/}, renderer.unlitInstanced);
    this.meshData = md ?? getParticleMeshData();

    this.particles = new Array(this.maxParticles);
    for (var i = 0; i < this.particles.length; i++) {
      this.particles[i] = new Particle(Vector.zero());
    }
    var pool = [];

    this.matrixData = new Float32Array(this.maxParticles * 16);
    for (var i = 0; i < this.maxParticles; i++) {
      this.matrixData.set(this.particles[i].matrix, i * 16);
    }

    this.colorData = new Float32Array(this.maxParticles * 4);
    var d = new Float32Array(1, 0, 0, 1);
    for (var i = 0; i < this.maxParticles * 4; i++) {
      this.colorData[i] = 1;
    }

    this.matrixBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.matrixData, gl.DYNAMIC_DRAW);

    this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.colorData, gl.DYNAMIC_DRAW);

    var cameraPos;

    this.emitHealth = 0.5;
    this.emitPosition = () => Vector.zero();
    this.emitVelocity = () => Vector.zero();

    this.emit = function(amount = 1) {
      for (var i = 0; i < amount; i++) {
        if (pool.length > 0) {
          var p = pool.shift();
          p.active = true;
          p.health = p.maxHealth = this.emitHealth;
          p.position = Vector.copy(system.emitPosition());
          p.velocity = Vector.copy(system.emitVelocity());
        }
        else {
          break;
        }
      }
    }

    this.update = function(dt) {
      for (var particle of this.particles) {
        particle.update(dt);
      }

      for (var i = 0; i < this.maxParticles; i++) {
        var p = this.particles[i];
        if (p.active) {
          this.matrixData.set(p.getMatrix(), i * 16);
          this.colorData[i * 4 + 3] = p.getAlpha();
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.matrixData, gl.DYNAMIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.colorData, gl.DYNAMIC_DRAW);
    }

    this.render = function(camera, baseMatrix, shadowPass = false, opaquePass = true) {
      if (!opaquePass) {
        cameraPos = Matrix.getPosition(camera.cameraMatrix); // Bruh

        useProgram(this.material.program);
        this.meshData.bindBuffers(this.material.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
        const matrixLoc = gl.getAttribLocation(this.material.program, 'modelMatrix'); //Bruh
        for (var j = 0; j < 4; j++) {
          const loc = matrixLoc + j;
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 4 * 16, j * 16);
          vertexAttribDivisor(loc, 1);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        const loc = gl.getAttribLocation(this.material.program, 'color'); //Bruh
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
        vertexAttribDivisor(loc, 1);

        this.material.bindUniforms(camera);

        drawElementsInstanced(this.drawMode, this.meshData.indices.length, this.meshData.indexType, 0, this.maxParticles);
      }
    }

    function Particle(position) {
      this.position = position;
      this.matrix = Matrix.translate(this.position);
      this.velocity = Vector.zero();
      // this.size = Vector.multiply(new Vector(0.5, 2, 0.5), Math.random() * 0.7 + 0.3);
      this.size = new Vector(0.6 * (Math.random() * 0.8 + 0.2), 0.15 * (Math.random() * 0.4 + 0.6), 1);
      this.health = 0.5;
      this.maxHealth = 0.5;

      this.active = true;
      
      this.getAlpha = function() {
        return clamp(Math.exp(-3 * (1 - this.health / this.maxHealth)) - 0.1, 0, 1);
      }

      this.getMatrix = function() {
        if (cameraPos) {
          var dir = Vector.normalize(this.velocity);
          var lookDir = Vector.projectOnPlane(Vector.subtract(cameraPos, this.position), dir);

          Matrix.lookAt(this.position, Vector.add(this.position, lookDir), dir, this.matrix);
          Matrix.transform([["scale", this.size]], this.matrix);
        }

        return this.matrix;
      }

      this.update = function(dt) {
        if (this.active) {
          // Wind
          // var wind = new Vector((Math.random() - 0.3) * 3, 0, (Math.random() - 0.3) * 3);
          // this.velocity = Vector.add(this.velocity, Vector.multiply(wind, dt));

          this.velocity.x += (Math.random() - 0.45) * 10 * dt;
          this.velocity.z += (Math.random() - 0.45) * 10 * dt;

          //Drag
          // var drag = Vector.negate(Vector.compMultiply(this.velocity, Vector.applyFunc(this.velocity, Math.abs)));
          // this.velocity = Vector.add(this.velocity, Vector.multiply(drag, dt));

          this.velocity.x -= Math.abs(this.velocity.x) * this.velocity.x * dt;
          this.velocity.y -= Math.abs(this.velocity.y) * this.velocity.y * dt;
          this.velocity.z -= Math.abs(this.velocity.z) * this.velocity.z * dt;

          // Gravity
          // this.velocity = Vector.add(this.velocity, Vector.multiply(new Vector(0, -9.82, 0), dt));
          this.velocity.y -= 9.82 * dt;

          // Integrate
          // this.position = Vector.add(this.position, Vector.multiply(this.velocity, dt));
          this.position.x += this.velocity.x * dt;
          this.position.y += this.velocity.y * dt;
          this.position.z += this.velocity.z * dt;

          // Reset
          this.health -= dt;
          if (this.health <= 0) {
            this.active = false;
            pool.push(this);
          }
        }
      }
    }
  }

  /*

    Classes

  */

  function EventHandler() {
    this.events = {};

    this.addEvent = function(name, func) {
      if (typeof func != "function") {
        throw new Error("[EventHandler]: Not a function");
      }

      if (this.events[name]) {
        this.events[name].functions.push(func);
      }
      else {
        this.events[name] = {
          functions: [ func ]
        };
      }
    }

    this.fireEvent = function(name, ...args) {
      if (this.events[name]) {
        for (var func of this.events[name].functions) {
          func(...args);
        }
        return true;
      }

      return false;
    }
  }

  function PostProcessing(program) {
    assertProgram(program);

    this.program = program;
    this.exposure = 0;
    this.gamma = 2.2;

    this.colorBuffers = [];
  
    const targetTextureWidth = gl.canvas.width;
    const targetTextureHeight = gl.canvas.height;

    // Framebuffer
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
  
    // Color buffers
    for (var i = 0; i < 1; i++) {
      this.colorBuffers[i] = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.colorBuffers[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, targetTextureWidth, targetTextureHeight, 0, gl.RGBA, getFloatTextureType(), null);
    
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, this.colorBuffers[i], 0);
    }

    // // Low quality depth info
    // this.depthTexture = gl.createTexture();
    // gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    // gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, targetTextureWidth, targetTextureHeight, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
    // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture, 0);

    // Required for z sorting (better quality than above)
    var depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, targetTextureWidth, targetTextureHeight);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  
    // Screen quad
    var vertices = new Float32Array([
      -1.0,  1.0, // top left
      -1.0, -1.0, // bottom left
      1.0,  1.0, // top right
      1.0, -1.0, // bottom right
    ]);
    this.vertexBuffer = createBuffer(vertices);
  
    this.vertexLocation = gl.getAttribLocation(this.program, "position");

    // bruh, use program container
    this.SIZELocation = gl.getUniformLocation(this.program, "SIZE");
    this.mainTextureLocation = gl.getUniformLocation(this.program, "mainTexture");
    this.bloomTextureLocation = gl.getUniformLocation(this.program, "bloomTexture");
    this.depthTextureLocation = gl.getUniformLocation(this.program, "depthTexture");
    this.exposureLocation = gl.getUniformLocation(this.program, "exposure");
    this.gammaLocation = gl.getUniformLocation(this.program, "gamma");
    this.godraysLocation = gl.getUniformLocation(this.program, "enableGodrays");
  
    this.resizeFramebuffers = function() {
      gl.bindTexture(gl.TEXTURE_2D, this.colorBuffers[0]);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, getFloatTextureType(), null);

      if (this.depthTexture) {
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, gl.canvas.width, gl.canvas.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      }
      else {
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, gl.canvas.width, gl.canvas.height);
      }

      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  
    this.render = function() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
      useProgram(this.program);
  
      bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.vertexLocation);
      gl.vertexAttribPointer(this.vertexLocation, 2, gl.FLOAT, false, 8, 0);
  
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.colorBuffers[0]);
      gl.uniform1i(this.mainTextureLocation, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, renderer.bloom.upsampleFramebuffers[renderer.bloom.upsampleFramebuffers.length - 1].colorBuffer);
      gl.uniform1i(this.bloomTextureLocation, 1);

      if (this.depthTexture) {
        gl.uniform1i(this.godraysLocation, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.uniform1i(this.depthTextureLocation, 2);
      }
      else if (renderer.godrays) {
        gl.uniform1i(this.godraysLocation, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, renderer.godrays.framebufferData.colorBuffer);
        gl.uniform1i(this.depthTextureLocation, 2);
      }
      else {
        gl.uniform1i(this.godraysLocation, 0);
      }
  
      gl.uniform2f(this.SIZELocation, gl.canvas.width, gl.canvas.height);

      gl.uniform1f(this.exposureLocation, this.exposure);
      gl.uniform1f(this.gammaLocation, this.gamma);
  
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  function Bloom(program) {
    assertProgram(program);
    this.program = program;

    var downsamples = 7;
    this.sampleScale = 1;
    this.threshold = 1;

    this.downsampleFramebuffers = [];
    this.upsampleFramebuffers = [];

    var positionLocation = gl.getAttribLocation(this.program, "position");
    var locationNames = ["screenSize", "mainTexture", "mainTextureSize", "secondTexture", "stage", "_SampleScale", "threshold"];
    var locations = {};

    for (var i = 0; i < locationNames.length; i++) {
      var name = locationNames[i];
      locations[name] = gl.getUniformLocation(this.program, name);
    }

    // Screen quad
    var vertices = new Float32Array([
      -1.0,  1.0,
      -1.0, -1.0,
      1.0,  1.0,
      1.0, -1.0,
    ]);
    var vertexBuffer = createBuffer(vertices);

    for (var i = 0; i < downsamples; i++) {
      var scale = Math.pow(0.5, i + 1);
      this.downsampleFramebuffers.push(createFramebuffer(Math.floor(gl.canvas.width * scale), Math.floor(gl.canvas.height * scale)));
    }

    for (var i = 0; i < downsamples - 1; i++) {
      var scale = Math.pow(0.5, downsamples - 1 - i);
      this.upsampleFramebuffers.push(createFramebuffer(Math.floor(gl.canvas.width * scale), Math.floor(gl.canvas.height * scale)));
    }

    this.resizeFramebuffers = function() {
      for (var i = 0; i < this.downsampleFramebuffers.length; i++) {
        gl.deleteFramebuffer(this.downsampleFramebuffers[i].framebuffer);
      }
      for (var i = 0; i < this.upsampleFramebuffers.length; i++) {
        gl.deleteFramebuffer(this.upsampleFramebuffers[i].framebuffer);
      }

      this.downsampleFramebuffers = [];
      this.upsampleFramebuffers = [];

      for (var i = 0; i < downsamples; i++) {
        var scale = Math.pow(0.5, i + 1);
        this.downsampleFramebuffers.push(createFramebuffer(Math.floor(gl.canvas.width * scale), Math.floor(gl.canvas.height * scale)));
      }
  
      for (var i = 0; i < downsamples - 1; i++) {
        var scale = Math.pow(0.5, downsamples - 1 - i);
        this.upsampleFramebuffers.push(createFramebuffer(Math.floor(gl.canvas.width * scale), Math.floor(gl.canvas.height * scale)));
      }
    }

    this.render = function() {
      useProgram(this.program);

      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 8, 0);

      gl.uniform1i(locations["mainTexture"], 0);
      gl.uniform1i(locations["secondTexture"], 1);
      
      gl.uniform1f(locations["_SampleScale"], this.sampleScale);
      gl.uniform1f(locations["threshold"], this.threshold);

      for (var i = 0; i < this.downsampleFramebuffers.length; i++) {
        var framebuffer = this.downsampleFramebuffers[i];

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
        gl.viewport(0, 0, framebuffer.width, framebuffer.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, i < 1 ? renderer.postprocessing.colorBuffers[0] : this.downsampleFramebuffers[i - 1].colorBuffer);

        if (locations["mainTextureSize"]) {
          gl.uniform2fv(locations["mainTextureSize"], i < 1 ? [gl.canvas.width, gl.canvas.height] : [this.downsampleFramebuffers[i - 1].width, this.downsampleFramebuffers[i - 1].height]);
        }
        gl.uniform2f(locations["screenSize"], framebuffer.width, framebuffer.height);
        gl.uniform1i(locations["stage"], i == 0 ? 0 : 1);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      gl.uniform1i(locations["stage"], 2);

      for (var i = 0; i < this.upsampleFramebuffers.length; i++) {
        var framebuffer = this.upsampleFramebuffers[i];

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
        gl.viewport(0, 0, framebuffer.width, framebuffer.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, i < 1 ? this.downsampleFramebuffers[this.downsampleFramebuffers.length - 1].colorBuffer : this.upsampleFramebuffers[i - 1].colorBuffer);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.downsampleFramebuffers[this.downsampleFramebuffers.length - 2 - i].colorBuffer);

        if (locations["mainTextureSize"]) {
          var fbd = i < 1 ? this.downsampleFramebuffers[this.downsampleFramebuffers.length - 1] : this.upsampleFramebuffers[i - 1];
          gl.uniform2f(locations["mainTextureSize"], fbd.width, fbd.height);
        }
        gl.uniform2f(locations["screenSize"], framebuffer.width, framebuffer.height);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    this.clearBloom = function() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.upsampleFramebuffers[this.upsampleFramebuffers.length - 1].framebuffer);

      var lastClearColor = currentClearColor;
      clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      clearColor(...lastClearColor);
    }
  }

  function Godrays(programContainer) {
    this.material = new Material(programContainer);

    var scale = 0.2;
    this.framebufferData = createFramebuffer(gl.canvas.width * scale, gl.canvas.height * scale);

    // Required for z sorting (better quality than above)
    var depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, gl.canvas.width * scale, gl.canvas.height * scale);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

    this.render = function(scene, camera) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferData.framebuffer);
      gl.viewport(0, 0, this.framebufferData.width, this.framebufferData.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      scene.render(camera, {
        renderPass: ENUMS.RENDERPASS.OPAQUE,
        materialOverride: this.material
      });

      renderer.skybox.render(camera, scene.skyboxCubemap);
    }
  }

  function ShadowCascades(program, levelSizes = [50, 8], levelBiases = [-0.0025, -0.0005], res = 1024) {
    levelSizes.reverse();
    levelBiases.reverse();

    this.levels = levelSizes.length;
    assertProgram(program);
    this.program = program;
    this.material = new Material(new ProgramContainer(this.program));

    this.shadowmaps = [];
    for (var i = 0; i < this.levels; i++) {
      var shadowmap = new Shadowmap(res, levelSizes[i], levelBiases[i], [gl["TEXTURE" + (30 - i * 2)], gl["TEXTURE" + (31 - i * 2)]]);
      this.shadowmaps.push(shadowmap);
    }

    this.clearShadowmaps = function() {
      for (var i = 0; i < this.levels; i++) {
        var shadowmap = this.shadowmaps[i];
        shadowmap.clearShadowmap();
      }
    }

    this.renderShadowmaps = function(cameraPosition) {
      for (var i = 0; i < this.levels; i++) {
        var shadowmap = this.shadowmaps[i];
        shadowmap.updateModelMatrix(cameraPosition);
        shadowmap.bind();

        // bruh
        var scene = renderer.scenes[renderer.currentScene];
        scene.render({
          projectionMatrix: shadowmap.shadowPerspeciveMatrix,
          viewMatrix: shadowmap.shadowViewMatrix,
          inverseViewMatrix: shadowmap.shadowInverseViewMatrix
        }, {
          materialOverride: this.material,
          renderPass: ENUMS.RENDERPASS.SHADOWS
        });
      }

      // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    this.setUniforms = function(material) {
      if (material.getUniformLocation(`textureMatrices[0]`) != null) {
        for (var i = 0; i < this.levels; i++) {
          var textureMatrix = this.getTextureMatrix(1 - i);
          if (textureMatrix) {
            gl.uniformMatrix4fv(material.getUniformLocation(`textureMatrices[${i}]`), false, textureMatrix);
          }
          gl.uniform1i(material.getUniformLocation(`projectedTextures[${i}]`), this.getTextureNumber(1 - i));
          gl.uniform1f(material.getUniformLocation(`biases[${i}]`), this.getShadowBias(1 - i));
        }
      }
    }

    this.getTextureMatrix = function(index) {
      return this.shadowmaps[index].textureMatrix;
    }

    this.getShadowBias = function(index) {
      return this.shadowmaps[index].bias;
    }

    this.getTextureNumber = function(index) {
      return 30 - index * 2;
    }
  }

  function Shadowmap(res = 512, shadowRange = 20, bias = -0.006, textureNumbers = [gl.TEXTURE31, gl.TEXTURE30]) {
    this.bias = bias;
    this.textureNumbers = textureNumbers;

    this.shadowPerspeciveMatrix = Matrix.orthographic({size: shadowRange, near: 1, far: 300});
    this.shadowModelMatrix = Matrix.identity();
    this.shadowViewMatrix = Matrix.identity();
    this.shadowInverseViewMatrix = Matrix.identity();
    this.textureMatrix = Matrix.identity();
    this.textureMatrixBase = Matrix.transform([
      ["translate", {x: 0.5, y: 0.5, z: 0.5}],
      ["scale", Vector.fill(0.5)]
    ]);

    this.depthTexture = gl.createTexture();
    this.depthTextureSize = res;
    gl.activeTexture(textureNumbers[0]);
    // gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    gl.texImage2D(
        gl.TEXTURE_2D,      // target
        0,                  // mip level
        renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, // internal format
        this.depthTextureSize,   // width
        this.depthTextureSize,   // height
        0,                  // border
        gl.DEPTH_COMPONENT, // format
        gl.UNSIGNED_INT,    // type
        null);              // data
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    this.depthFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFramebuffer);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,       // target
        gl.DEPTH_ATTACHMENT,  // attachment point
        gl.TEXTURE_2D,        // texture target
        this.depthTexture,         // texture
        0);                   // mip level

    // create a color texture of the same size as the depth texture
    /*const unusedTexture = gl.createTexture();
    gl.activeTexture(textureNumbers[1]);
    gl.bindTexture(gl.TEXTURE_2D, unusedTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.depthTextureSize, this.depthTextureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // attach it to the framebuffer
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,        // target
        gl.COLOR_ATTACHMENT0,  // attachment point
        gl.TEXTURE_2D,         // texture target
        unusedTexture,         // texture
        0);                    // mip level*/

    this.updateModelMatrix = function(pos) {
      // Bruh
      var scene = renderer.scenes[renderer.currentScene];

      // var n = shadowRange / res * 50;
      // pos = new Vector(
      //   roundNearest(pos.x, n),
      //   roundNearest(pos.y, n),
      //   roundNearest(pos.z, n)
      // );

      Matrix.lookAt(pos, Vector.subtract(pos, scene.sunDirection), {x: 0, y: 1, z: 0}, this.shadowModelMatrix);
      Matrix.transform([
        ["translate", {z: 100}]
      ], this.shadowModelMatrix);
      
      Matrix.inverse(this.shadowModelMatrix, this.shadowViewMatrix);
      Matrix.copy(this.shadowModelMatrix, this.shadowInverseViewMatrix);

      Matrix.copy(this.textureMatrixBase, this.textureMatrix);
      Matrix.multiply(this.textureMatrix, this.shadowPerspeciveMatrix, this.textureMatrix);
      Matrix.multiply(this.textureMatrix, this.shadowViewMatrix, this.textureMatrix);
    }

    this.bind = function() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFramebuffer);
      gl.viewport(0, 0, this.depthTextureSize, this.depthTextureSize);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    
    this.clearShadowmap = function() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFramebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    this.createFrustum = async function() {
      this.frustum = new Object3D(getLineCubeData());
      this.frustum.setProgram(new ProgramContainer(await renderer.createProgramFromFile("./assets/shaders/solidColor")));
    }

    this.drawFrustum = function() {
      gl.disable(gl.DEPTH_TEST);
      this.frustum.bind();
      gl.uniformMatrix4fv(getUniformLocation(this.frustum.program, "projectionMatrix"), false, perspectiveMatrix);
      gl.uniformMatrix4fv(getUniformLocation(this.frustum.program, "viewMatrix"), false, viewMatrix);
      this.frustum.draw(Matrix.multiply(this.shadowModelMatrix, Matrix.inverse(this.shadowPerspeciveMatrix)), gl.LINES);
      gl.enable(gl.DEPTH_TEST);
    }
  }

  // bruh single color when looking at specific angle on mobile
  function Skybox(program) {
    assertProgram(program);
    this.program = program;

    this.meshData = new MeshData({
      position: {
        bufferData: new Float32Array([
          -1, -1,
          1, -1,
          -1,  1,
          -1,  1,
          1, -1,
          1,  1
        ]),
        size: 2
      }
    });
  
    this.uniformLocations = {
      viewDirectionProjectionInverse: gl.getUniformLocation(this.program, "viewDirectionProjectionInverse"),
      environmentIntensity: gl.getUniformLocation(this.program, "environmentIntensity"),
      skybox: gl.getUniformLocation(this.program, "skybox")
    };

    var matrix = Matrix.identity();
  
    this.render = function(camera, cubemap) {
      useProgram(this.program);
      this.meshData.bindBuffers(this.program);

      Matrix.copy(camera.viewMatrix, matrix);
      Matrix.removeTranslation(matrix);
      Matrix.multiply(camera.projectionMatrix, matrix, matrix);
      Matrix.inverse(matrix, matrix);

      // bruh
      var scene = renderer.scenes[renderer.currentScene];
      gl.uniform1f(this.uniformLocations.environmentIntensity, scene.environmentIntensity);
      gl.uniformMatrix4fv(this.uniformLocations.viewDirectionProjectionInverse, false, matrix);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
      gl.uniform1i(this.uniformLocations.skybox, 0);
  
      gl.depthFunc(gl.LEQUAL);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  /*

    Materials
  
  */

  this.ProgramContainer = ProgramContainer;
  function ProgramContainer(program) {
    var _this = this;
    var _program;
    this.activeUniforms = {};

    Object.defineProperty(this, "program", {
      get: function() {
        return _program;
      },
      set: function(program) {
        _this.setProgram(program);
      }
    })

    this.setProgram = function(program) {
      assertProgram(program);
      _program = program;
      this.updateUniformLocations();
    }

    this.updateUniformLocations = function() {
      var nrUniforms = gl.getProgramParameter(_program, gl.ACTIVE_UNIFORMS);

      for (var i = 0; i < nrUniforms; i++) {
        var uniform = gl.getActiveUniform(_program, i);
        var location = gl.getUniformLocation(_program, uniform.name);

        this.activeUniforms[uniform.name] = {
          location,
          size: uniform.size,
          type: uniform.type,
          typeString: glEnumToString(uniform.type)
        };
      }
    }

    this.setProgram(program);
  }

  this.CreateLitMaterial = CreateLitMaterial;
  function CreateLitMaterial(settings = {}, programContainer = renderer.litContainer) {
    var uniforms = {
      "useTexture": {type: "1i", name: "useTexture", arguments: [settings.albedoTexture == undefined ? 0 : 1]},
      "useNormalMap": {type: "1i", name: "useNormalMap", arguments: [settings.normalMap == undefined ? 0 : 1]},
      "useMetallicRoughnessTexture": {type: "1i", name: "useMetallicRoughnessTexture", arguments: [settings.metallicRoughnessTexture == undefined ? 0 : 1]},
      "useEmissiveTexture": {type: "1i", name: "useEmissiveTexture", arguments: [settings.emissiveTexture == undefined ? 0 : 1]},
      "useOcclusionTexture": {type: "1i", name: "useOcclusionTexture", arguments: [settings.occlusionTexture == undefined ? 0 : 1]},
  
      "albedo": {type: "4f", name: "albedo", arguments: settings.albedoColor ?? [1, 1, 1, 1]},
      "metallic": {type: "1f", name: "metallic", arguments: [settings.metallic ?? 0]},
      "roughness": {type: "1f", name: "roughness", arguments: [settings.roughness ?? 1]},
      "emissiveFactor": {type: "3f", name: "emissiveFactor", arguments: settings.emissiveFactor ?? [0, 0, 0]},
  
      "alphaCutoff": {type: "1f", name: "alphaCutoff", arguments: [settings.alphaCutoff ?? 0]},
      "opaque": {type: "1i", name: "opaque", arguments: [settings.opaque ?? 1]},

      "doNoTiling": {type: "1i", name: "doNoTiling", arguments: [0]},

      "u_diffuseIBL": {type: "1i", name: "u_diffuseIBL", texture: true, arguments: [diffuseCubemapUnit - materialTextureUnitOffset]},
      "u_specularIBL": {type: "1i", name: "u_specularIBL", texture: true, arguments: [specularCubemapUnit - materialTextureUnitOffset]},
      "u_splitSum": {type: "1i", name: "u_splitSum", texture: true, arguments: [splitsumUnit - materialTextureUnitOffset]}
    };
  
    var textures = [];
    if (settings.albedoTexture != undefined) {
      textures.push({type: gl.TEXTURE_2D, texture: settings.albedoTexture});
      uniforms["albedoTexture"] = {type: "1i", name: "albedoTexture", texture: true, arguments: [textures.length - 1]};
    }
    if (settings.normalMap != undefined) {
      textures.push({type: gl.TEXTURE_2D, texture: settings.normalMap});
      uniforms["normalTexture"] = {type: "1i", name: "normalTexture", texture: true, arguments: [textures.length - 1]};
    }
    if (settings.metallicRoughnessTexture != undefined) {
      textures.push({type: gl.TEXTURE_2D, texture: settings.metallicRoughnessTexture});
      uniforms["metallicRoughnessTexture"] = {type: "1i", name: "metallicRoughnessTexture", texture: true, arguments: [textures.length - 1]};
    }
    if (settings.emissiveTexture != undefined) {
      textures.push({type: gl.TEXTURE_2D, texture: settings.emissiveTexture});
      uniforms["emissiveTexture"] = {type: "1i", name: "emissiveTexture", texture: true, arguments: [textures.length - 1]};
    }
    if (settings.occlusionTexture != undefined) {
      textures.push({type: gl.TEXTURE_2D, texture: settings.occlusionTexture});
      uniforms["occlusionTexture"] = {type: "1i", name: "occlusionTexture", texture: true, arguments: [textures.length - 1]};
    }
  
    return new Material(programContainer, uniforms, textures);
  }

  this.Material = Material;
  function Material(programContainer, uniforms = {}, textures = []) {
    var _this = this;

    if (!(programContainer instanceof ProgramContainer)) {
      throw new Error("Not a program container: " + programContainer);
    }
    this.programContainer = programContainer;

    this.name = "No name";
    this.doubleSided = false;
    this.doubleSidedShadows = true;
    this.opaque = true;

    this.uniforms = uniforms;
    this.textures = textures;

    if (Array.isArray(this.uniforms)) {
      throw new Error("Uniforms is array!");
    }
  
    this.copy = function() {
      // bruh not copy
      var m = new Material(this.programContainer, JSON.parse(JSON.stringify(this.uniforms)), this.textures);
      m.doubleSided = this.doubleSided;
      m.opaque = this.opaque;
      return m;
    }

    this.isOpaque = function() {
      if (this.getUniform("opaque")) {
        return this.getUniform("opaque").arguments[0] != 0;
      }
      
      return this.opaque;
    }

    this.setUniform = function(name, values) {
      var uniform = this.getUniform(name);
      if (uniform) {
        // bruh fix for texture
        uniform.arguments = Array.isArray(values) ? values : [values];
      }
      else if (this.programContainer.activeUniforms[name]) {
        var t = this.programContainer.activeUniforms[name].typeString;
        var isTexture = t.indexOf("SAMPLER") !== -1;
        
        var args = null;
        if (isTexture) {
          var textureIndex = this.textures.indexOf(values); 
          if (textureIndex === -1) {
            this.textures.push(values);
            args = [ this.textures.length - 1 ];
          }
          else {
            args = [ textureIndex ];
          }
        }
        else {
          args = Array.isArray(values) ? values : [values];
        }

        this.uniforms[name] = {
          texture: isTexture,
          type: getUniformSetType(t),
          name,
          arguments: args
        };
      }
      else {
        console.warn("Not a uniform: " + name);
      }
    }
  
    this.createUniform = function(name, type, values) {
      if (!this.getUniform(name)) {
        this.uniforms[name] = {
          name,
          type,
          arguments: Array.isArray(values) ? values : [values]
        };
        return true;
      }
  
      return false;
    }
  
    // bruh getUniform gc
    this.getUniform = function(name) {
      return this.uniforms[name];
    }
  
    this.bindUniforms = function(camera) {
      // bruh, fixes un-used textures using same location
      var i = 0;
      for (var name in this.programContainer.activeUniforms) {
        var uniform = this.programContainer.activeUniforms[name];

        if (!this.getUniform(name) && uniform.typeString.indexOf("SAMPLER") !== -1) {
          if (uniform.typeString == "SAMPLER_2D") {
            gl.uniform1i(uniform.location, splitsumUnit);
          }
          else if (uniform.typeString == "SAMPLER_CUBE") {
            gl.uniform1i(uniform.location, diffuseCubemapUnit);
          }
          else {
            gl.uniform1i(uniform.location, 20 + i);
            i++;
          }
        }
      }

      for (var i = 0; i < this.textures.length; i++) {
        var currentTexture = this.textures[i];
        var tex = currentTexture.texture ?? currentTexture;
  
        if (tex instanceof WebGLTexture) {
          gl.activeTexture(gl.TEXTURE0 + i + materialTextureUnitOffset);
          gl.bindTexture(currentTexture.type ?? gl.TEXTURE_2D, tex);
        }
      }

      for (var name in this.uniforms) {
        var uniform = this.uniforms[name];
        var location = getUniformLocation(uniform.name);

        if (location != null) {
          // Bruh (check if texture call)
          if (uniform.texture) {
            (gl["uniform" + uniform.type]).call(gl, location, uniform.arguments[0] + materialTextureUnitOffset);
          }
          else {
            (gl["uniform" + uniform.type]).call(gl, location, ...uniform.arguments);
          }
        }
      }
  
      // bruh
      var currentScene = renderer.scenes[renderer.currentScene];
      if (getUniformLocation("iTime") != null && typeof time != "undefined") gl.uniform1f(getUniformLocation("iTime"), time); // bruh
      if (getUniformLocation("sunDirection") != null)      gl.uniform3fv(getUniformLocation("sunDirection"), Vector.toArray(currentScene.sunDirection)); // bruh gc
      if (getUniformLocation("sunIntensity") != null)      gl.uniform3fv(getUniformLocation("sunIntensity"), Vector.toArray(currentScene.sunIntensity)); // ^

      if (getUniformLocation("projectionMatrix") != null)  gl.uniformMatrix4fv(getUniformLocation("projectionMatrix"), false, camera.projectionMatrix);
      if (getUniformLocation("inverseViewMatrix") != null) gl.uniformMatrix4fv(getUniformLocation("inverseViewMatrix"), false, camera.inverseViewMatrix);
      if (getUniformLocation("viewMatrix") != null)        gl.uniformMatrix4fv(getUniformLocation("viewMatrix"), false, camera.viewMatrix);
      // bruh ^^^ order matters

      gl.uniform1f(getUniformLocation("environmentIntensity"), currentScene.environmentIntensity);

      // bruh
      var lights = currentScene.getLights();
      gl.uniform1i(getUniformLocation("nrLights"), lights.length);

      for (var i = 0; i < lights.length; i++) {
        var light = lights[i];

        gl.uniform1i(getUniformLocation(`lights[${i}].type`), light.type);
        gl.uniform3f(getUniformLocation(`lights[${i}].position`), light.position.x, light.position.y, light.position.z);
        if (light.direction) gl.uniform3f(getUniformLocation(`lights[${i}].direction`), light.direction.x, light.direction.y, light.direction.z);
        if ("angle" in light) gl.uniform1f(getUniformLocation(`lights[${i}].angle`), light.angle);
        gl.uniform3f(getUniformLocation(`lights[${i}].color`), light.color[0], light.color[1], light.color[2]);
      }
    }
  
    this.bindModelMatrixUniform = function(matrix) {
      gl.uniformMatrix4fv(getUniformLocation("modelMatrix"), false, matrix);
    }

    this.setCulling = function(shadowPass = false) {
      if (shadowPass) {
        if (this.doubleSidedShadows) {
          gl.disable(gl.CULL_FACE);
        }
        else {
          gl.enable(gl.CULL_FACE);
        }
      }
      else {
        if (this.doubleSided) {
          gl.disable(gl.CULL_FACE);
        }
        else {
          gl.enable(gl.CULL_FACE);
        }
      }
    }

    this.getUniformLocation = getUniformLocation;
    function getUniformLocation(name) {
      return _this.programContainer.activeUniforms[name]?.location;
    }

    Object.defineProperty(this, 'program', {
      get: function() {
        return _this.programContainer.program;
      },
      set: val => {
        _this.programContainer.setProgram(val);
      }
    });
  }

  /*

    Mesh renderers

  */

  function Skin(joints, inverseBindMatrixData) {
    this.joints = joints;
    this.inverseBindMatrices = [];
    this.jointMatrices = [];
    this.jointData = new Float32Array(joints.length * 16);
    this.textureIndex = 25; // bruh
    this.parentNode;// = scene.root; // Bruh
  
    for (var i = 0; i < joints.length; i++) {
      this.inverseBindMatrices.push(new Float32Array(inverseBindMatrixData.buffer, inverseBindMatrixData.byteOffset + Float32Array.BYTES_PER_ELEMENT * 16 * i, 16));
      this.jointMatrices.push(new Float32Array(this.jointData.buffer, Float32Array.BYTES_PER_ELEMENT * 16 * i, 16));
    }
  
    this.jointTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.textureIndex);
    gl.bindTexture(gl.TEXTURE_2D, this.jointTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, this.joints.length, 0, gl.RGBA, getFloatTextureType(), null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
    // Bruh
    this.copy = function() {
      return this;
    }
  
    // Bruh expensive
    this.updateMatrixTexture = function() {
      for (let j = 0; j < this.joints.length; j++) {
        Matrix.copy(Matrix.multiply(this.joints[j].transform.getWorldMatrix(this.parentNode), this.inverseBindMatrices[j]), this.jointMatrices[j]); 

        // Matrix.multiply(this.joints[j].transform.getWorldMatrix(this.parentNode), this.inverseBindMatrices[j], this.jointMatrices[j]);

        // Matrix.set(this.jointMatrices[j], Matrix.multiply(this.joints[j].transform.getWorldMatrix(this.parentNode), this.inverseBindMatrices[j]));
      }
      
      gl.activeTexture(gl.TEXTURE0 + this.textureIndex);
      gl.bindTexture(gl.TEXTURE_2D, this.jointTexture);
      // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, this.joints.length, 0, gl.RGBA, getFloatTextureType(), this.jointData);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, this.joints.length, gl.RGBA, getFloatTextureType(), this.jointData);
    }
  }
  
  function SkinnedMeshRenderer(materials, skin, meshData) {
    this.materials = materials;
    this.skin = skin;
    this.meshData = meshData;
    this.drawMode = gl.TRIANGLES;
  
    this.uniformLocations = {};
  
    for (var i = 0; i < this.materials.length; i++) {
      var mat = this.materials[i];
      this.uniformLocations[i] = {};
      this.uniformLocations[i].u_jointTexture = gl.getUniformLocation(mat.program, "u_jointTexture"),
      this.uniformLocations[i].u_numJoints = gl.getUniformLocation(mat.program, "u_numJoints")
    }

    // bruh store attrib locations like MeshRenderer
  
    this.copy = function() {
      var mats = [];
      for (var mat of this.materials) {
        mats.push(mat.copy());
      }
  
      var mds = [];
      for (var md of this.meshData) {
        mds.push(md.copy());
      }
  
      var newSkinnedMeshRenderer = new SkinnedMeshRenderer(mats, this.skin.copy(), mds);
      newSkinnedMeshRenderer.drawMode = this.drawMode;
  
      return newSkinnedMeshRenderer;
    }
  
    this.render = function(camera, matrix, shadowPass = false, opaquePass = true) {
      for (var i = 0; i < this.meshData.length; i++) {
        var md = this.meshData[i];
        var mat = this.materials[i];

        if (mat.isOpaque() != opaquePass) {
          continue;
        }
  
        useProgram(mat.program);
        md.bindBuffers(mat.program);
  
        mat.bindModelMatrixUniform(matrix);
        mat.bindUniforms(camera);
        if (!shadowPass && renderer.shadowCascades) {
          renderer.shadowCascades.setUniforms(mat);
        }

        // bruh why does order matter ^^^ (activeTexture and bindTexture (skin) vvvvvvv)
        if (!shadowPass) {
          gl.uniform1i(this.uniformLocations[i].u_jointTexture, this.skin.textureIndex);
          gl.uniform1f(this.uniformLocations[i].u_numJoints, this.skin.joints.length);
        }

        this.skin.updateMatrixTexture();
  
        mat.setCulling(shadowPass);
        md.drawCall(this.drawMode);
      }
    }
  }
  
  this.MeshInstanceRenderer = MeshInstanceRenderer;
  function MeshInstanceRenderer(materials, meshData, options = {}) {
    this.materials = materials;
    this.drawMode = def(options.drawMode, gl.TRIANGLES);
    this.meshData = meshData;
  
    var matrixLocations = [];
    for (var mat of this.materials) {
      matrixLocations.push(gl.getAttribLocation(mat.program, 'modelMatrix'));
    }
    const matrixBuffer = gl.createBuffer();
    this.matrices = [];
  
    this.addInstance = function(instance, update = true) {
      var newMat = Matrix.copy(instance);
      this.matrices.push(newMat);
  
      if (update) {
        this.updateMatrixData();
      }
  
      return newMat;
    }
  
    this.updateInstance = function(instance, newMatrix, updateBuffer = true) {
      Matrix.copy(newMatrix, instance);
      this.matrixData.set(instance, this.matrices.indexOf(instance) * 16);
  
      if (updateBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, matrixBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.matrixData);
      }
    }
  
    this.removeInstance = function(instance) {
      var index = this.matrices.indexOf(instance);
      if (index != -1) {
        this.matrices.splice(index, 1);
        this.updateMatrixData();
      }
    }
  
    this.updateMatrixData = function() {
      this.matrixData = new Float32Array(this.matrices.length * 16);
      for (var i = 0; i < this.matrices.length; i++) {
        this.matrixData.set(this.matrices[i], i * 16);
      }
  
      gl.bindBuffer(gl.ARRAY_BUFFER, matrixBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.matrixData, gl.DYNAMIC_DRAW);
    }
  
    this.render = function(camera, baseMatrix, shadowPass = false, opaquePass = true) {
      if (this.matrices.length > 0 && !shadowPass) {
        for (var i = 0; i < this.meshData.length; i++) {
          var md = this.meshData[i];
          var mat = this.materials[i];
  
          if (mat.isOpaque() != opaquePass) {
            continue;
          }

          useProgram(mat.program);
          md.bindBuffers(mat.program);
  
          gl.bindBuffer(gl.ARRAY_BUFFER, matrixBuffer);
          var matrixLoc = matrixLocations[i];
          for (var j = 0; j < 4; j++) {
            const loc = matrixLoc + j;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 4 * 16, j * 16);
            vertexAttribDivisor(loc, 1);
          }
  
          if (!shadowPass && renderer.shadowCascades) {
            renderer.shadowCascades.setUniforms(mat);
          }
          mat.bindUniforms(camera);
  
          mat.setCulling(shadowPass);
          drawElementsInstanced(this.drawMode, md.indices.length, md.indexType, 0, this.matrices.length);
        }
      }
    }
  }
  
  this.MeshRenderer = MeshRenderer;
  function MeshRenderer(materials, meshData) {
    this.materials = Array.isArray(materials) ? materials : [materials];
    this.meshData = Array.isArray(meshData) ? meshData : [meshData];
    this.drawMode = gl.TRIANGLES;
  
    this.attribLocations = [];
    for (var i = 0; i < this.materials.length; i++) {
      this.attribLocations[i] = this.meshData[i].getAttribLocations(this.materials[i].program);
    }
  
    this.render = function(camera, matrix, shadowPass = false, opaquePass = true) {
      for (var i = 0; i < this.meshData.length; i++) {
        var md = this.meshData[i];
        var mat = this.materials[i];

        if (mat.isOpaque() != opaquePass) {
          continue;
        }
  
        useProgram(mat.program);
        md.bindBuffers(mat.program, this.attribLocations[i]);
        
        mat.bindModelMatrixUniform(matrix);
        mat.bindUniforms(camera);
        if (!shadowPass && renderer.shadowCascades) {
          renderer.shadowCascades.setUniforms(mat);
        }
  
        mat.setCulling(shadowPass);
        md.drawCall(this.drawMode);
      }
    }

    this.getInstanceMeshRenderer = function() {
      var mats = [];
      for (var mat of this.materials) {
        var newMat = mat.copy();
        newMat.program = renderer.litInstanced;
        mats.push(newMat);
      }

      var i = new MeshInstanceRenderer(mats, this.meshData, {
        drawMode: this.drawMode
      });
      return i;
    }

    this.copy = function() {
      var mats = [];
      for (var mat of this.materials) {
        mats.push(mat.copy());
      }
  
      var mds = [];
      for (var md of this.meshData) {
        mds.push(md.copy());
      }
  
      var newMeshRenderer = new MeshRenderer(mats, mds);
      newMeshRenderer.drawMode = this.drawMode;
  
      return newMeshRenderer;
    }
  }

  /*

    Mesh data

  */

  this.MeshData = MeshData;
  function MeshData(data) {
    this.data = data;
    this.indices = this.data?.indices?.bufferData;
    this.indexType = this.data?.indices?.type ?? gl.UNSIGNED_INT;
  
    this.buffers = [];
    for (var key of Object.keys(this.data)) {
      var d = this.data[key];
      this.buffers.push({
        attribute: key,
        buffer: createBuffer(d.bufferData, d.target ?? gl.ARRAY_BUFFER),
        size: d.size,
        target: d.target ?? gl.ARRAY_BUFFER,
        type: d.type ?? gl.FLOAT,
        stride: d.stride ?? 0
      });
    }
  
    var allVAOs = []; // bruh (extra memory)
    this.vaos = new WeakMap();
  
    // bruh
    this.copy = function() {
      return this;
    }
  
    this.getAttribLocations = function(program) {
      var output = {};
      for (var i = 0; i < this.buffers.length; i++) {
        var buffer = this.buffers[i];
        if (buffer.target != gl.ELEMENT_ARRAY_BUFFER) {
          output[buffer.attribute] = gl.getAttribLocation(program, buffer.attribute);
        }
      }
      
      return output;
    }
  
    this.bindBuffers = function(program, attribLocations) {
      // bindVertexArray(null);
      // attribLocations = attribLocations ?? this.getAttribLocations(program);
  
      // for (var i = 0; i < this.buffers.length; i++) {
      //   var buffer = this.buffers[i];
      //   if (buffer.target == gl.ELEMENT_ARRAY_BUFFER) {
      //     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.buffer);
      //   }
      //   else {
      //     var attribLocation = attribLocations[buffer.attribute];
      //     if (attribLocation != -1) {
      //       gl.bindBuffer(buffer.target, buffer.buffer);
      //       gl.enableVertexAttribArray(attribLocation);
      //       vertexAttribDivisor(attribLocation, 0);
      //       gl.vertexAttribPointer(attribLocation, buffer.size, buffer.type, false, buffer.stride, 0);
      //     }
      //   }
      // }

      // return;
  
      var vao = this.vaos.get(program);
      if (vao == undefined) {
        vao = createVertexArray();

        allVAOs.push(vao);
        this.vaos.set(program, vao);
  
        bindVertexArray(vao);
  
        attribLocations = attribLocations ?? this.getAttribLocations(program);
  
        for (var i = 0; i < this.buffers.length; i++) {
          var buffer = this.buffers[i];
          if (buffer.target == gl.ELEMENT_ARRAY_BUFFER) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.buffer);
          }
          else {
            var attribLocation = attribLocations[buffer.attribute];
            if (attribLocation != -1) {
              gl.bindBuffer(buffer.target, buffer.buffer);
              gl.enableVertexAttribArray(attribLocation);
              vertexAttribDivisor(attribLocation, 0);
              gl.vertexAttribPointer(attribLocation, buffer.size, buffer.type, false, buffer.stride, 0);
            }
          }
        }
      }
      else {
        bindVertexArray(vao);
      }
    }

    this.drawCall = function(drawMode) {
      if (this.indices) {
        gl.drawElements(drawMode, this.indices.length, this.indexType, 0);
      }
      else if (this.data.position) {
        if (drawMode == gl.TRIANGLE_STRIP) {
          gl.drawArrays(drawMode, 0, this.data.position.bufferData.length / 3);
        }
        else {
          gl.drawArrays(drawMode, 0, this.data.position.bufferData.length);
        }
      }
      else {
        console.warn("Can't render meshData");
      }
    }

    this.cleanup = function() {
      for (var vao of allVAOs) {
        deleteVertexArray(vao);
      }

      for (var buffer of this.buffers) {
        gl.deleteBuffer(buffer.buffer);
      }
    }
  }

  /*

    Textures

  */

  async function loadCubemap(path, fileExtension) {
    var texture = gl.createTexture();
    // gl.activeTexture(textureLocation);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    
    const faceInfos = [
      {target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: 'pos-x'},
      {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: 'neg-x'},
      {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: 'pos-y'},
      {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: 'neg-y'},
      {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: 'pos-z'},
      {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: 'neg-z'}
    ];
    for (var faceInfo of faceInfos) {
      var image = await loadImage(path + faceInfo.url + "." + fileExtension);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
      gl.texImage2D(faceInfo.target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
  
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  
    return texture;
  }

  this.loadMetalRoughness = function(metalSrc, roughnessSrc) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));

    Promise.all([
      loadImage(metalSrc),
      loadImage(roughnessSrc)
    ]).then(([metalImage, roughnessImage]) => {
      if (metalImage.width != roughnessImage.width || metalImage.height != roughnessImage.height) {
        throw new Error("Dimension mismatch!");
      }

      var metalData = getImagePixelData(metalImage);
      var roughnessData = getImagePixelData(roughnessImage);

      var imageData = new Uint8Array(metalImage.width * metalImage.height * 4);
      for (var i = 0; i < imageData.length; i += 4) {
        imageData[i] = 0;
        imageData[i + 1] = roughnessData[i + 1];
        imageData[i + 2] = metalData[i + 2];
        imageData[i + 3] = 255;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, metalImage.width, metalImage.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData);

      console.log("Metal/roughness loaded");
    }).catch(err => {
      throw err;
    });

    return texture;
  }

  this.loadTexture = loadTexture;
  function loadTexture(url, settings = {}) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
  
    var image = new Image();
    image.crossOrigin = "Anonymous";
    image.src = url;
    image.onload = function() {
      setupTexture(texture, image, settings);
    };
  
    return texture;
  }

  this.loadTextureAsync = loadTextureAsync;
  async function loadTextureAsync(url, settings = {}) {
    var image = await loadImage(url);

    var texture = gl.createTexture();
    return setupTexture(texture, image, settings);
  }

  function setupTexture(texture, image, settings) {
    if (!settings.hasOwnProperty("generateMipmap")) settings.generateMipmap = true;
    // if (!settings.hasOwnProperty("flipY")) settings.flipY = true;

    if (settings.hasOwnProperty("maxTextureSize") && image.width > settings.maxTextureSize) {
      var aspect = image.width / image.height;
      image = resizeImage(image, settings.maxTextureSize, settings.maxTextureSize / aspect);
    }

    // Make textures 2^N
    if (renderer.version == 1) {
      var s = Math.pow(2, Math.floor(Math.log2(image.width)));
      image = resizeImage(image, s, s);
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, settings.flipY ? 1 : 0);
    gl.texImage2D(gl.TEXTURE_2D, settings.level ?? 0, settings.internalFormat ?? gl.RGBA, settings.format ?? gl.RGBA, gl.UNSIGNED_BYTE, image);

    if (settings.generateMipmap && (renderer.version != 1 || (renderer.version == 1 && isPowerOf2(image.width) && isPowerOf2(image.height))) && settings.format != 35906) {
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    else {
      // if (renderer.version == 1) {
      //   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      //   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }

    if (settings.TEXTURE_WRAP_R) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, settings.TEXTURE_WRAP_R);
    if (settings.TEXTURE_WRAP_S) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, settings.TEXTURE_WRAP_S);
    if (settings.TEXTURE_WRAP_T) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, settings.TEXTURE_WRAP_T);

    if (settings.TEXTURE_MIN_FILTER) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, settings.TEXTURE_MIN_FILTER);
    if (settings.TEXTURE_MAG_FILTER) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, settings.TEXTURE_MAG_FILTER);

    return texture;
  }

  /* 

    Mesh data generation
  
  */

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

  var typeSizeInBits = {
    5120: 8,
    5121: 8,
    5122: 16,
    5123: 16,
    5125: 32,
    5126: 32
  };

  // bruh handle 404, etc errors
  this.loadGLTF = async function(path, loadSettings = {}) {
    return new Promise((resolve, reject) => {
      var oReq = new XMLHttpRequest();
      oReq.open("GET", path, true);
      oReq.responseType = "arraybuffer";

      var texturesCreated = [];
      var materialsCreated = [];
  
      oReq.onload = async function (oEvent) {
        if (oReq.status != 200) {
          reject("Could not load GLTF model: " + oReq.statusText);
          return;
        }

        var arrayBuffer = oReq.response;
        if (arrayBuffer) {
          console.log("Loading GLTF:", path);
          console.time("Done");
  
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
              throw new Error("Invalid chunk type: " + chunkType.toString(16));
            }
  
            i += chunkLength + 8;
          }
  
          console.log(json);
  
          var end = path.indexOf(".glb") + 4;
          var start = path.lastIndexOf("/", end) + 1;
          var mainParent = new GameObject(path.slice(start, end));
  
          var currentNodes = [];
          var outObjects = [];
          var skinsToResolve = [];
  
          var scene = json.scene ?? 0;
          var currentScene = json.scenes[scene];
          for (var i = 0; i < currentScene.nodes.length; i++) {
            outObjects = outObjects.concat((await AddChildrenRecursive(currentScene.nodes[i])));
          }
  
          mainParent.addChildren(outObjects);
  
          if (!objectIsEmpty(json.animations)) {
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

                var inputBuffer = getAccessorAndBuffer(sampler.input).buffer;
                var outputData = getAccessorAndBuffer(sampler.output);
                var outputAccessor = outputData.accessor;
                var outputBuffer = outputData.buffer;

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
              mats.push(new Material(renderer.litSkinnedContainer, currentMat.uniforms, currentMat.textures));
            }
  
            skin.obj.meshRenderer = new SkinnedMeshRenderer(mats, new Skin(outJoints, skin.inverseBindMatrixData), skin.obj.meshRenderer.meshData);
            skin.obj.meshRenderer.skin.parentNode = skin.obj.parent;
          }

          // Bruh
          mainParent.traverse(o => {
            o.transform.matrix = o.transform.matrix;
          });

          console.timeEnd("Done");
  
          resolve(mainParent);
        }
  
        async function AddChildrenRecursive(nodeIndex, depth = 0) {
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

          var gameObject = new GameObject(node.name, {matrix: mat, ...loadSettings.gameObjectOptions});
          gameObject.nodeIndex = nodeIndex;
          currentNodes[nodeIndex] = gameObject;

          if (node.extensions && node.extensions.KHR_lights_punctual) {
            var lightData = json.extensions.KHR_lights_punctual.lights[node.extensions.KHR_lights_punctual.light];
            var intensity = lightData.intensity ?? 1;
            var color = lightData.color ?? [1, 1, 1];
            var type = lightData.type;
            var typeLookup = {
              point: 0,
              spot: 1,
              directional: 2
            };

            var light = gameObject.addComponent(new Light());
            light.color = [
              color[0] * intensity,
              color[1] * intensity,
              color[2] * intensity
            ];
            light.type = typeLookup[type];

            if (lightData.spot && type == "spot") {
              light.angle = lightData.spot.outerConeAngle;
            }
          }
        
          if (node.mesh != undefined) {
            var mesh = json.meshes[node.mesh];

            var loadNormals = loadSettings.loadNormals ?? true;
            var loadTangents = loadSettings.loadTangents ?? true;
        
            var materials = [];
            var meshDatas = [];
        
            for (var i = 0; i < mesh.primitives.length; i++) {
              var currentPrimitive = mesh.primitives[i];
              var meshData = {};

              var vertices = getAccessorAndBuffer(currentPrimitive.attributes.POSITION);
              meshData.position = { bufferData: vertices.buffer, size: vertices.size, stride: vertices.stride };

              var indices = getAccessorAndBuffer(currentPrimitive.indices);
              if (indices) {
                meshData.indices = {
                  bufferData: indices.buffer,
                  type: renderer.indexTypeLookup[indices.type],
                  target: gl.ELEMENT_ARRAY_BUFFER,
                  stride: indices.stride
                };
              }
        
              if (loadNormals) {
                var normals = getAccessorAndBuffer(currentPrimitive.attributes.NORMAL);
                if (normals) {
                  meshData.normal = { bufferData: normals.buffer, size: normals.size, stride: normals.stride };
                }
                else {
                  meshData.normal = { bufferData: calculateNormals(vertices, indices), size: 3 };
                }
              }

              var vertexColors = getAccessorAndBuffer(currentPrimitive.attributes.COLOR_0);
              if (vertexColors) {
                meshData.color = { bufferData: invertColors(vertexColors.buffer), size: vertexColors.size, stride: vertexColors.stride };
              }

              var uvs = getAccessorAndBuffer(currentPrimitive.attributes.TEXCOORD_0);
              if (uvs) {
                meshData.uv = { bufferData: uvs.buffer, size: uvs.size, stride: uvs.stride };
                // for (var j = 0; j < meshData.uv.bufferData.byteLength; j += 2) {
                //   meshData.uv.bufferData[j + 1] = 1 - meshData.uv.bufferData[j + 1];
                // }
              }
        
              if (loadTangents) {
                var tangents = getAccessorAndBuffer(currentPrimitive.attributes.TANGENT);
                if (tangents) { // bruh (remove false)
                  meshData.tangent = { bufferData: tangents.buffer, size: tangents.size, stride: tangents.stride };
                }
                else if (uvs) {
                  meshData.tangent = { bufferData: calculateTangents(indices, vertices, uvs), size: 3 };
                }
              }
        
              if (currentPrimitive.attributes.JOINTS_0) {
                var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.JOINTS_0);
                meshData.joints = {
                  bufferData: accAndBuffer.buffer,
                  size: accAndBuffer.size,
                  type: accAndBuffer.type,
                  stride: accAndBuffer.stride
                };
              }
              if (currentPrimitive.attributes.WEIGHTS_0) {
                var accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.WEIGHTS_0);
                meshData.weights = {
                  bufferData: accAndBuffer.buffer,
                  size: accAndBuffer.size,
                  type: accAndBuffer.type,
                  stride: accAndBuffer.stride
                };
              }

              // console.log(meshData);

              var loadMaterials = loadSettings.loadMaterials ?? true;

              var meshMaterial = undefined;
        
              var materialIndex = currentPrimitive.material;
              if (loadMaterials && materialIndex != undefined) {
                if (materialsCreated[materialIndex] != undefined) {
                  meshMaterial = materialsCreated[materialIndex];
                }
                else {
                  var emissiveFactor = [0, 0, 0];
                  var albedoColor = [1, 1, 1, 1];
                  var albedoTexture = undefined;
                  var normalTexture = undefined;
                  var metallicRoughnessTexture = undefined;
                  var emissiveTexture = undefined;
                  var occlusionTexture = undefined;
                  var metallic = 1;
                  var roughness = 1;
                  var alphaCutoff = 0.5;
                  var opaque = 1;
                  var doubleSided = false;

                  var material = json.materials[materialIndex];
                  var pbr = material.pbrMetallicRoughness;

                  if (material.doubleSided) {
                    doubleSided = true;
                  }

                  if (material.alphaMode == "BLEND") {
                    alphaCutoff = 0;
                    opaque = 0;
                  }
                  else if (material.alphaMode == "MASK") {
                    alphaCutoff = material.alphaCutoff ?? 0.5;
                    opaque = 1;
                  }
                  else if (material.alphaMode == "OPAQUE" || !("alphaMode" in material)) {
                    alphaCutoff = -1;
                    opaque = 1;
                  }
    
                  if (pbr != undefined) {
                    albedoColor = pbr.baseColorFactor ?? [1, 1, 1, 1];

                    if (!pbr.metallicRoughnessTexture) {
                      metallic = 0;
                      roughness = 1;
                    }
    
                    if (_settings.loadTextures) {
                      var sRGBInternalFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.SRGB8_ALPHA8;
                      var sRGBFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.RGBA;

                      if (pbr.baseColorTexture) {
                        albedoTexture = await getTexture(pbr.baseColorTexture.index, {internalFormat: sRGBInternalFormat, format: sRGBFormat});
                      }
                      
                      if (pbr.metallicRoughnessTexture) {
                        metallicRoughnessTexture = await getTexture(pbr.metallicRoughnessTexture.index);
                      }
    
                      if (material.normalTexture) {
                        normalTexture = await getTexture(material.normalTexture.index, loadSettings.sRGBNormalMap ? {internalFormat: sRGBInternalFormat, format: sRGBFormat} : {});
                      }
    
                      if (material.emissiveTexture != undefined) {
                        emissiveTexture = await getTexture(material.emissiveTexture.index, {internalFormat: sRGBInternalFormat, format: sRGBFormat});
                      }
    
                      if (material.occlusionTexture != undefined) {
                        occlusionTexture = await getTexture(material.occlusionTexture.index);
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

                  meshMaterial = CreateLitMaterial({
                    alphaCutoff,
                    opaque,
                    albedoColor,
                    albedoTexture,
                    normalMap: normalTexture,
                    metallicRoughnessTexture,
                    roughness,
                    metallic,
                    emissiveFactor,
                    emissiveTexture,
                    occlusionTexture
                  });
                  meshMaterial.doubleSided = doubleSided;
                  meshMaterial.name = material.name || "No name!";
                  materialsCreated[materialIndex] = meshMaterial;

                  // console.log(material, meshMaterial);
                }
              }
        
              materials.push(meshMaterial ?? CreateLitMaterial());
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
            
            var inverseBindMatrixData = getAccessorAndBuffer(skin.inverseBindMatrices).buffer;
            if (getAccessorAndBuffer(skin.inverseBindMatrices).stride != 0) {
              console.warn("Stride in skin ibm data");
            }

            // var inverseBindMatrixAccessor = json.accessors[skin.inverseBindMatrices];
            // var view = json.bufferViews[inverseBindMatrixAccessor.bufferView];
            // var buffer = buffers[view.buffer].slice(view.byteOffset, view.byteOffset + view.byteLength);
            // var inverseBindMatrixData = new typedArrayLookup[inverseBindMatrixAccessor.componentType](buffer.buffer);
        
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
              out = out.concat(await AddChildrenRecursive(node.children[j], depth + 1));
            }
          }
        
          gameObject.addChildren(out);
        
          return [gameObject];
        }

        function invertColors(buffer) {
          for (var i = 0; i < buffer.length; i++) {
            buffer[i] = 1 - buffer[i];
          }
          return buffer;
        }

        function calculateNormals(vertices, indices) {
          // bruh fix for stride
          function getVertex(i) {
            return {
              x: vertices.buffer[i * 3],
              y: vertices.buffer[i * 3 + 1],
              z: vertices.buffer[i * 3 + 2]
            };
          }

          if (indices) {
            var normalTable = new Array(vertices.buffer.length / 3);
            for (var i = 0; i < normalTable.length; i++) {
              normalTable[i] = [];
            }

            var ib = indices.buffer;
            for (var i = 0; i < ib.length; i += 3) {
              var v0 = getVertex(ib[i]);
              var v1 = getVertex(ib[i + 1]);
              var v2 = getVertex(ib[i + 2]);

              var normal = getTriangleNormal([v0, v1, v2]);

              normalTable[ib[i]].push(normal);
              normalTable[ib[i + 1]].push(normal);
              normalTable[ib[i + 2]].push(normal);
            }

            var outNormals = [];
            for (var i = 0; i < normalTable.length; i++) {
              var normal = Vector.divide(normalTable[i].reduce((a, b) => {
                return Vector.add(a, b);
              }, Vector.zero()), normalTable[i].length);

              outNormals.push(normal.x, normal.y, normal.z);
            }

            return new Float32Array(outNormals);
          }
          else {
            var normals = new Float32Array(vertices.buffer.length);
            for (var i = 0; i < vertices.buffer.length / 3; i += 3) {
              var v0 = getVertex(i);
              var v1 = getVertex(i + 1);
              var v2 = getVertex(i + 2);

              var normal = getTriangleNormal([v0, v1, v2]);

              normals[i * 3] = normal.x;
              normals[i * 3 + 1] = normal.y;
              normals[i * 3 + 2] = normal.z;

              normals[(i + 1) * 3] = normal.x;
              normals[(i + 1) * 3 + 1] = normal.y;
              normals[(i + 1) * 3 + 2] = normal.z;

              normals[(i + 2) * 3] = normal.x;
              normals[(i + 2) * 3 + 1] = normal.y;
              normals[(i + 2) * 3 + 2] = normal.z;
            }

            return normals;
          }
        }

        function calculateTangents(indices, vertices, uvs) {
          // bruh use vectors instead (maybe...)
          // bruh fix for stride
          function getVertex(i) {
            return [
              vertices.buffer[i * 3],
              vertices.buffer[i * 3 + 1],
              vertices.buffer[i * 3 + 2]
            ];
          }

          function getUV(i) {
            return [
              uvs.buffer[i * 2],
              uvs.buffer[i * 2 + 1]
            ];
          }

          function subtract(a, b) {
            var out = new Array(a.length);
            for (var i = 0; i < a.length; i++) {
              out[i] = a[i] - b[i];
            }
            return out;
          }

          function setTangentVector(tangents, i0, i1, i2) {
            var v0 = getVertex(i0);
            var v1 = getVertex(i1);
            var v2 = getVertex(i2);

            var uv0 = getUV(i0);
            var uv1 = getUV(i1);
            var uv2 = getUV(i2);
            
            var deltaPos1 = subtract(v1, v0);
            var deltaPos2 = subtract(v2, v0);

            var deltaUV1 = subtract(uv1, uv0);
            var deltaUV2 = subtract(uv2, uv0);

            var r = 1 / (deltaUV1[0] * deltaUV2[1] - deltaUV1[1] * deltaUV2[0]);

            var tangent;
            if (isNaN(r) || !isFinite(r)) {
              failedTangents++;

              var normal = getTriangleNormal([
                Vector.fromArray(v0),
                Vector.fromArray(v1),
                Vector.fromArray(v2)
              ]);
              tangent = Vector.toArray(Vector.findOrthogonal(normal));
            }
            else {
              tangent = [
                (deltaPos1[0] * deltaUV2[1] - deltaPos2[0] * deltaUV1[1]) * r,
                (deltaPos1[1] * deltaUV2[1] - deltaPos2[1] * deltaUV1[1]) * r,
                (deltaPos1[2] * deltaUV2[1] - deltaPos2[2] * deltaUV1[1]) * r
              ];
            }

            tangents[i0 * 3] = tangent[0];
            tangents[i0 * 3 + 1] = tangent[1];
            tangents[i0 * 3 + 2] = tangent[2];

            tangents[i1 * 3] = tangent[0];
            tangents[i1 * 3 + 1] = tangent[1];
            tangents[i1 * 3 + 2] = tangent[2];

            tangents[i2 * 3] = tangent[0];
            tangents[i2 * 3 + 1] = tangent[1];
            tangents[i2 * 3 + 2] = tangent[2];

            return tangent;
          }

          var failedTangents = 0;
          var tangents = new Float32Array(vertices.buffer.length);

          if (!indices) {
            for (var i = 0; i < vertices.buffer.length / 3; i += 3) {
              setTangentVector(tangents, i, i + 1, i + 2);
            }
          }
          else {
            var ib = indices.buffer;
            for (var i = 0; i < ib.length; i += 3) {
              setTangentVector(tangents, ib[i], ib[i + 1], ib[i + 2]);
            }
          }

          if (failedTangents.length > 0) {
            console.warn(failedTangents + " tangents generated without UVs");
          }
          return tangents;
        }

        async function getTexture(index, settings) {
          if (texturesCreated[index] == undefined) {
            var texture = await createTexture(index, settings);
            texturesCreated[index] = texture;
            return texture;
          }
          
          return texturesCreated[index];
        }
        
        async function createTexture(index, settings = {}) {
          var textureData = json.textures[index];
          var ind = textureData.source;
          var view = json.bufferViews[json.images[ind].bufferView];
          // bruh
          var buffer = buffers[view.buffer].slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  
          const blob = new Blob([buffer], {
						type: json.images[ind].mimeType
					});
					var sourceURI = URL.createObjectURL(blob);

          if (loadSettings.hasOwnProperty("maxTextureSize")) {
            settings.maxTextureSize = loadSettings.maxTextureSize;
          }

          if (textureData.sampler) {
            var sampler = json.samplers[textureData.sampler];
            settings.TEXTURE_WRAP_S = sampler.wrapS;
            settings.TEXTURE_WRAP_T = sampler.wrapT;
            settings.TEXTURE_MIN_FILTER = sampler.minFilter;
            settings.TEXTURE_MAG_FILTER = sampler.magFilter;
          }

          var texture = await loadTextureAsync(sourceURI, settings);
          return texture;
        }
        
        function getAccessorAndBuffer(index) {
          if (index != undefined && index >= 0) {
            var accessor = json.accessors[index];
            var view = json.bufferViews[accessor.bufferView];

            // bruh sparse accessors
            var stride = view.byteStride ?? 0;
            var strideMult = stride ? stride / (typeSizeInBits[accessor.componentType] / 8) / typeComponents[accessor.type] : 1;

            var start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
            var buffer = buffers[view.buffer].slice(start, start + accessor.count * typeComponents[accessor.type] * typeSizeInBits[accessor.componentType] / 8 * strideMult);

            return {
              buffer: new typedArrayLookup[accessor.componentType](buffer.buffer),
              size: typeComponents[accessor.type],
              type: accessor.componentType,
              stride,
              accessor
            };
          }
        }
      }
  
      oReq.send(null);
    });
  }

  this.getLineCubeData = getLineCubeData;
  function getLineCubeData() {
    const positions = new Float32Array([
      -1, -1, -1,
       1, -1, -1,
      -1,  1, -1,
       1,  1, -1,
      -1, -1,  1,
       1, -1,  1,
      -1,  1,  1,
       1,  1,  1,
    ]);
    const indices = new Uint32Array([
      0, 1, 1, 3, 3, 2, 2, 0,
      4, 5, 5, 7, 7, 6, 6, 4,
      0, 4, 1, 5, 3, 7, 2, 6,
    ]);
  
    return {
      indices: {
        bufferData: indices,
        target: gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: positions,
        size: 3
      }
    }
  
    //return [positions, indices];
  }
  
  this.getCubeData = getCubeData;
  function getCubeData(color = []) {
    var r = color[0];
    var g = color[1];
    var b = color[2];
    
    var vertices = new Float32Array([   // Coordinates
      1.0, 1.0, 1.0,  -1.0, 1.0, 1.0,  -1.0,-1.0, 1.0,   1.0,-1.0, 1.0, // front
      1.0, 1.0, 1.0,   1.0,-1.0, 1.0,   1.0,-1.0,-1.0,   1.0, 1.0,-1.0, // right
      1.0, 1.0, 1.0,   1.0, 1.0,-1.0,  -1.0, 1.0,-1.0,  -1.0, 1.0, 1.0, // up
      -1.0, 1.0, 1.0,  -1.0, 1.0,-1.0,  -1.0,-1.0,-1.0,  -1.0,-1.0, 1.0, // left
      -1.0,-1.0,-1.0,   1.0,-1.0,-1.0,   1.0,-1.0, 1.0,  -1.0,-1.0, 1.0, // down
      1.0,-1.0,-1.0,  -1.0,-1.0,-1.0,  -1.0, 1.0,-1.0,   1.0, 1.0,-1.0  // back
    ]);
    
    var sideColors = [
      [r, g, b],
      [r, g, b],
      [r, g, b],
      [r, g, b],
      [r, g, b],
      [r, g, b]
    ]
    
    var colors = new Float32Array([    // Colors
      sideColors[0][0], sideColors[0][1], sideColors[0][2],  sideColors[0][0], sideColors[0][1], sideColors[0][2],  sideColors[0][0], sideColors[0][1], sideColors[0][2],  sideColors[0][0], sideColors[0][1], sideColors[0][2], // front
      sideColors[1][0], sideColors[1][1], sideColors[1][2],  sideColors[1][0], sideColors[1][1], sideColors[1][2],  sideColors[1][0], sideColors[1][1], sideColors[1][2],  sideColors[1][0], sideColors[1][1], sideColors[1][2], // right
      sideColors[2][0], sideColors[2][1], sideColors[2][2],  sideColors[2][0], sideColors[2][1], sideColors[2][2],  sideColors[2][0], sideColors[2][1], sideColors[2][2],  sideColors[2][0], sideColors[2][1], sideColors[2][2], // up
      sideColors[3][0], sideColors[3][1], sideColors[3][2],  sideColors[3][0], sideColors[3][1], sideColors[3][2],  sideColors[3][0], sideColors[3][1], sideColors[3][2],  sideColors[3][0], sideColors[3][1], sideColors[3][2], // left
      sideColors[4][0], sideColors[4][1], sideColors[4][2],  sideColors[4][0], sideColors[4][1], sideColors[4][2],  sideColors[4][0], sideColors[4][1], sideColors[4][2],  sideColors[4][0], sideColors[4][1], sideColors[4][2], // down
      sideColors[5][0], sideColors[5][1], sideColors[5][2],  sideColors[5][0], sideColors[5][1], sideColors[5][2],  sideColors[5][0], sideColors[5][1], sideColors[5][2],  sideColors[5][0], sideColors[5][1], sideColors[5][2],  // back
    ]);
  
    var normals = new Float32Array([    // Normal
      0.0, 0.0, 1.0,   0.0, 0.0, 1.0,   0.0, 0.0, 1.0,   0.0, 0.0, 1.0,  // front
      1.0, 0.0, 0.0,   1.0, 0.0, 0.0,   1.0, 0.0, 0.0,   1.0, 0.0, 0.0,  // right
      0.0, 1.0, 0.0,   0.0, 1.0, 0.0,   0.0, 1.0, 0.0,   0.0, 1.0, 0.0,  // up
      -1.0, 0.0, 0.0,  -1.0, 0.0, 0.0,  -1.0, 0.0, 0.0,  -1.0, 0.0, 0.0,  // left
      0.0,-1.0, 0.0,   0.0,-1.0, 0.0,   0.0,-1.0, 0.0,   0.0,-1.0, 0.0,  // down
      0.0, 0.0,-1.0,   0.0, 0.0,-1.0,   0.0, 0.0,-1.0,   0.0, 0.0,-1.0   // back
    ]);
  
    var indices = new Uint32Array([
      0, 1, 2,   0, 2, 3,  // front
      4, 5, 6,   4, 6, 7,  // right
      8, 9, 10,  8, 10,11, // up
      12,13,14,  12,14,15, // left
      16,17,18,  16,18,19, // down
      20,21,22,  20,22,23  // back
    ]);
  
    var uvs = new Float32Array([
      1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
      1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
      1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
      1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
      1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
      1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0
    ]);
  
    return {
      indices: {
        bufferData: indices,
        target: gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: vertices,
        size: 3
      },
      normal: {
        bufferData: normals,
        size: 3
      },
      uv: {
        bufferData: uvs,
        size: 2
      }
    }
    
    //return [vertices, indices, colors, normals, uvs];
  }

  this.getPlaneData = getPlaneData;
  function getPlaneData() {
    var vertices = new Float32Array([   // Coordinates
      1, 1, 0,
      -1, 1, 0,
      -1, -1, 0,
      1, -1, 0
    ]);
  
    var normals = new Float32Array([    // Normal
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]);

    var tangents = new Float32Array([    // Tangents
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0
    ]);
  
    var indices = new Uint32Array([
      0, 1, 2,   0, 2, 3
    ]);
  
    var uvs = new Float32Array([
      1.0, 1.0,
      0.0, 1.0,
      0.0, 0.0,
      1.0, 0.0
    ]);
  
    return {
      indices: {
        bufferData: indices,
        target: gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: vertices,
        size: 3
      },
      normal: {
        bufferData: normals,
        size: 3
      },
      tangent: {
        bufferData: tangents,
        size: 3
      },
      uv: {
        bufferData: uvs,
        size: 2
      }
    }
  }

  this.getParticleMeshData = getParticleMeshData;
  function getParticleMeshData(size = 0.04) {
    var vertices = new Float32Array([   // Coordinates
      size, size, 0,
      -size, size, 0,
      -size, -size, 0,
      size, -size, 0
    ]);
  
    var normals = new Float32Array([    // Normal
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]);

    var tangents = new Float32Array([    // Tangents
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0
    ]);
  
    var indices = new Uint32Array([
      0, 1, 2,   0, 2, 3
    ]);
  
    var uvs = new Float32Array([
      1.0, 1.0,
      0.0, 1.0,
      0.0, 0.0,
      1.0, 0.0
    ]);
  
    return new MeshData({
      indices: {
        bufferData: indices,
        target: gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: vertices,
        size: 3
      },
      normal: {
        bufferData: normals,
        size: 3
      },
      tangent: {
        bufferData: tangents,
        size: 3
      },
      uv: {
        bufferData: uvs,
        size: 2
      }
    });
  }

  this.loadObj = loadObj;
  async function loadObj(path, splitObjects = false) {
    var currentObject = "No name";
  
    var indices = {};
    //indices[currentObject] = [[], [], []];
  
    var vertices = [];
    var normals = [];
    var uvs = [];
  
    var text = await (await fetch(path)).text();
    var lines = text.split("\n");
    
    for (var i = 0; i < lines.length; i++) {
      var split = lines[i].split(" ");
      switch (split[0]) {
        case "o":
          currentObject = split[1] + " #" + Math.floor(Math.random() * 10000);
          indices[currentObject] = [[], [], []];
          break;
        case "v":
          vertices.push(
            parseFloat(split[1]),
            parseFloat(split[2]),
            parseFloat(split[3])
          );
          break;
        case "vn":
          normals.push(
            parseFloat(split[1]),
            parseFloat(split[2]),
            parseFloat(split[3])
          );
          break;
        case "vt":
          uvs.push(
            parseFloat(split[1]),
            parseFloat(split[2])
          );
          break;
        case "f":
          if (split.length == 4) {
            for (var j = 0; j < 3; j++) {
              indices[currentObject][j].push(
                parseInt(split[1].split("/")[j]) - 1,
                parseInt(split[2].split("/")[j]) - 1,
                parseInt(split[3].split("/")[j]) - 1
              );
            }
          }
          else if (split.length == 5) {
            for (var j = 0; j < 3; j++) {
              indices[currentObject][j].push(
                parseInt(split[1].split("/")[j]) - 1,
                parseInt(split[2].split("/")[j]) - 1,
                parseInt(split[3].split("/")[j]) - 1,
  
                parseInt(split[1].split("/")[j]) - 1,
                parseInt(split[3].split("/")[j]) - 1,
                parseInt(split[4].split("/")[j]) - 1
              );
            }
          }
          break;
      }
    }
  
    var newIndices = {}; 
    var newVertices = [];
    var newNormals = [];
    var newTangents = [];
    var newUVs = [];
  
    var a = [newVertices, newUVs, newNormals];
    var b = [vertices, uvs, normals];
  
    var newIndex = 0;
    for (var key in indices) {
      var currentIndices = indices[key];
      newIndices[key] = [];
  
      for (var i = 0; i < currentIndices[0].length; i++) {
        for (var j = 0; j < 3; j += 2) {
          a[j].push(
            b[j][currentIndices[j][i] * 3],
            b[j][currentIndices[j][i] * 3 + 1],
            b[j][currentIndices[j][i] * 3 + 2]
          )
        }
  
        newIndices[key].push(newIndex);
        newIndex++;
      }
  
      newIndices[key] = new Uint32Array(newIndices[key]);
  
      for (var i = 0; i < currentIndices[0].length; i++) {
        var j = 1;
        a[j].push(
          b[j][currentIndices[j][i] * 2],
          b[j][currentIndices[j][i] * 2 + 1]
        )
      }
    }
  
    /*for (var i = 0; i < indices[0].length; i += 3) {
      var v1 = {
        x: vertices[indices[0][i] * 3],
        y: vertices[indices[0][i] * 3 + 1],
        z: vertices[indices[0][i] * 3 + 2]
      };
  
      var v2 = {
        x: vertices[indices[0][i + 1] * 3],
        y: vertices[indices[0][i + 1] * 3 + 1],
        z: vertices[indices[0][i + 1] * 3 + 2]
      };
  
      var v3 = {
        x: vertices[indices[0][i + 2] * 3],
        y: vertices[indices[0][i + 2] * 3 + 1],
        z: vertices[indices[0][i + 2] * 3 + 2]
      };
  
      var uv1 = {
        x: uvs[indices[1][i] * 2],
        y: uvs[indices[1][i] * 2 + 1]
      };
  
      var uv2 = {
        x: uvs[indices[1][i + 1] * 2],
        y: uvs[indices[1][i + 1] * 2 + 1]
      };
  
      var uv3 = {
        x: uvs[indices[1][i + 2] * 2],
        y: uvs[indices[1][i + 2] * 2 + 1]
      };
  
      var edge1 = Vector.subtract(v2, v1);
      var edge2 = Vector.subtract(v3, v1);
      var deltaUV1 = Vector.subtract(uv2, uv1);
      var deltaUV2 = Vector.subtract(uv3, uv1);
  
      var F = 1 / (deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y);
  
      var tangent1 = {
        x: F * (deltaUV2.y * edge1.x - deltaUV1.y * edge2.x),
        y: F * (deltaUV2.y * edge1.y - deltaUV1.y * edge2.y),
        z: F * (deltaUV2.y * edge1.z - deltaUV1.y * edge2.z)
      };
  
      newTangents.push(tangent1.x, tangent1.y, tangent1.z);
      newTangents.push(tangent1.x, tangent1.y, tangent1.z);
      newTangents.push(tangent1.x, tangent1.y, tangent1.z);
    }*/
  
    var out = newIndices;
    if (!splitObjects) {
      out = [];
      for (var key in newIndices) {
        out = out.concat(Array.from(newIndices[key]));
      }
      out = new Uint32Array(out);
    }
  
    return {
      indices: {
        bufferData: out,
        target: gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(newVertices),
        size: 3
      },
      normal: {
        bufferData: new Float32Array(newNormals),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(newUVs),
        size: 2
      }
    }
    
    /*return [
      new Float32Array(newVertices),
      out,
      null,
      new Float32Array(newNormals),
      new Float32Array(newUVs),
      new Float32Array(newTangents)
    ];*/
  }

  this.CreateShape = function(shape) {
    var meshData;
    if (shape == "plane") {
      meshData = new this.MeshData(this.getPlaneData());
    }
    else if (shape == "cube") {
      meshData = new this.MeshData(this.getCubeData());
    }
    else {
      throw new Error("Invalid shape: " + shape);
    }

    var material = this.CreateLitMaterial();
    var meshRenderer = new MeshRenderer(material, meshData);

    var gameObject = new GameObject("Shape");
    gameObject.meshRenderer = meshRenderer;

    return gameObject;
  }

  this.CreatePBRGrid = async function(scene, w = 10, h = 10) {
    var meshData = (await this.loadGLTF(this.path + "assets/models/primitives/uvSphere.glb")).children[0].meshRenderer.meshData[0];

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var material = CreateLitMaterial({
          roughness: x / (w - 1),
          metallic: y / (h - 1)
        });
        var meshRenderer = new MeshRenderer(material, meshData);
        
        var gameObject = new GameObject();
        gameObject.transform.position = new Vector((x - (w - 1) / 2) * 2.1, (y - (h - 1) / 2) * 2.1, 0);
        gameObject.meshRenderer = meshRenderer;
        scene.add(gameObject);
      }
    }
  }

  this.BatchGameObject = function(gameObject) {
    var batchedGameobject = new GameObject(gameObject.name + " (Batched)");
    var batches = [];
  
    gameObject.traverse(o => {
      var lights = o.findComponents("Light");
      if (lights.length > 0) {
        var lightGameobject = new GameObject(o.name + " (Copy)");
        lightGameobject.transform.matrix = o.transform.worldMatrix;
        for (var l of lights) {
          lightGameobject.addComponent(l.copy());
        }
        batchedGameobject.addChild(lightGameobject);
      }

      if (o.meshRenderer) {
        var noTranslateWorldMatrix = Matrix.copy(o.transform.worldMatrix);
        Matrix.removeTranslation(noTranslateWorldMatrix);

        for (var i = 0; i < o.meshRenderer.meshData.length; i++) {
          var mat = o.meshRenderer.materials[i];
          var md = o.meshRenderer.meshData[i];
  
          var batch = batches.find(b => b.material == mat);
          if (!batch) {
            batch = {
              material: mat,
              vertices: [],
              indices: [],
              tangent: [],
              normal: [],
              uv: [],
              indexOffset: 0,
            };
            batches.push(batch);
          }
  
            // bruh
          if (md.data.position && md.data.indices) {
            for (var j = 0; j < md.data.position.bufferData.length; j += 3) {
              var v = {
                x: md.data.position.bufferData[j],
                y: md.data.position.bufferData[j + 1],
                z: md.data.position.bufferData[j + 2]
              };
              v = Matrix.transformVector(o.transform.worldMatrix, v);

              batch.vertices.push(v.x, v.y, v.z);
            }
  
            for (var j = 0; j < md.data.indices.bufferData.length; j++) {
              batch.indices.push(md.data.indices.bufferData[j] + batch.indexOffset);
            }

            if (md.data.uv) {
              for (var j = 0; j < md.data.uv.bufferData.length; j++) {
                batch.uv[batch.indexOffset * 2 + j] = md.data.uv.bufferData[j];
              }
            }

            addAndTransformAttribute("normal");
            addAndTransformAttribute("tangent");

            batch.indexOffset += md.data.position.bufferData.length / 3;
          }

          md.cleanup();

          function addAndTransformAttribute(name, size = 3) {
            if (md.data[name]) {
              var bd = md.data[name].bufferData;
              var step = md.data[name].size;

              var i = 0;
              for (var j = 0; j < bd.length; j += step) {
                var v = {
                  x: bd[j],
                  y: bd[j + 1],
                  z: bd[j + 2]
                };

                v = Vector.normalize(Matrix.transformVector(noTranslateWorldMatrix, v));
  
                batch[name][batch.indexOffset * size + i] = v.x;
                batch[name][batch.indexOffset * size + i + 1] = v.y;
                batch[name][batch.indexOffset * size + i + 2] = v.z;

                i += 3;
              }
            }
          }
        }
      }
    });
    
    for (var batch of batches) {
      for (var i = 0; i < batch.uv.length; i++) {
        if (typeof batch.uv[i] == "undefined") {
          batch.uv[i] = 0;
        }
      }
      for (var i = 0; i < batch.normal.length; i++) {
        if (typeof batch.normal[i] == "undefined") {
          batch.normal[i] = 0;
        }
      }
      for (var i = 0; i < batch.tangent.length; i++) {
        if (typeof batch.tangent[i] == "undefined") {
          batch.tangent[i] = 0;
        }
      }

      var g = new GameObject("Batch for " + batch.material.name);
      g.meshRenderer = new MeshRenderer(batch.material, new MeshData({
        position: {
          bufferData: new Float32Array(batch.vertices),
          size: 3
        },
        indices: {
          bufferData: new Uint32Array(batch.indices),
          target: renderer.gl.ELEMENT_ARRAY_BUFFER
        },
        tangent: {
          bufferData: new Float32Array(batch.tangent),
          size: 3
        },
        normal: {
          bufferData: new Float32Array(batch.normal),
          size: 3
        },
        uv: {
          bufferData: new Float32Array(batch.uv),
          size: 2
        },
      }));
      batchedGameobject.addChild(g);
    }
  
    return batchedGameobject;
  }
}

function GameObject(name = "Unnamed", options = {}) {
  var _this = this;

  this.name = name;
  this.children = def(options.children, []); 
  this.parent = null;

  this.transform = new Transform(options.matrix, options.position, options.rotation, options.scale);
  this.transform.gameObject = this;

  // Debug / legacy / bruh
  Object.defineProperty(this, 'position', {
    get: function() {
      throw new Error("Get position");
    },
    set: function(val) {
      throw new Error("Set position");
    }
  });

  Object.defineProperty(this, 'rotation', {
    get: function() {
      throw new Error("Get rotation");
    },
    set: function(val) {
      throw new Error("Set rotation");
    }
  });

  Object.defineProperty(this, 'scale', {
    get: function() {
      throw new Error("Get scale");
    },
    set: function(val) {
      throw new Error("Set scale");
    }
  });

  Object.defineProperty(this, 'matrix', {
    get: function() {
      throw new Error("Get matrix");
    },
    set: function(val) {
      throw new Error("Set matrix");
    }
  });

  Object.defineProperty(this, 'worldMatrix', {
    get: function() {
      throw new Error("Get worldMatrix");
    },
    set: function(val) {
      throw new Error("Set worldMatrix");
    }
  });

  this.traverse = function(func) {
    func(this);
    for (var child of this.children) {
      child.traverse(func);
    }
  }

  this.layer = 0;
  this.visible = def(options.visible, true);
  this.castShadows = def(options.castShadows, true);

  this.meshRenderer = def(options.meshRenderer, null);
  this.animationController = null;

  var _components = [];

  this.setLayer = function(layer, changeChildren = false) {
    if (changeChildren) {
      this.traverse(o => {
        o.layer = layer;
      });
    }
    else {
      this.layer = layer;
    }
  }

  this.getComponents = function() {
    return _components;
  }

  this.addComponent = function(comp) {
    comp.gameObject = this;
    _components.push(comp);

    return comp;
  }

  this.removeComponent = function(comp) {
    _components.splice(_components.indexOf(comp), 1);
    delete comp.gameObject;

    return comp;
  }

  this.findComponents = function(type) {
    return _components.filter((c) => c.constructor.name === type);
  }

  // Bruh
  this.copy = function() {
    var newThis = new GameObject(this.name + " (Copy)");
    newThis.layer = this.layer;
    newThis.visible = this.visible;
    newThis.castShadows = this.castShadows;
    newThis.transform.matrix = _this.transform.matrix;
 
    if (this.meshRenderer) {
      newThis.meshRenderer = this.meshRenderer.copy();
    }

    if (this.animationController) {
      newThis.animationController = this.animationController.copy();
    }

    for (var c of _components) {
      newThis.addComponent(c.copy(newThis));
    }

    for (var child of this.children) {
      newThis.addChild(child.copy());
    }

    return newThis;
  }

  this.getChild = function(name, recursive = false) {
    if (recursive) {
      var found;
      
      this.traverse(o => {
        if (o.name === name && !found) {
          found = o;
        }
      });

      return found;
    }
    else {
      return this.children.find(e => e.name == name);
    }
  }

  this.addChild = function(child) {
    if (child.parent == null) {
      child.parent = this;
      this.children.push(child);
      return child;
    }

    throw new Error("Can't add child! Child already has parent");
  }

  this.addChildren = function(children) {
    for (var i = 0; i < children.length; i++) {
      this.addChild(children[i]);
    }
    
    return children;
  }

  this.removeChild = function(child) {
    child.parent = null;
    this.children.splice(this.children.indexOf(child), 1);
  }

  this.setParent = function(parent) {
    if (this.parent != null) {
      this.parent.removeChild(this);
    }

    this.parent = parent;
    parent.children.push(this);
  }

  this.delete = function() {
    this.parent.removeChild(this);
  }

  this.update = function(dt) {
    if (this.animationController) {
      this.animationController.update(dt);
    }

    for (var component of _components) {
      component.update?.(dt);
    }

    for (var i = 0; i < this.children.length; i++) {
      this.children[i].update(dt);
    }
  }

  this.render = function(camera, settings = {}) {
  // this.render = function(camera, materialOverride, shadowPass = false, opaquePass = true) {
    if (this.visible) {
      var currentMatrix = this.transform.worldMatrix;

      var shadowPass = settings.renderPass ? ENUMS.RENDERPASS.SHADOWS & settings.renderPass : false;
      var opaquePass = settings.renderPass ? ENUMS.RENDERPASS.ALPHA & settings.renderPass ? false : true : true;

      if ((camera.layer ?? 0) == this.layer) {
        if (this.meshRenderer) {
          if (!(shadowPass && !this.castShadows)) {
            var oldMats = [];
            if (settings.materialOverride) {
              for (var i = 0; i < this.meshRenderer.materials.length; i++) {
                oldMats[i] = this.meshRenderer.materials[i];
                this.meshRenderer.materials[i] = settings.materialOverride;
              }
            }

            this.meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass);

            if (oldMats.length > 0) {
              for (var i = 0; i < this.meshRenderer.materials.length; i++) {
                this.meshRenderer.materials[i] = oldMats[i];
              }
            }
          }
        }

        if (!shadowPass) {
          for (var component of _components) {
            component.render?.(camera, currentMatrix, shadowPass, opaquePass);
          }
        }
      }

      for (var i = 0; i < this.children.length; i++) {
        this.children[i].render(camera, settings);
      }
    }
  }

  this.getChildStructure = function(level = 0, lastChild = []) {
    var output = this.name;
    if (this.children.length > 0) {
      output += "\n";
    }

    var list = [];
    for (var i = 0; i < this.children.length; i++) {
      var thisIsLastChild = i == this.children.length - 1;

      var spacing = "";
      for (var j = 0; j < lastChild.length; j++) {
        spacing += lastChild[j] ? "   " : "|  ";
      }
      spacing += thisIsLastChild ? "└──" : "├──";

      var newChildList = [...lastChild];
      newChildList.push(thisIsLastChild);
      list.push(spacing + this.children[i].getChildStructure(level + 1, newChildList));
    }
    output += list.join("\n");

    if (level == 1 && !lastChild[lastChild.length - 1]) {
      output += "\n|";
    }

    return output;
  }
}

function Transform(matrix, position, rotation, scale) {
  var _this = this;
  this.gameObject = null;

  this._hasChanged = {
    matrix: false,
    worldMatrix: false
  };

  var _matrix = Matrix.identity();
  var _worldMatrix = Matrix.identity();
  var _translationMatrix = Matrix.identity();
  var _rotationMatrix = Matrix.identity();
  var _scaleMatrix = Matrix.identity();

  var _position = position ?? Vector.zero();
  var _rotation = rotation ?? Quaternion.identity();
  var _scale = scale ?? Vector.one();

  var _positionProxy = createProxy(_position, everythingHasChanged);
  var _rotationProxy = createProxy(_rotation, everythingHasChanged);
  var _scaleProxy = createProxy(_scale, everythingHasChanged);

  var _lastPosition = Vector.copy(_position);
  var _lastRotation = Quaternion.copy(_rotation);
  var _lastScale = Vector.copy(_scale);

  if (matrix != null) {
    setMatrix(matrix);
  }
  else {
    setMatrixFromTRS();
  }

  Object.defineProperty(this, 'position', {
    get: function() {
      return _positionProxy;
    },
    set: function(val) {
      if (Vector.isVectorIsh(val)) {
        if (!Vector.equal(val, _lastPosition)) {
          // everythingHasChanged();
          // _position = val;

          _positionProxy.x = val.x;
          _positionProxy.y = val.y;
          _positionProxy.z = val.z;

          _lastPosition = Vector.copy(val);
        }
      }
      else {
        console.warn("Position is not vector");
      }
    }
  });

  // bruh doesnt detect component change
  Object.defineProperty(this, 'rotation', {
    get: function() {
      return _rotationProxy;
    },
    set: function(val) {
      if (!Quaternion.equal(val, _lastRotation)) {
        // everythingHasChanged();

        _rotationProxy.x = val.x;
        _rotationProxy.y = val.y;
        _rotationProxy.z = val.z;
        _rotationProxy.w = val.w;

        // _rotation = val;
        Matrix.fromQuaternion(_rotation, _rotationMatrix);
        // _rotationMatrix = Matrix.fromQuaternion(_rotation);

        _lastRotation = Quaternion.copy(val);
      }
    }
  });

  Object.defineProperty(this, 'scale', {
    get: function() {
      return _scaleProxy;
    },
    set: function(val) {
      if (Vector.isVectorIsh(val)) {
        if (!Vector.equal(val, _lastScale)) {
          // everythingHasChanged();
          // _scale = val;

          _scaleProxy.x = val.x;
          _scaleProxy.y = val.y;
          _scaleProxy.z = val.z;

          _lastScale = Vector.copy(val);
        }
      }
      else {
        console.warn("Scale is not vector");
      }
    }
  });

  // bruh calling matrix[x][y] = val is not detected
  Object.defineProperty(this, 'matrix', {
    get: function() {
      if (_this._hasChanged.matrix) {
        _this._hasChanged.matrix = false;
        setMatrixFromTRS();
      }

      return _matrix;
    },
    set: function(val) {
      everythingHasChanged();
      setMatrix(val);
    }
  });

  Object.defineProperty(this, 'worldMatrix', {
    get: function() {
      if (_this._hasChanged.worldMatrix) {
        _this._hasChanged.worldMatrix = false;
        _worldMatrix = _this.getWorldMatrix();
      }

      return _worldMatrix;
    }
  });

  Object.defineProperty(this, 'translationMatrix', {
    get: function() {
      return _translationMatrix;
    }
  });

  Object.defineProperty(this, 'rotationMatrix', {
    get: function() {
      return _rotationMatrix;
    },
    set: function(val) {
      everythingHasChanged();

      _rotation = Quaternion.fromMatrix(val);
      Matrix.copy(val, _rotationMatrix);
      // _rotationMatrix = Matrix.copy(val);
    }
  });

  Object.defineProperty(this, 'scaleMatrix', {
    get: function() {
      return _scaleMatrix;
    }
  });

  // bruh optimize (maybe???)
  Object.defineProperty(this, 'forward', {
    get: function() {
      return Matrix.getForward(_this.worldMatrix);
    }
  });

  function everythingHasChanged() {
    if (_this.gameObject) {
      _this.gameObject.traverse(o => {
        o.transform._hasChanged.matrix = true;
        o.transform._hasChanged.worldMatrix = true;
      });
    }
    else {
      _this._hasChanged.matrix = true;
      _this._hasChanged.worldMatrix = true;
    }
  }

  function setMatrixFromTRS() {
    var m = Matrix.translate(_position);
    Matrix.multiply(m, _rotationMatrix, m);
    Matrix.transform([
      ["scale", _scale]
    ], m);

    setMatrix(m, false);

    // setMatrix(Matrix.transform([
    //   ["translate", _position],
    //   ["rz", _rotation.z],
    //   ["ry", _rotation.y],
    //   ["rx", _rotation.x],
    //   ["scale", _scale]
    // ]), false);
  }

  function setMatrix(m, setTRS = true) {
    Matrix.copy(m, _matrix);
    Matrix.getTranslationMatrix(_matrix, _translationMatrix);
    Matrix.getRotationMatrix(_matrix, _rotationMatrix);
    Matrix.getScaleMatrix(_matrix, _scaleMatrix);

    // _matrix = m;
    // _translationMatrix = Matrix.getTranslationMatrix(_matrix);
    // _rotationMatrix = Matrix.getRotationMatrix(_matrix);
    // _scaleMatrix = Matrix.getScaleMatrix(_matrix);

    if (setTRS) {
      setProxyVector(_positionProxy, Matrix.getPosition(_matrix));
      setProxyQuat(_rotationProxy, Quaternion.fromMatrix(_matrix));
      setProxyVector(_scaleProxy, Matrix.getScale(_matrix));

      _lastPosition = Vector.copy(_positionProxy);
      _lastRotation = Quaternion.copy(_rotationProxy);
      _lastScale = Vector.copy(_scaleProxy);

      // _position = Matrix.getPosition(_matrix);
      // _rotation = Quaternion.fromMatrix(_matrix);
      // _scale = Matrix.getScale(_matrix);
    }

    _this.onUpdateMatrix?.(_matrix);
  }

  this.getWorldMatrix = function(stopParent) {
    if (this.gameObject && this.gameObject.parent && this.gameObject.parent != stopParent) {
      var m = Matrix.multiply(this.gameObject.parent.transform.getWorldMatrix(stopParent), this.matrix);
      return m;
    }

    return this.matrix;
  }

  function setProxyVector(p, v) {
    p.x = v.x;
    p.y = v.y;
    p.z = v.z;
  }

  function setProxyQuat(p, q) {
    p.x = q.x;
    p.y = q.y;
    p.z = q.z;
    p.w = q.w;
  }

  function createProxy(obj, callback = () => {}) {
    return new Proxy(obj, {
      set: function(obj, prop, value) {
        obj[prop] = value;
        
        if (prop == "x" || prop == "y" || prop == "z" || prop == "w") {
          callback?.();
          // everythingHasChanged();
        }
        
        return true;
      },
      get: function(target, prop, receiver) {
        return Reflect.get(...arguments);
      }
    });
  }
}

function Scene(name) {
  this.renderer = null;
  this.name = name;
  this.root = new GameObject("root");

  this.sunDirection = Vector.normalize({x: -0.8, y: 1.3, z: -1.2});
  this.sunIntensity = Vector.multiply(new Vector(1, 0.9, 0.85), 10);
  this.skyboxVisible = true;
  this.smoothSkybox = false;
  this.environmentIntensity = 1;

  var lights = [];

  this.loadEnvironment = async function(settings = {}) {
    if (this.renderer) {
      var res = settings.res ?? 1024;
      if (settings.hdrFolder) {
        var hdrFolder = settings.hdrFolder;

        this.skyboxCubemap = await this.renderer.createCubemapFromHDR(hdrFolder + "/skybox.hdr", res);
      
        try {
          // bruh res should be 32
          this.diffuseCubemap = await this.renderer.createCubemapFromHDR(hdrFolder + "/diffuse.hdr", res);
        }
        catch (e) {
          console.warn("No prebaked diffuse map. Generating one...");
          this.diffuseCubemap = await this.renderer.getDiffuseCubemap(this.skyboxCubemap);
        }
      }
      else if (settings.cubemap) {
        this.skyboxCubemap = settings.cubemap;
        this.diffuseCubemap = await this.renderer.getDiffuseCubemap(this.skyboxCubemap);
      }
      else {
        var program = new this.renderer.ProgramContainer(await this.renderer.createProgramFromFile(this.renderer.path + `assets/shaders/built-in/webgl${this.renderer.version}/procedualSkybox`));
        var mat = new this.renderer.Material(program);
        this.skyboxCubemap = await this.renderer.createCubemapFromCube(mat, res);
        this.diffuseCubemap = await this.renderer.getDiffuseCubemap(this.skyboxCubemap);
      }

      this.specularCubemap = await this.renderer.getSpecularCubemap(this.skyboxCubemap);

      if (this.smoothSkybox) {
        this.skyboxCubemap = this.diffuseCubemap;
      }

      return true;
    }
    console.error("Add scene to renderer before loading environment");
    return false;
  }

  this.add = function(gameObject) {
    if (Array.isArray(gameObject)) {
      return this.root.addChildren(gameObject);
    }
    else {
      return this.root.addChild(gameObject);
    }
  }

  this.update = function(dt) {
    this.root.update(dt);
  }

  this.render = function() {
    this.root.render(...arguments);
  }

  this.getLights = function() {
    return lights;
  }

  this.updateLights = function() {
    var allLights = [];

    this.root.traverse(g => {
      var lights = g.findComponents("Light");
      if (lights) {
        for (var light of lights) {
          allLights.push({
            type: light.type,
            position: Matrix.getPosition(g.transform.worldMatrix),
            direction: Matrix.getForward(g.transform.worldMatrix),
            angle: light.angle,
            color: light.color
          });
        }
      }
    });

    lights = allLights;
    return true;

    // return [
    //   { type: 0, position: new Vector(1, 1, 1.5), color: [100, 1000, 1000] },
    //   { type: 0, position: new Vector(-1, 1, 1.5), color: [1000, 500, 100] }
    // ];
  }

  // this.render = function(camera, overrideMaterial, shadowPass) {
  //   if ((camera.layer ?? 0) == 0) {
  //     // skybox.render(camera);
  //   }

  //   this.root.render(camera, overrideMaterial, shadowPass);
  // }
}

// bruh not done
function Light() {
  this.gameObject = null;
  this.angle = Math.PI / 3;
  this.color = [1, 0.5, 0.1];
  this.type = 0;

  this.kelvinToRgb = function(k, intensity = 1) {
    var retColor = [0, 0, 0];
	
    k = clamp(k, 1000, 40000) / 100;
    
    if (k <= 66) {
      retColor[0] = 1;
      retColor[1] = clamp(0.39008157876901960784 * Math.log(k) - 0.63184144378862745098, 0, 1);
    }
    else {
    	var t = k - 60;
      retColor[0] = clamp(1.29293618606274509804 * Math.pow(t, -0.1332047592), 0, 1);
      retColor[1] = clamp(1.12989086089529411765 * Math.pow(t, -0.0755148492), 0, 1);
    }
    
    if (k > 66)
      retColor[2] = 1;
    else if (k <= 19)
      retColor[2] = 0;
    else
      retColor[2] = clamp(0.54320678911019607843 * Math.log(k - 10) - 1.19625408914, 0, 1);

    retColor[0] *= intensity;
    retColor[1] *= intensity;
    retColor[2] *= intensity;

    return retColor;
  }

  this.copy = function() {
    var l = new Light();
    l.angle = this.angle;
    l.color = Array.from(this.color);
    l.type = this.type;
    return l;
  }
}

/*

  Cameras

*/

function flyCamera(renderer, camera, eulerAngles, dt = 1) {
  var speed = 15;
  if (renderer.getKey([87])) {
    var c = Math.cos(eulerAngles.x);
    camera.transform.position.x += Math.cos(eulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.z += -1 * Math.sin(eulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.y += Math.sin(eulerAngles.x) * speed * dt;
  }
  if (renderer.getKey([83])) {
    var c = Math.cos(eulerAngles.x);
    camera.transform.position.x -= Math.cos(eulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.z -= -1 * Math.sin(eulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.y -= Math.sin(eulerAngles.x) * speed * dt;
  }
  if (renderer.getKey([65])) {
    camera.transform.position.x -= Math.cos(eulerAngles.y) * speed * dt;
    camera.transform.position.z -= -1 * Math.sin(eulerAngles.y) * speed * dt;
  }
  if (renderer.getKey([68])) {
    camera.transform.position.x += Math.cos(eulerAngles.y) * speed * dt;
    camera.transform.position.z += -1 * Math.sin(eulerAngles.y) * speed * dt;
  }

  var rotSpeed = 3;
  if (renderer.getKey([37])) {
    eulerAngles.y += rotSpeed * dt;
  }
  if (renderer.getKey([39])) {
    eulerAngles.y -= rotSpeed * dt;
  }
  if (renderer.getKey([38])) {
    eulerAngles.x += rotSpeed * dt;
  }
  if (renderer.getKey([40])) {
    eulerAngles.x -= rotSpeed * dt;
  }
}

function Camera(settings = {}) {
  var _this = this;
  this.layer = settings.layer ?? 0;
  
  this.transform = new Transform(null, settings.position, settings.rotation);
  this.aspect = 1;
  var _fov = settings.fov ?? 45;

  this.projectionMatrix = Matrix.perspective({fov: _fov * Math.PI / 180, aspect: this.aspect, near: settings.near ?? 0.3, far: settings.far ?? 100});
  var _viewMatrix = Matrix.identity();

  this.transform.onUpdateMatrix = function() {
    Matrix.inverse(_this.transform.matrix, _viewMatrix);
  }

  Object.defineProperty(this, 'cameraMatrix', {
    get: function() {
      return _this.transform.matrix;
    }
  });
  Object.defineProperty(this, 'inverseViewMatrix', {
    get: function() {
      return _this.transform.matrix;
    }
  });
  Object.defineProperty(this, 'viewMatrix', {
    get: function() {
      if (_this.transform._hasChanged.matrix || _this.transform._hasChanged.worldMatrix) {
        Matrix.inverse(_this.transform.matrix, _viewMatrix);
      }
      return _viewMatrix;
    }
  });

  this.setAspect = function(aspect) {
    this.aspect = aspect;
    Matrix.perspective({fov: _fov * Math.PI / 180, aspect: this.aspect, near: settings.near ?? 0.3, far: settings.far ?? 100}, this.projectionMatrix);
  }

  this.setFOV = function(fov) {
    _fov = fov;
    Matrix.setPerspectiveFov(this.projectionMatrix, this.aspect, _fov * Math.PI / 180);
  }

  this.getFOV = function() {
    return _fov;
  }
}

/*

  Animation

*/

function AnimationController() {
  this.animations = [];
  this.speed = 1;
  this.loop = false;

  this.animationTimes = new WeakMap();

  this.copy = function() {
    var newAC = new AnimationController();
    newAC.speed = this.speed;
    newAC.loop = this.loop;
    
    for (var animation of this.animations) {
      newAC.animationTimes.set(animation, this.animationTimes.get(animation));
      newAC.animations.push(animation.copy());
    }

    return newAC;
  }

  this.update = function(dt) {
    for (var animation of this.animations) {
      var newTime = (this.animationTimes.get(animation) ?? 0) + dt * this.speed * animation.speed;
      if (this.loop) {
        newTime = newTime % animation.length;
        if (newTime < 0) {
          newTime = animation.length + newTime;
        }
      }
      this.animationTimes.set(animation, newTime);

      if (newTime < animation.length * 1.2 || this.loop) {
        var animData = this.getCurrentMatrices(animation);
        for (var channel of animData) {
          if (channel.translation) {
            channel.target.transform.position = channel.translation;
          }
          if (channel.rotation) {
            channel.target.transform.rotation = channel.rotation;
          }
          if (channel.scale) {
            channel.target.transform.scale = channel.scale;
          }
        }
      }
    }
  }

  this.play = function(matchName) {
    var lowerName = matchName.toLowerCase();

    for (var animation of this.animations) {
      if (matchName != undefined && animation.name.toLowerCase().indexOf(lowerName) == -1) continue;
      this.animationTimes.set(animation, 0);
    }
  }

  this.getCurrentMatrices = function(animation) {
    var t = this.animationTimes.get(animation) ?? 0;

    var animData = this.getStates(animation, t);
    return animData;
  }

  this.getStates = function(animation, t) {
    var channels = animation.data;
    var output = [];

    for (var i = 0; i < channels.length; i++) {
      var channel = channels[i];
      var currentOut = {
        target: channel.target
      };

      var indexData = this.getClosestIndex(channel.inputBuffer, t);
      
      // bruh interpolation mode
      // if (true || (channel.outputBuffer[indexData.indices[0]] && channel.outputBuffer[indexData.indices[1]])) {
        if (channel.path == "translation") {
          var pos = Vector.lerp(
            channel.outputBuffer[indexData.indices[0]],
            channel.outputBuffer[indexData.indices[1]],
            indexData.lerpTime
          );

          currentOut.translation = pos;
        }
        else if (channel.path == "rotation") {
          // console.log(
          //   channel,
          //   indexData.indices[0],
          //   indexData.indices[1],
          //   channel.outputBuffer[indexData.indices[0]],
          //   channel.outputBuffer[indexData.indices[1]],
          //   indexData.lerpTime
          // );
          
          var rot = Quaternion.slerp(
            channel.outputBuffer[indexData.indices[0]],
            channel.outputBuffer[indexData.indices[1]],
            indexData.lerpTime
          );
          
          currentOut.rotation = Quaternion.normalize(rot);
        }
        else if (channel.path == "scale") {
          var scale = Vector.lerp(
            channel.outputBuffer[indexData.indices[0]],
            channel.outputBuffer[indexData.indices[1]],
            indexData.lerpTime
          );

          currentOut.scale = scale;
        }
      // }

      output.push(currentOut);
    }

    return output;
  }

  this.getClosestIndex = function(arr, t) {
    for (var i = 0; i < arr.length; i++) {
      if (t < arr[i]) {
        return {
          indices: [i, Math.max(0, i - 1)],
          lerpTime: inverseLerp(arr[i], arr[Math.max(0, i - 1)], t)
        };
      }
    }

    return {
      indices: [arr.length - 1, arr.length - 1],
      lerpTime: 0
    };
  }
}

function AnimationData(name = "Unnamed animation", data = [], len) {
  this.name = name;
  this.data = data;
  this.speed = 1;

  if (len == undefined) {
    if (this.data.length > 0) {
      var longestTime = 0;
      for (var channel of this.data) {
        var currentMaxTime = channel.inputBuffer[channel.inputBuffer.length - 1];
        if (currentMaxTime > longestTime) {
          longestTime = currentMaxTime;
        }
      }

      this.length = longestTime;
    }
    else {
      this.length = 4;
    }
  }
  else {
    this.length = len;
  }

  // Bruh (data is reference now)
  this.copy = function() {
    var newAnim = new AnimationData(this.name + " (Copy)", this.data, this.length);
    newAnim.speed = this.speed;
    return newAnim;
  }
}

/*

  Audio

*/

function AudioListener3D() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  this.audioContext = new AudioContext();
  const listener = this.audioContext.listener;

  this.setPosition = function(pos) {
    if (listener.positionX) {
      listener.positionX.value = pos.x;
      listener.positionY.value = pos.y;
      listener.positionZ.value = pos.z;
    }
    else {
      listener.setPosition(pos.x, pos.y, pos.z);
    }
  }
  this.setPosition({x: 0, y: 0, z: 0});

  this.setDirection = function(forward, up) {
    if (listener.forwardX) {
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    }
    else {
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }
  this.setDirection({x: 0, y: 0, z: 1}, {x: 0, y: 1, z: 0});
}

function AudioSource3D(listener, url, position = {x: 0, y: 0, z: 0}) {
  const pannerModel = 'HRTF';

  const distanceModel = 'exponential';
  const maxDistance = 30;
  const refDistance = 1;
  const rollOff = 1;
 
  const innerCone = 360;
  const outerCone = 360;
  const outerGain = 0;

  const orientationX = 0.0;
  const orientationY = 0.0;
  const orientationZ = -1.0;

  this.panner = new PannerNode(listener.audioContext, {
    panningModel: pannerModel,
    distanceModel: distanceModel,
    positionX: position.x,
    positionY: position.y,
    positionZ: position.z,
    orientationX: orientationX,
    orientationY: orientationY,
    orientationZ: orientationZ,
    refDistance: refDistance,
    maxDistance: maxDistance,
    rolloffFactor: rollOff,
    coneInnerAngle: innerCone,
    coneOuterAngle: outerCone,
    coneOuterGain: outerGain
  });

  this.audioElement = document.createElement("audio");
  this.audioElement.src = url;

  const track = listener.audioContext.createMediaElementSource(this.audioElement);
  track.connect(this.panner).connect(listener.audioContext.destination);

  this.setPosition = function(pos) {
    this.panner.positionX.value = pos.x;
    this.panner.positionY.value = pos.y;
    this.panner.positionZ.value = pos.z;
  }

  this.play = function() {
    this.audioElement.play();
  }
  this.pause = function() {
    this.audioElement.pause();
  }
}

/*

  Helper functions

*/

function FindMaterials(name, obj = scene.root, output = []) {
  if (obj.meshRenderer) {
    for (var mat of obj.meshRenderer.materials) {
      if (mat.name.indexOf(name) !== -1) {
        output.push(mat);
      }
    }
  }

  for (var child of obj.children) {
    FindMaterials(name, child, output);
  }

  return output;
}

function getMousePos(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  var scaleX = canvas.width / rect.width;
  var scaleY = canvas.height / rect.height;

  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

function resizeImage(image, width, height) {
  var canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  return canvas;
}

function getImagePixelData(image) {
  var canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function cloneCanvas(canvas, left = 0) {
  var cc = document.body.appendChild(document.createElement("canvas"));
  cc.style = `
    position: fixed;
    top: 0;
    left: ${left}px;
    z-index: 10000;
  `;
  cc.width = canvas.width;
  cc.height = canvas.height;
  var ctx = cc.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.addEventListener('load', e => resolve(img));
    img.addEventListener('error', () => {
      reject(new Error(`Failed to load image's URL: ${url}`));
    });
    img.src = url;
  });
}

function saveCanvasAsImage(canvas, name = "download") {
  var link = document.createElement('a');
  link.download = name + ".png";
  link.href = canvas.toDataURL()
  link.click();
}

function def(current, d) {
  return typeof current == "undefined" ? d : current;
}

function objectIsEmpty(obj) {
  return !obj || Object.keys(obj).length === 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPowerOf2(value) {
  return (value & (value - 1)) == 0;
}

export default Renderer;
export {
  GameObject,
  Transform,
  Scene,
  Light,
  Camera,
  AnimationController,
  AnimationData,
  AudioListener3D,
  AudioSource3D,
  FindMaterials
}