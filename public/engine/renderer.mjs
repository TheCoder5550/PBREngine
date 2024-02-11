import * as ENUMS from "./constants.mjs";

import Vector from "./vector.mjs";
import Matrix from "./matrix.mjs";
import Quaternion from "./quaternion.mjs";
import { LoadHDR, CreateHDR } from "./HDRReader.mjs";
import {
  clamp,
  roundNearest,
  Float32ToFloat16,
  Uint8ToUint32,
  saveCanvasAsImage,
  isPowerOf2,
  sleep,
  objectIsEmpty,
  loadImage,
  getImagePixelData,
  downloadURL,
  wrap
} from "./helper.mjs";
import { getSignedDistanceToPlane, getTriangleNormal } from "./algebra.mjs";
import { LerpCurve } from "./curves.mjs";
import { AABB } from "./physics.mjs";
import { GameObject } from "./gameObject.mjs";
import { Scene } from "./scene.mjs";
import { Light } from "./light.mjs";
import { Camera } from "./camera.mjs";
import { AnimationController } from "./animationController.mjs";
import { AnimationData } from "./animationData.mjs";
import { EventHandler } from "./eventHandler.mjs";
import { NewLitMaterial, NewMaterial } from "./material.mjs";

// Forward shaders
import * as litSource from "../assets/shaders/built-in/lit.glsl.mjs";
import * as unlitSource from "../assets/shaders/built-in/unlit.glsl.mjs";
import * as billboardSource from "../assets/shaders/built-in/billboard.glsl.mjs";
import * as particleSource from "../assets/shaders/built-in/particle.glsl.mjs";

// Deferred shaders
import * as deferredShaders from "../assets/shaders/built-in/deferred/deferred.mjs";
import * as blurSource from "../assets/shaders/built-in/blur.mjs";

// Misc. shaders
import * as skyboxSource from "../assets/shaders/built-in/skybox.glsl.mjs";
import * as shadowSource from "../assets/shaders/built-in/shadow.glsl.mjs";
import * as equirectangularToCubemapSource from "../assets/shaders/built-in/equirectangularToCubemap.glsl.mjs";
import * as diffuseCubemapSource from "../assets/shaders/built-in/cubemapConvolution.glsl.mjs";
import * as specularCubemapSource from "../assets/shaders/built-in/prefilterCubemap.glsl.mjs";
import { fragmentLogDepth, fragmentLogDepthMain, vertexLogDepth, vertexLogDepthMain } from "../assets/shaders/built-in/base.mjs";

// bruh load shaders as javascript with import

// bruh make lit shader template

// bruh use drawingBufferWidth instead of canvas.width
// bruh resize every frame if width doesnt match clientWidth

// bruh make setter for every uniform in material

// bruh only bind override material once when rendering shadowmap

// bruh use #define instead of if statements in all/most shaders for performance. Implenent in postprocessing.glsl.mjs first maybe to try it out

// bruh dont get all uniform locations when creating program, get the location when accessing a specific uniform and save that instead.

/**
 * Creates a renderer and a canvas
 * @param {{
 * renderScale?: number,
 * debug?: boolean,
 * catchProgramErrors?: boolean,
 * logarithmicDepthBuffer?: boolean,
 * path?: string,
 * canvas?: HTMLCanvasElement,
 * version?: number,
 * }} settings 
 */
function Renderer(settings = {}) {
  var renderer = this;
  /** @type {WebGL2RenderingContext} */
  var gl;
  
  var renderScale = settings.renderScale ?? 1;
  this.debugMode = settings.debug ?? true;
  this.catchProgramErrors = settings.catchProgramErrors ?? (this.debugMode ? true : false);
  this.logarithmicDepthBuffer = settings.logarithmicDepthBuffer ?? false;

  var frameNumber = 0;
  var time = 0;
  var lastUpdate;
  this.frameTime = 1 / 60;
  this.startTime = new Date();

  this.eventHandler = new EventHandler();

  this.mouse = {
    x: 0,
    y: 0,
    any: false,
    left: false,
    right: false,
    middle: false,
    movement: {x: 0, y: 0},
    scroll: {x: 0, y: 0, z: 0},
  };
  var keys = [];
  var keysDown = [];
  var keysUp = [];

  this.currentScene = 0;
  this.scenes = [];

  /** @type {PostProcessing} */
  this.postprocessing = null;

  /** @type {Skybox} */
  this.skybox = null;

  /** @type {ShadowCascades} */
  this.shadowCascades = null;

  // var materialTextureUnitOffset = 3;
  var diffuseCubemapUnit = 2;
  var specularCubemapUnit = 1;
  var splitsumUnit = 0;

  // var blankTexture;

  this.UBOLocationCounter = 0;

  this.currentBoundLitPrograms = new WeakMap();
  this.currentBoundMaterials = new WeakMap();

  var _programContainers = {};
  this.programContainers = {
    get skybox() { return _getProgramContainer(skyboxSource, "skybox"); },

    get shadow() { return _getProgramContainer(shadowSource, "shadow"); },
    get shadowInstanced() { return _getProgramContainer(shadowSource, "shadowInstanced"); },
    get shadowSkinned() { return _getProgramContainer(shadowSource, "shadowSkinned"); },

    get equirectangularToCubemap() { return _getProgramContainer(equirectangularToCubemapSource, "equirectangularToCubemap"); },
    get diffuseCubemap() { return _getProgramContainer(diffuseCubemapSource, "diffuseCubemap"); },
    get specularCubemap() { return _getProgramContainer(specularCubemapSource, "specularCubemap"); },

    get lit() { return _getProgramContainer(litSource, "lit"); },
    get litSkinned() { return _getProgramContainer(litSource, "litSkinned"); },
    get litInstanced() { return _getProgramContainer(litSource, "litInstanced"); },
    get litTrail() { return _getProgramContainer(litSource, "litTrail"); },
    get unlit() { return _getProgramContainer(unlitSource, "unlit"); },
    get unlitInstanced() { return _getProgramContainer(unlitSource, "unlitInstanced"); },
    get particle() { return _getProgramContainer(particleSource, "particle"); },
    get billboard() { return _getProgramContainer(billboardSource, "billboard"); },
  };

  var currentProgram = null;
  var currentClearColor;
  var cullingEnabled = true;

  var errorEnums;

  var _settings = {
    enableShadows: true,
    enablePostProcessing: true,
    loadTextures: true
  };

  this.settings = {
    get enableShadows() { return _settings.enableShadows; },
    set enableShadows(val) {
      _settings.enableShadows = val;
      if (!val) {
        renderer.shadowCascades.clearShadowmaps();
      }
    },
    
    get enablePostProcessing() { return _settings.enablePostProcessing; },
    set enablePostProcessing(val) { _settings.enablePostProcessing = val; },

    get loadTextures() { return _settings.loadTextures; },
    set loadTextures(val) { _settings.loadTextures = val; },
  };

  this.setupSettings = null;

  this.renderpipeline = null;

  // Stats
  let drawCalls = 0;
  // let glFunctions;
  // let functionCallStats = {};

  /*

    Public methods

  */

  this.setup = function(settings = {}) {
    this.setupSettings = settings;
    this.path = settings.path ?? "./";

    /** @type {HTMLCanvasElement} */
    this.canvas = settings.canvas ?? document.body.appendChild(document.createElement("canvas"));
    setCanvasSize();

    this.version = settings.version ?? 2;
    if (!(this.version === 1 || this.version === 2)) {
      throw new Error("Invalid WebGL version: " + this.version);
    }

    var webglString = "webgl" + (this.version == 2 ? "2" : "");
    var webglSettings = {
      antialias: false,//true,
      premultipliedAlpha: false
      // alpha: false
    };

    gl = this.gl = this.canvas.getContext(webglString, webglSettings);
    if (!this.gl) {
      if (this.version == 2 && !("version" in settings)) {
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

    console.info("Using Webgl version " + this.version);

    // Stats
    // const getMethods = (obj) => {
    //   let properties = new Set()
    //   let currentObj = obj
      
    //   do {
    //     Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
    //   } while ((currentObj = Object.getPrototypeOf(currentObj)))
      
    //   return [...properties.keys()].filter(item => typeof obj[item] === 'function')
    // };

    // glFunctions = getMethods(gl);
    // for (let glFunction of glFunctions) {
    //   extendFunction(gl, glFunction, () => {
    //     if (!(glFunction in functionCallStats)) {
    //       functionCallStats[glFunction] = 0;
    //     }

    //     functionCallStats[glFunction]++;
    //   });
    // }

    let logDrawCall = function() {
      drawCalls++;
    };

    extendFunction(gl, "drawElements", logDrawCall);
    extendFunction(gl, "drawArrays", logDrawCall);
    extendFunction(gl, "drawElementsInstanced", logDrawCall);
    extendFunction(gl, "drawArraysInstanced", logDrawCall);

    function extendFunction(parent, func, extFunc) {
      var oldF = parent[func];
      parent[func] = extendF;
      function extendF() {
        extFunc(...arguments);
        return oldF.call(parent, ...arguments);
      }
      
      return oldF;
    }

    this.canvas.addEventListener("webglcontextlost", () => {
      console.error("WebGL context lost!");
      this.eventHandler.fireEvent("contextlost");
    });

    this.canvas.addEventListener("mousedown", e => {
      this.mouse.any = true;
      this.mouse[["left", "middle", "right"][e.button]] = true;
      this.eventHandler.fireEvent("mousedown", e);
    });

    document.addEventListener("mouseup", e => {
      this.mouse.any = e.buttons !== 0;
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
    };

    this.canvas.addEventListener("wheel", event => {
      this.mouse.scroll.x = event.deltaX;
      this.mouse.scroll.y = event.deltaY;
      this.mouse.scroll.z = event.deltaZ;

      this.eventHandler.fireEvent("scroll", event);
    });

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
      refreshSizes();
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

    this.EXT_texture_filter_anisotropic = (
      this.getExtension("EXT_texture_filter_anisotropic") ||
      this.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
      this.getExtension("WEBKIT_EXT_texture_filter_anisotropic")
    );
    this.MAX_ANISOTROPY = gl.getParameter(this.EXT_texture_filter_anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);

    if (this.version == 2) {
      this.getExtension("OES_texture_float_linear");
      this.getExtension("EXT_color_buffer_float");
      this.getExtension("EXT_float_blend");
      this.floatTextures = true;
    }
    else if (this.version == 1) {
      this.getExtension("OES_element_index_uint");
      this.getExtension("OES_standard_derivatives");
      this.getExtension("EXT_shader_texture_lod");

      this.floatTextures = this.getExtension("OES_texture_float");
      this.floatTextures = this.floatTextures && this.getExtension("WEBGL_color_buffer_float");
      this.getExtension("OES_texture_float_linear");
      this.getExtension("EXT_float_blend");

      this.colorBufferHalfFloatExt = this.getExtension("EXT_color_buffer_half_float");
      this.textureHalfFloatExt = this.getExtension("OES_texture_half_float");

      this.getExtension("WEBGL_depth_texture");
      this.sRGBExt = this.getExtension("EXT_sRGB");
      this.VAOExt = this.getExtension("OES_vertex_array_object");
      this.instanceExt = this.getExtension("ANGLE_instanced_arrays");
    }

    this.gl.enable(this.gl.DEPTH_TEST);

    cullingEnabled = true;
    this.gl.enable(this.gl.CULL_FACE);

    this.gl.cullFace(this.gl.BACK);
    // this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    clearColor(...(settings.clearColor ?? [0, 0, 0, 1]));

    // this.blankTexture = blankTexture = this.gl.createTexture();
    // this.gl.bindTexture(this.gl.TEXTURE_2D, blankTexture);
    // this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array([255, 25, 255, 255]));

    gl.getError(); // Clear errors

    if (settings.renderpipeline != null) {
      if (settings.renderpipeline == ENUMS.RENDERPIPELINE.FORWARD) {
        this.renderpipeline = new ForwardPBRRenderpipeline(this);
      }
      else if (settings.renderpipeline == ENUMS.RENDERPIPELINE.DEFERRED) {
        this.renderpipeline = new DeferredPBRRenderpipeline(this);
      }
      else {
        throw new Error("Unknown renderpipeline: " + settings.renderpipeline);
      }
    }
    else {
      // this.renderpipeline = new DeferredPBRRenderpipeline(this);
      this.renderpipeline = new ForwardPBRRenderpipeline(this);
    }

    this.shadowCascades = new ShadowCascades(
      {
        basic: this.programContainers.shadow,
        instanced: this.programContainers.shadowInstanced,
        skinned: this.programContainers.shadowSkinned,
      },
      settings.shadowSizes ?? [32, 128],
      settings.shadowBiases ?? [2, 2],
      settings.shadowResolution ?? 1024
    );
    logGLError("Shadow cascades");

    this.postprocessing = new PostProcessing();
    logGLError("Post processing");

    this.gizmos = new Gizmos();

    this.skybox = new Skybox(this.programContainers.skybox);
    logGLError("Skybox");

    this.splitsumTexture = this.loadSplitsum(this.path + "assets/pbr/splitsum.png");
    logGLError("Splitsum");

    this.ditherTexture = this.loadTexture(this.path + "assets/textures/dither.png");
    logGLError("Dither");

    lastUpdate = performance.now();
    requestAnimationFrame(loop);
  };

  function loop() {
    const ft = renderer.frameTime = getFrameTime();
    time += ft;

    // Stats
    drawCalls = 0;

    // for (let glFunction of glFunctions) {
    //   functionCallStats[glFunction] = 0;
    // }

    renderer.eventHandler.fireEvent("renderloop", ft, time, frameNumber);

    let drawCallsSpan = document.querySelector("#debug_drawCalls");
    if (drawCallsSpan) {
      drawCallsSpan.textContent = drawCalls;
    }

    // let sortable = [];
    // for (let value in functionCallStats) {
    //   sortable.push([ value, functionCallStats[value] ]);
    // }
    // sortable.sort(function(a, b) {
    //   return b[1] - a[1];
    // });
    // console.info(sortable);

    frameNumber++;
    requestAnimationFrame(loop);
  }

  function getFrameTime() {
    var now = performance.now();
    var frameTime = (now - lastUpdate) / 1000;
    lastUpdate = now;
  
    return frameTime;
  }

  this.getTime = function() {
    return time;
  };

  this.setRenderScale = function(rs) {
    renderScale = rs;
    refreshSizes();
  };

  this.getRenderScale = function() {
    return renderScale;
  };

  this.setCanvasSize = function(width, height) {
    if (width === -1) {
      delete this.setupSettings.width;
    }
    else {
      this.setupSettings.width = width;
    }

    if (height === -1) {
      delete this.setupSettings.height;
    }
    else {
      this.setupSettings.height = height;
    }
    
    refreshSizes();
  };

  function refreshSizes() {
    setCanvasSize();
    if (renderer.postprocessing) renderer.postprocessing.resizeFramebuffers();

    renderer.eventHandler.fireEvent("resize");
  }

  function setCanvasSize() {
    var settings = renderer.setupSettings;
    
    var devicePixelRatio = renderScale * (window.devicePixelRatio || 1);

    renderer.canvas.width = (settings.width ?? innerWidth) * devicePixelRatio;
    renderer.canvas.height = (settings.height ?? innerHeight) * devicePixelRatio;
    renderer.canvas.style.width = (settings.width ?? innerWidth) + "px";
    renderer.canvas.style.height = (settings.height ?? innerHeight) + "px";
  }

  this.update = function(frameTime) {
    const scene = this.getActiveScene();
    if (!scene) {
      throw new Error("No active scene");
    }

    scene.update(frameTime);
  };

  this.render = function(camera, secondaryCameras = null, settings = {}) {
    const scene = this.getActiveScene();
    if (!scene) {
      throw new Error("No active scene");
    }

    this.renderpipeline.render(camera, secondaryCameras, scene, settings);
  };

  Object.defineProperty(this, "aspect", {
    get: function() {
      return gl.canvas.clientWidth / gl.canvas.clientHeight;
    }
  });

  /**
   * @description Add scene to renderer
   * @param {Scene} scene
   * @returns {Scene}
  **/
  this.add = function(scene) {
    this.scenes.push(scene);
    scene.renderer = this;
    scene.setupUBO();
    return scene;
  };

  this.on = function(event, func) {
    this.eventHandler.addEvent(event, func);
  };

  /**
   * @description Get currently active scene
   * @returns {Scene}
   */
  this.getActiveScene = function() {
    return this.scenes[this.currentScene];
  };

  /**
   * Activate scene
   * @param {Scene} scene New active scene
   */
  this.setActiveScene = function(scene) {
    this.shadowCascades.clearShadowmaps();

    if (typeof scene == "number") {
      if (scene < 0 || scene >= this.scenes.length) {
        throw new Error("Scene index outside valid range (0-" + (this.scenes.length - 1) + "): " + scene);
      }
      this.currentScene = scene;
    }
    else if (scene instanceof Scene) {
      var index = this.scenes.indexOf(scene);
      if (index == -1) {
        console.error(scene);
        throw new Error("Scene has not been added to renderer");
      }

      this.currentScene = index;
    }
    else {
      console.error("Trying to set active scene:", scene);
      throw new Error("Scene not valid");
    }
  };

  /*

    Canvas helper
  
  */
  // #region Canvas helper

  this.disableContextMenu = function() {
    renderer.canvas.addEventListener("contextmenu", function(e) {
      e.preventDefault();
    });
  };

  this.disablePinchToZoom = function() {
    document.addEventListener("touchmove", function(event) {
      if (event.scale !== 1) {
        event.preventDefault();
      }
    }, { passive: false });
  };

  this.isPointerLocked = function() {
    return document.pointerLockElement === this.canvas || document.mozPointerLockElement === this.canvas;
  };

  this.lockPointer = function() {
    this.canvas.requestPointerLock = this.canvas.requestPointerLock || this.canvas.mozRequestPointerLock;
    this.canvas.requestPointerLock();
  };

  this.unlockPointer = function() {
    document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;
    document.exitPointerLock();
  };

  this.getKey = function(key) {
    return !!keys[key];
  };

  this.getKeyDown = function(key, uniqueID = "") {
    if (this.getKey(key)) {
      if (keysDown[key + uniqueID]) {
        keysDown[key + uniqueID] = false;
        return true;
      }
    }
    else {
      keysDown[key + uniqueID] = true;
    }

    return false;
  };

  this.getKeyUp = function(key, uniqueID = "") {
    if (!this.getKey(key)) {
      if (keysUp[key + uniqueID]) {
        keysUp[key + uniqueID] = false;
        return true;
      }
    }
    else {
      keysUp[key + uniqueID] = true;
    }

    return false;
  };

  this.saveCanvasAsImage = function(name) {
    saveCanvasAsImage(this.canvas, name);
  };
  // #endregion Canvas helper

  /*
  
    PBR environment
  
  */
  // #region PBR environment

  this.createCubemapFromHDR = async function(path, res = 1024, gamma = 1) {
    var hdr = await LoadHDR(path, 1, gamma);
    if (hdr === null) {
      throw new Error("Could not load HDR: " + path);
    }

    var pixelData = hdr.data;
    if (!this.floatTextures) {
      throw new Error("Half float not currently supported");

      // if (renderer.textureHalfFloatExt) {
      //   pixelData = Float32ToFloat16(pixelData);
      // }
      // else {
      //   var exposure = 2;
      //   pixelData = new Uint8Array(hdr.data.length);
      //   for (let i = 0; i < hdr.data.length; i++) {
      //     pixelData[i] = Math.min(255, Math.pow(hdr.data[i] / (hdr.data[i] + 1) * exposure, 1 / 2.2) * 255);
      //   }
      // }
    }
  
    var hdrTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, hdrTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, hdr.width, hdr.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
    // gl.texImage2D(gl.TEXTURE_2D, 0, this.version == 1 ? gl.RGBA : gl.RGBA32F, hdr.width, hdr.height, 0, gl.RGBA, getFloatTextureType(), pixelData);
    // gl.texImage2D(gl.TEXTURE_2D, 0, this.version == 1 ? gl.RGB : gl.RGB32F, hdr.width, hdr.height, 0, gl.RGB, getFloatTextureType(), pixelData);
  
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
    // var hdrCubeMat = new Material(this.programContainers.equirectangularToCubemap, {
    //   "equirectangularMap": {type: "1i", name: "equirectangularMap", texture: true, arguments: [0]}
    // }, [{type: gl.TEXTURE_2D, texture: hdrTexture}]);
    // hdrCubeMat.doubleSided = true;

    var hdrCubeMat = new NewMaterial(
      this.programContainers.equirectangularToCubemap,
      { "equirectangularMap": hdrTexture }
    );
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
  
    for (let i = 0; i < 6; i++) {
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
    renderer.disableCulling();
    // gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, res, res);
  
    for (let i = 0; i < 6; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cubemap, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      this.currentBoundLitPrograms = new WeakMap();

      hdrCube.render({
        projectionMatrix: perspectiveMatrix,
        viewMatrix: views[i],
        inverseViewMatrix: Matrix.inverse(views[i])
      });
    }

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

    renderer.enableCulling();
    // gl.enable(gl.CULL_FACE);
  
    return cubemap;
  };

  this.createSpecularCubemapFromHDR = async function(folder, res = 1024, gamma = 1) {
    var maxMipmapLevels = 5;
    var hdrs = [];
    var framebuffers = [];
    
    for (let i = 0; i < maxMipmapLevels; i++) {
      var hdr = await LoadHDR(folder + "/specular_mip_" + i + ".hdr", 1, gamma);

      var pixelData = hdr.data;
      if (!this.floatTextures) {
        if (renderer.textureHalfFloatExt) {
          pixelData = Float32ToFloat16(pixelData);
        }
        else {
          var exposure = 2;
          pixelData = new Uint8Array(hdr.data.length);
          for (let j = 0; j < hdr.data.length; j++) {
            pixelData[j] = Math.min(255, Math.pow(hdr.data[j] / (hdr.data[j] + 1) * exposure, 1 / 2.2) * 255);
          }
        }
      }

      var hdrTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, hdrTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, hdr.width, hdr.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
      // gl.texImage2D(gl.TEXTURE_2D, 0, this.version == 1 ? gl.RGBA : gl.RGBA32F, hdr.width, hdr.height, 0, gl.RGBA, getFloatTextureType(), pixelData);
      // gl.texImage2D(gl.TEXTURE_2D, 0, this.version == 1 ? gl.RGB : gl.RGB32F, hdr.width, hdr.height, 0, gl.RGB, getFloatTextureType(), pixelData);
    
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      hdrs.push({
        hdr,
        pixelData,
        hdrTexture
      });
    }
  
    // var hdrCubeMat = new Material(this.programContainers.equirectangularToCubemap, {
    //   "equirectangularMap": {type: "1i", name: "equirectangularMap", texture: true, arguments: [0]}
    // }, [{type: gl.TEXTURE_2D, texture: hdrTexture}]);
    // hdrCubeMat.doubleSided = true;

    var hdrCubeMat = new NewMaterial(
      this.programContainers.equirectangularToCubemap,
      { "equirectangularMap": hdrTexture }
    );
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

    var framebuffer;
    var depthBuffer;

    if (this.version != 1) {
      // Framebuffer
      framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    
      // Depth buffer
      depthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, res, res);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    }

    // Cubemap
    var cubemap = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
  
    for (let i = 0; i < 6; i++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, this.version == 1 ? gl.RGBA : gl.RGBA32F, res, res, 0, gl.RGBA, getFloatTextureType(), null);
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
    renderer.disableCulling();
    // gl.disable(gl.CULL_FACE);
  
    for (var mip = 0; mip < maxMipmapLevels; mip++) {
      var currentRes = res * Math.pow(0.5, mip);

      if (this.version == 1) {
        framebuffers.push(createFramebuffer(currentRes, currentRes));
      }
      else {
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, currentRes, currentRes);
      }

      gl.viewport(0, 0, currentRes, currentRes);

      // hdrCubeMat.textures[0].texture = hdrs[mip].hdrTexture;
      hdrCubeMat.setUniform("equirectangularMap", hdrs[mip].hdrTexture);

      for (var i = 0; i < 6; i++) {
        if (this.version != 1) {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cubemap, mip);
        }

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.currentBoundLitPrograms = new WeakMap();

        hdrCube.render({
          projectionMatrix: perspectiveMatrix,
          viewMatrix: views[i],
          inverseViewMatrix: Matrix.inverse(views[i])
        });

        if (this.version == 1) {
          gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
          gl.copyTexSubImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, mip, 0, 0, 0, 0, currentRes, currentRes);
        }
      }
    }

    for (var framebufferData of framebuffers) {
      gl.deleteFramebuffer(framebufferData.framebuffer);
    }

    // gl.enable(gl.CULL_FACE);
    renderer.enableCulling();
  
    return cubemap;
  };
  
  this.getSpecularCubemap = async function(cubemap, res = 128) {
    // bruh
    if (!renderer.floatTextures && !renderer.textureHalfFloatExt) {
      console.warn("No support for float textures, returning same cubemap");
      return cubemap;
    }
  
    // var mat = new Material(this.programContainers.specularCubemap, {
    //   "environmentMap": {type: "1i", name: "environmentMap", texture: true, arguments: [0]},
    //   "roughness": {type: "1f", name: "roughness", arguments: [0]}
    // }, [{type: gl.TEXTURE_CUBE_MAP, texture: cubemap}]);
    // mat.doubleSided = true;

    var mat = new NewMaterial(this.programContainers.specularCubemap, {
      "environmentMap": cubemap,
      "roughness": 0
    });
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

    for (let i = 0; i < 6; i++) {
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
    renderer.disableCulling();
    // gl.disable(gl.CULL_FACE);
  
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
  
      for (let i = 0; i < 6; i++) {
        if (this.version != 1) {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, newCubemap, mip);
        }
        
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
        this.currentBoundLitPrograms = new WeakMap();

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

    renderer.enableCulling();
    // gl.enable(gl.CULL_FACE);
  
    return newCubemap;
  };
  
  this.getDiffuseCubemap = async function(cubemap) {
    var res = 32;
  
    // var mat = new Material(this.programContainers.diffuseCubemap, {
    //   "environmentMap": {type: "1i", name: "environmentMap", texture: true, arguments: [0]}
    // }, [{type: gl.TEXTURE_CUBE_MAP, texture: cubemap}]);

    var mat = new NewMaterial(
      this.programContainers.diffuseCubemap,
      { "environmentMap": cubemap }
    );
  
    return await this.createCubemapFromCube(mat, res);
  };
  
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

    var internalFormat = this.version == 1 ? gl.RGBA : gl.RGBA32F;
    var format = gl.RGBA;
  
    for (let i = 0; i < 6; i++) {
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, internalFormat, res, res, 0, format, getFloatTextureType(), null);
    }
  
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (gl.TEXTURE_WRAP_R) {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    }
  
    // Viewport
    renderer.disableCulling();
    // gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, res, res);
  
    for (let i = 0; i < 6; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, newCubemap, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
      this.currentBoundLitPrograms = new WeakMap();

      cube.render({
        projectionMatrix: perspectiveMatrix,
        viewMatrix: views[i],
        inverseViewMatrix: Matrix.inverse(views[i])
      });

      await sleep(200);
    }

    renderer.enableCulling();
    // gl.enable(gl.CULL_FACE);

    gl.deleteFramebuffer(framebuffer); // bruh this might break something :)
  
    return newCubemap;
  };

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
  
    for (let i = 0; i < 6; i++) {
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
  
    for (let i = 0; i < 6; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, newCubemap, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var camera = {
        projectionMatrix: projectionMatrix,
        viewMatrix: views[i],
        inverseViewMatrix: Matrix.inverse(views[i]),
        cameraMatrix: Matrix.inverse(views[i])
      };

      // bruh start
      var scene = this.scenes[this.currentScene];

      if (scene.skyboxVisible) {
        this.skybox.render(camera, scene.skyboxCubemap);
      }

      scene.updateUniformBuffers(camera.projectionMatrix, camera.viewMatrix, camera.inverseViewMatrix);

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
      // bruh end
    }
  
    return newCubemap;
  };

  this.saveSpecularCubemapAsHDR = async function(cubemap, mipmapLevels = 5, res = 128) {
    for (var i = 0; i < mipmapLevels; i++) {
      var currentRes = res * Math.pow(0.5, i);
      await this.saveCubemapAsHDR(cubemap, currentRes, i, "specular_mip_" + i);
    }
  };

  this.saveCubemapAsHDR = async function(cubemap, res = 512, mipmapLevel = 0, name = "cubemap") {
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
    // gl.disable(gl.CULL_FACE);
    renderer.disableCulling();
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

    gl.uniform1f(gl.getUniformLocation(program, "mipmapLevel"), mipmapLevel); // bruh please work

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    var pixels = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);

    CreateHDR(pixels, w, h, name);

    return true;
  };

  this.saveCubemapAsImages = async function(cubemap, res = 512) {
    const pc = new ProgramContainer(await this.createProgramFromFile("../assets/shaders/built-in/webgl2/cubemapVis"));
    const mat = new NewMaterial(pc, { "environmentMap": cubemap });
    mat.doubleSided = true;
  
    const cube = new GameObject("Cubemap", {
      meshRenderer: new MeshRenderer([mat], [new MeshData(getCubeData())]),
      castShadows: false
    });
  
    const perspectiveMatrix = Matrix.orthographic({size: 1});
    const views = [
      Matrix.inverse(Matrix.transform([["ry", -Math.PI / 2], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["ry",  Math.PI / 2], ["rz", Math.PI]])),

      Matrix.inverse(Matrix.transform([["rx", Math.PI / 2]])),
      Matrix.inverse(Matrix.transform([["rx", -Math.PI / 2]])),

      Matrix.inverse(Matrix.transform([["ry", Math.PI], ["rz", Math.PI]])),
      Matrix.inverse(Matrix.transform([["rz", Math.PI]])),
    ];
  
    // Viewport
    const oldWidth = this.canvas.width;
    const oldHeight = this.canvas.height;

    this.canvas.width = res;
    this.canvas.height = res;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    renderer.disableCulling();
    // gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, res, res);
  
    for (let i = 0; i < 6; i++) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      this.currentBoundLitPrograms = new WeakMap();

      cube.render({
        projectionMatrix: perspectiveMatrix,
        viewMatrix: views[i],
        inverseViewMatrix: Matrix.inverse(views[i])
      });
      saveCanvasAsImage(renderer.canvas, "cubemap" + i);
    }

    renderer.enableCulling();
    // gl.enable(gl.CULL_FACE);

    this.canvas.width = oldWidth;
    this.canvas.height = oldHeight;

    return true;
  };

  this.loadSplitsum = function(url) {
    return loadTexture(url, {
      // ...this.getSRGBFormats(), // <- looks better with / or not ....
      TEXTURE_MIN_FILTER: gl.LINEAR,
      TEXTURE_WRAP_S: gl.CLAMP_TO_EDGE,
      TEXTURE_WRAP_T: gl.CLAMP_TO_EDGE,
      // flipY: true // bruh... ._. is this it????
    });
  };
  // #endregion PBR environment

  /*
  
    Shaders
  
  */
  //#region Shaders

  this.loadTextFile = async function(path) {
    return await (await fetch(path, {
      mode: "cors",
      headers: {
        "Access-Control-Allow-Origin": "*"
      }
    })).text();
  };

  this.createProgramFromFile = async function(shaderPath, fragmentPathOpt) {
    let vertexPath = shaderPath + "/vertex.glsl";
    let fragmentPath = shaderPath + "/fragment.glsl";
    if (fragmentPathOpt != undefined) {
      vertexPath = shaderPath;
      fragmentPath = fragmentPathOpt;
    }
  
    const vertexSource = await this.loadTextFile(vertexPath);
    const fragmentSource = await this.loadTextFile(fragmentPath);

    return this.createProgram(vertexSource, fragmentSource);
  };

  this.createProgram = function(vertexSource, fragmentSource) {
    const vertexShader = compileShader(vertexSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);
  
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
  
    catchLinkErrors(program);
  
    return program;
  };

  function catchLinkErrors(program) {
    if (renderer.catchProgramErrors && !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      let errorMessage = "\nCould not compile WebGL program\n\nLink failed: " + gl.getProgramInfoLog(program);

      const shaders = gl.getAttachedShaders(program);
      for (const shader of shaders) {
        const error = gl.getShaderInfoLog(shader);
        const type = glEnumToString(gl.getShaderParameter(shader, gl.SHADER_TYPE));

        if (error) {
          errorMessage += "\n" + type + ":\n" + error;
        }

        const formattedSource = `\n${addLineNumbers(gl.getShaderSource(shader))}`;
        console.log(type, formattedSource);
      }

      throw new Error(errorMessage);
    }
  }

  function addLineNumbers(source) {
    return source.split("\n").map((line, index) => `${index + 1}\t${line}`).join("\n");
  }
  
  function compileShader(shaderSource, shaderType) {
    shaderSource = shaderSource.trim();

    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
  
    return shader;
  }

  this.updateVertexShader = function(programContainer, newSource) {
    const shaders = gl.getAttachedShaders(programContainer.program);
    const vertexShader = shaders[0];

    this.updateShader(vertexShader, programContainer, newSource);
  };

  this.updateFragmentShader = function(programContainer, newSource) {
    const shaders = gl.getAttachedShaders(programContainer.program);
    const fragmentShader = shaders[1];

    this.updateShader(fragmentShader, programContainer, newSource);
  };

  this.updateShader = function(shader, programContainer, newSource) {
    newSource = newSource.trim();

    gl.shaderSource(shader, newSource);
    gl.compileShader(shader);

    gl.linkProgram(programContainer.program);
    catchLinkErrors(programContainer.program);

    programContainer.updateUniformLocations();
  };

  class CustomProgram {
    constructor(shader) {
      const s = shader["webgl" + renderer.version] ?? shader;
      let vertex = s.vertex;
      let fragment = s.fragment;

      if (!vertex || !fragment) {
        console.error("Custom program does not have a vertex/fragment shader for version " + renderer.version);
        return;
      }

      [ vertex, fragment ] = injectLogDepth("", vertex, fragment);

      const program = renderer.createProgram(vertex, fragment);
      return new renderer.ProgramContainer(program);
    }
  }
  this.CustomProgram = CustomProgram;

  //#endregion Shaders

  /*
  
    GL helper
  
  */

  this.enableCulling = function() {
    if (cullingEnabled !== true) {
      this.gl.enable(this.gl.CULL_FACE);
      cullingEnabled = true;
    }
  };

  this.disableCulling = function() {
    if (cullingEnabled !== false) {
      this.gl.disable(this.gl.CULL_FACE);
      cullingEnabled = false;
    }
  };

  this.getExtension = function(name) {
    const e = this.gl.getExtension(name);
    if (!e) {
      console.error("Could not get extension: " + name);
      return false;
    }
    return e;
  };

  this.getFloatTextureType = getFloatTextureType;
  function getFloatTextureType() {
    if (renderer.floatTextures) {
      return gl.FLOAT;
    }

    if (renderer.textureHalfFloatExt) {
      return renderer.textureHalfFloatExt.HALF_FLOAT_OES;
    }

    return gl.UNSIGNED_BYTE;
  }

  this.getSRGBFormats = function() {
    const sRGBInternalFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.SRGB8_ALPHA8;
    const sRGBFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.RGBA;

    return {
      internalFormat: sRGBInternalFormat,
      format: sRGBFormat
    };
  };

  this.createFramebuffer = createFramebuffer;
  function createFramebuffer(currentWidth, currentHeight, settings = {}) {
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    const colorBuffer = gl.createTexture();
    // gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorBuffer);
    gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, currentWidth, currentHeight, 0, gl.RGBA, getFloatTextureType(), null);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorBuffer, 0);

    const depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, settings.depthComponent ?? gl.DEPTH_COMPONENT16, currentWidth, currentHeight);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

    return {
      framebuffer,
      colorBuffer,
      depthBuffer,
      width: currentWidth,
      height: currentHeight
    };
  }

  this.createBuffer = createBuffer;
  function createBuffer(data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) {
    const buffer = gl.createBuffer();
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

  this.setClearColor = clearColor;
  function clearColor(r, g, b, a) {
    currentClearColor = [r, g, b, a];
    gl.clearColor(r, g, b, a);
  }

  function getUniformSetType(type) {
    if (type == "FLOAT") {
      return "1f";
    }

    let m = type.match(/FLOAT_VEC([0-9])/);
    if (m) {
      return m[1] + "f";
    }

    if (type == "INT" || type == "UNSIGNED_INT" || type == "BOOL" || type.indexOf("SAMPLER") !== -1) {
      return "1i";
    }

    m = type.match(/(?:INT|BOOL)_VEC([0-9])/);
    if (m) {
      return m[1] + "i";
    }

    m = type.match(/FLOAT_MAT([0-9]x?[0-9]?)/);
    if (m) {
      return "Matrix" + m[1] + "fv";
    }

    throw new Error("Invalid uniform type string: " + type);
  }

  const storedEnums = {};
  function glEnumToString(value) {
    const e = storedEnums[value];
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

  function _getProgramContainer(source, name) {
    if (!source) {
      throw new Error("Source cannot be undefined");
    }

    if (name == null) {
      throw new Error("Programcontainers must have a name");
    }

    if (!(name in _programContainers)) {
      console.log("Loading program:", name);

      /** @type {String} */
      let vertex;
      /** @type {String} */
      let fragment;

      if (source.vertex && source.fragment) {
        vertex = source.vertex;
        fragment = source.fragment;
      }
      else if (source["webgl" + renderer.version][name]) {
        const p = source["webgl" + renderer.version][name];
        vertex = p.vertex;
        fragment = p.fragment;
      }
      else {
        console.error(`Program '${name}' not found for version ${renderer.version}!`);
        _programContainers[name] = undefined;
        return;
      }

      // Inject log depth handling into shaders
      [ vertex, fragment ] = injectLogDepth(name, vertex, fragment);

      const program = renderer.createProgram(vertex, fragment);
      _programContainers[name] = new ProgramContainer(program);
    }
    
    return _programContainers[name];
  }

  /**
   * Injects shader code for logarithmic depth
   * @param {string} name 
   * @param {string} vertex 
   * @param {string} fragment 
   * @returns [string, string]
   */
  function injectLogDepth(name, vertex, fragment) {
    if (!renderer.logarithmicDepthBuffer) {
      return [ vertex, fragment ];
    }

    if (
      name === "shadow" ||
      name === "shadowInstanced" ||
      name === "shadowSkinned" ||
      name === "skybox" ||
      name === "equirectangularToCubemap"
    ) {
      return [ vertex, fragment ];
    }

    const mainRegex = /void\s+main\s*\(\s*\)\s*{/;
    const mainEndRegex = /\{(?:[^}{]|\{(?:[^}{]|\{(?:[^}{]|\{[^}{]*\})*\})*\})*\}/; // Matches balanced curly brackets
    
    {
      const findMain = mainRegex.exec(vertex);
      if (!findMain) {
        console.warn("Could not inject log depth");
      }
      else {
        const mainBeginIndex = findMain.index;

        let v = vertex.slice(mainBeginIndex); // Remove everyting before void main
        v = v.split("\n").map(s => s.replace(/\s*\/\/.*/g, "")).join("\n"); // Remove comments
        const findEndMain = mainEndRegex.exec(v);
        
        if (!findEndMain) {
          console.warn("Could not find end of main");
        }
        else {
          const endOfMainIndex = findEndMain.index + findEndMain[0].length - 1;
          vertex = vertex.slice(0, mainBeginIndex) + `${vertexLogDepth}` + v.slice(0, endOfMainIndex) + `${vertexLogDepthMain}` + v.slice(endOfMainIndex);

          // console.log(vertex);
        }

      }
    }

    {
      const findMain = mainRegex.exec(fragment);
      if (!findMain) {
        console.warn("Could not inject log depth");
      }
      else {
        const startIndex = findMain.index;
        const endIndex = startIndex + findMain[0].length;
        fragment = fragment.slice(0, startIndex) + `${fragmentLogDepth}\n\nvoid main() {\n${fragmentLogDepthMain}\n\n` + fragment.slice(endIndex);
      }
    }

    return [ vertex, fragment ];
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
    const error = gl.getError();
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

    var _emitNormal = Vector.up();
    Object.defineProperty(this, "emitNormal", {
      get: function() {
        return _emitNormal;
      },
      set: function(v) {
        Vector.set(_emitNormal, v);
      }
    });

    var _emitPosition = Vector.zero();
    var _useEmitPosition = false;
    Object.defineProperty(this, "emitPosition", {
      get: function() {
        return _emitPosition;
      },
      set: function(v) {
        Vector.set(_emitPosition, v);
        _useEmitPosition = true;
      }
    });

    this.emit = true;
    this.width = 0.13; // bruh, can kinda be changed during runtime
    this.maxVertices = 500; // bruh, can not be changed after creating trail
    this.minDistance = 0.05;
    this.uvOriginAtStart = true;
    
    var uvOffset = 0;

    var trailData = new Array(this.maxVertices);
    for (let i = 0; i < trailData.length; i++) {
      trailData[i] = {
        position: Vector.zero(),
        normal: Vector.up(),
        distance: 0,
        alpha: 1,
      };
    }
    var trailDataIndex = 0;
    var indicesUsed = 0;

    var vertices = new Float32Array(this.maxVertices * 2 * 3);
    // var normals = new Float32Array(this.maxVertices * 2 * 3);
    var uvs = new Float32Array(this.maxVertices * 2 * 2);
    var alphas = new Float32Array(this.maxVertices * 2 * 1);

    var meshData = new MeshData({
      position: {
        bufferData: vertices,
        size: 3
      },
      // normal: {
      //   bufferData: normals,
      //   size: 3
      // },
      uv: {
        bufferData: uvs,
        size: 2
      },
      alpha: {
        bufferData: alphas,
        size: 1
      }
    });

    var material = CreateLitMaterial({
      metallic: 1,
      albedo: [0.003, 0.003, 0.003, 1],
      albedoTexture: loadTexture(renderer.path + "assets/textures/skidmarksSoft2.png"),
      alphaCutoff: 0,
    }, renderer.programContainers.litTrail);
    material.opaque = false;

    var meshRenderer = new MeshRenderer(material, meshData);
    meshRenderer.drawMode = gl.TRIANGLE_STRIP;

    // Object pool
    var _identity = Matrix.identity();
    var _tangent = new Vector();
    var _quat = new Quaternion();
    var _currentEmitPos = Vector.zero();

    var addSegment = () => {
      // Find position of new point
      if (_useEmitPosition) {
        Vector.set(_currentEmitPos, _emitPosition);
      }
      else {
        Matrix.getPosition(this.gameObject.transform.worldMatrix, _currentEmitPos);
      }

      // Find last position (wrap around if needed)
      var lastTrailData = trailDataIndex <= 0 ?
        trailData[trailData.length - 1] :
        trailData[trailDataIndex - 1];

      // Discard new point if too close to last point
      var distSqr = Vector.distanceSqr(lastTrailData.position, _currentEmitPos);
      if (distSqr < this.minDistance * this.minDistance) {
        return false;
      }

      // Calculate trail tangent
      var dist = Math.sqrt(distSqr);
      Vector.set(_tangent, lastTrailData.position);
      Vector.subtractTo(_tangent, _currentEmitPos);
      Vector.divideTo(_tangent, dist);

      // Rotate tangent to get normal
      var thisTrailData = trailData[trailDataIndex];
      var normal = thisTrailData.normal;
      Quaternion.angleAxis(Math.PI / 2, _tangent, _quat);
      Quaternion.QxV(_quat, _emitNormal, normal);
      Vector.multiplyTo(normal, this.width);

      // Set data for new point
      Vector.set(thisTrailData.position, _currentEmitPos);
      thisTrailData.distance = lastTrailData.distance + dist;
      thisTrailData.alpha = this.emit;

      // Offset UVs
      uvOffset += dist;

      // Go to next index (wrap around if needed)
      trailDataIndex++;
      if (trailDataIndex >= trailData.length) {
        trailDataIndex = 0;
      }

      // Note how many of the indices are used
      indicesUsed++;
      indicesUsed = Math.min(indicesUsed, this.maxVertices);

      return true;
    };

    const shiftLeft = (collection, steps = 1) => {
      collection.set(collection.subarray(steps));
      collection.fill(0, -steps);
      return collection;
    };

    this.update = function(/*dt*/) {
      if (addSegment()) {
        shiftLeft(vertices, 6);
        shiftLeft(uvs, 4);
        shiftLeft(alphas, 2);

        let currentDataIndex = wrap(trailDataIndex - 1, trailData.length);
        let td = trailData[currentDataIndex];

        let pos = td.position;
        let normal = td.normal;
        
        let i = this.maxVertices - 1;

        // Calculate edge vertices of trail
        vertices[i * 6 + 0] = pos.x + normal.x;
        vertices[i * 6 + 1] = pos.y + normal.y;
        vertices[i * 6 + 2] = pos.z + normal.z;

        vertices[i * 6 + 3] = pos.x - normal.x;
        vertices[i * 6 + 4] = pos.y - normal.y;
        vertices[i * 6 + 5] = pos.z - normal.z;

        let dist = td.distance;
        let u = this.uvOriginAtStart ? dist : uvOffset - dist;
        uvs[i * 4 + 0] = u;
        uvs[i * 4 + 1] = 1;
        uvs[i * 4 + 2] = u;
        uvs[i * 4 + 3] = 0;

        // let alpha = td.alpha;
        // alpha = clamp(alpha, 0, 1);
        // // alpha *= i / (indicesUsed - 1);

        // alphas[i * 2 + 0] = alpha;
        // alphas[i * 2 + 1] = alpha;

        for (let i = this.maxVertices - 1; i >= 0; i--) {
          let currentDataIndex = wrap(trailDataIndex - this.maxVertices + i, trailData.length);
          let td = trailData[currentDataIndex];

          let alpha = td.alpha;
          alpha = clamp(alpha, 0, 1);
          alpha *= i / (this.maxVertices - 1);

          let j = i;
          alphas[j * 2 + 0] = alpha;
          alphas[j * 2 + 1] = alpha;
        }
      }

      // addSegment();

      // for (let i = 0; i < this.maxVertices; i++) {
      //   let currentDataIndex = wrap(trailDataIndex - indicesUsed + Math.min(i, indicesUsed - 1), trailData.length);
      //   let td = trailData[currentDataIndex];

      //   let pos = td.position;
      //   let normal = td.normal;

      //   // Calculate edge vertices of trail
      //   vertices[i * 6 + 0] = pos.x + normal.x;
      //   vertices[i * 6 + 1] = pos.y + normal.y;
      //   vertices[i * 6 + 2] = pos.z + normal.z;

      //   vertices[i * 6 + 3] = pos.x - normal.x;
      //   vertices[i * 6 + 4] = pos.y - normal.y;
      //   vertices[i * 6 + 5] = pos.z - normal.z;

      //   let dist = td.distance;
      //   let u = this.uvOriginAtStart ? dist : uvOffset - dist;
      //   uvs[i * 4 + 0] = u;
      //   uvs[i * 4 + 1] = 1;
      //   uvs[i * 4 + 2] = u;
      //   uvs[i * 4 + 3] = 0;

      //   let alpha = td.alpha;
      //   alpha = clamp(alpha, 0, 1);
      //   alpha *= i / (indicesUsed - 1);

      //   alphas[i * 2 + 0] = alpha;
      //   alphas[i * 2 + 1] = alpha;
      // }

      // Update gl buffers with the new data
      // let usage = gl.DYNAMIC_DRAW; // I thought dynamic draw should be used but stream seems better according to https://www.reddit.com/r/opengl/comments/57i9cl/comment/d8s8wnq/?utm_source=share&utm_medium=web2x&context=3
      let usage = gl.STREAM_DRAW;

      gl.bindBuffer(gl.ARRAY_BUFFER, meshData.buffers[0].buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, usage, (this.maxVertices - indicesUsed) * 6);

      gl.bindBuffer(gl.ARRAY_BUFFER, meshData.buffers[1].buffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, usage, (this.maxVertices - indicesUsed) * 4);

      gl.bindBuffer(gl.ARRAY_BUFFER, meshData.buffers[2].buffer);
      gl.bufferData(gl.ARRAY_BUFFER, alphas, usage, (this.maxVertices - indicesUsed) * 2);
    };

    this.render = function(camera, matrix, shadowPass = false, opaquePass = true) {
      if (!shadowPass) {
        if (material.programContainer === null) {
          return;
        }

        if (material.isOpaque() != opaquePass) {
          return;
        }
  
        useProgram(material.programContainer.program);
        meshData.bindBuffers(material.programContainer);

        bindMaterial(material, {
          camera,
          modelMatrix: _identity,
          prevViewMatrix: camera.prevViewMatrix,
          shadowPass,
        });

        if (!shadowPass && renderer.shadowCascades) {
          renderer.shadowCascades.setUniforms(material);
        }
  
        setMaterialCulling(material, shadowPass);
        // meshData.drawCall(gl.TRIANGLE_STRIP);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, indicesUsed * 2);

        // meshRenderer.render(camera, _identity, shadowPass, opaquePass);
      }
    };
  }

  this.ParticleSystem = ParticleSystem;
  function ParticleSystem(maxParticles = 200, md) {
    var system = this;

    this.maxParticles = maxParticles;

    this.drawOnDownscaledFramebuffer = false;

    this.drawMode = gl.TRIANGLES;
    this.material = null;
    this.meshData = md ?? getParticleMeshData();

    this.particles = new Array(this.maxParticles);
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i] = new Particle(new Vector(0, -1000, 0));
    }
    var pool = [];

    this.matrixData = new Float32Array(this.maxParticles * 16);
    for (let i = 0; i < this.maxParticles; i++) {
      this.matrixData.set(this.particles[i].matrix, i * 16);
    }

    this.colorData = new Float32Array(this.maxParticles * 4);
    // var d = new Float32Array(1, 0, 0, 1);
    for (let i = 0; i < this.colorData.length; i++) {
      this.colorData[i] = 1;
    }

    this.matrixBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.matrixData, gl.DYNAMIC_DRAW);

    this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.colorData, gl.DYNAMIC_DRAW);

    var cameraPos = Vector.zero();
    this.orientation = "faceVelocity";
    this.localParticles = true;

    this.alpha = 1;
    this.startSize = (dst) => {
      dst.x = 0.6 * (Math.random() * 0.8 + 0.2);
      dst.y = 0.15 * (Math.random() * 0.4 + 0.6);
      dst.z = 1;
      return dst;
    };
    this.endSize = (dst) => Vector.zero(dst);
    this.emitPosition = (dst) => Vector.zero(dst);
    this.emitVelocity = (dst) => Vector.zero(dst);
    this.emitHealth = 0.5;

    this.alphaCurve = new LerpCurve();
    this.alphaCurve.addStage(0, 1);
    this.alphaCurve.addStage(0.8, 1);
    this.alphaCurve.addStage(1, 0);

    this.wind = (dst) => {
      dst.x = (Math.random() - 0.45) * 10;
      dst.y = 0;
      dst.z = (Math.random() - 0.45) * 10;
      return dst;
    };
    this.drag = 1;
    this.gravityScale = 1;

    const zeroMatrix = new Matrix();
    const _p = new Vector();

    this.emit = function(amount = 1) {
      for (var i = 0; i < amount; i++) {
        if (pool.length > 0) {
          var p = pool.shift();
          p.active = true;
          
          p.health = p.maxHealth = this.emitHealth;
          p.alpha = this.alpha;

          system.emitPosition(_p);
          Vector.set(p.position, _p);

          system.emitVelocity(_p);
          Vector.set(p.velocity, _p);

          system.startSize(_p);
          Vector.set(p.startSize, _p);

          system.endSize(_p);
          Vector.set(p.endSize, _p);

          // p.position = Vector.copy(typeof system.emitPosition == "function" ? system.emitPosition() : system.emitPosition);
          // p.velocity = Vector.copy(typeof system.emitVelocity == "function" ? system.emitVelocity() : system.emitVelocity);
          // p.startSize = Vector.copy(typeof system.startSize == "function" ? system.startSize() : system.startSize);
          // p.endSize = Vector.copy(typeof system.endSize == "function" ? system.endSize() : system.endSize);
        }
        else {
          break;
        }
      }
    };

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
        else {
          this.matrixData.set(zeroMatrix, i * 16);
          this.colorData[i * 4 + 3] = 0;
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.matrixData, gl.DYNAMIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.colorData, gl.DYNAMIC_DRAW);
    };

    this.render = function(camera, baseMatrix, shadowPass = false, opaquePass = true, prevMatrix, settings = {}) {
      if (settings.downscaledPass != this.drawOnDownscaledFramebuffer) {
        return;
      }
      
      if (!opaquePass) {
        Matrix.getPosition(camera.cameraMatrix, cameraPos); // Bruh

        if (this.material == null) {
          this.material = CreateLitMaterial({
            albedoTexture: loadTexture(renderer.path + "assets/textures/bulletTrail.png"),
            albedo: [40, 10, 5, 1],
          }, renderer.programContainers.particle);
          this.material.doubleSided = true;
        }

        useProgram(this.material.programContainer.program);
        this.meshData.bindBuffers(this.material.programContainer);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
        const matrixLoc = this.material.programContainer.getAttribLocation("modelMatrix");
        for (var j = 0; j < 4; j++) {
          const loc = matrixLoc + j;
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 4 * 16, j * 16);
          vertexAttribDivisor(loc, 1);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        const loc = this.material.programContainer.getAttribLocation("color");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
        vertexAttribDivisor(loc, 1);

        // this.material.bindUniforms(camera);
        if (this.material instanceof NewMaterial) {
          bindMaterial(this.material, {
            camera,
            prevViewMatrix: camera.prevViewMatrix,
            shadowPass,
          });
        }
        else {
          this.material.bindUniforms(camera);
        }

        setMaterialCulling(this.material, shadowPass);
        drawElementsInstanced(this.drawMode, this.meshData.indices.length, this.meshData.indexType, 0, this.maxParticles);
      }
    };

    function Particle(position) {
      this.position = position;
      this.matrix = Matrix.translate(this.position);
      this.velocity = Vector.zero();
      this.startSize = Vector.one();
      this.endSize = Vector.one();
      this.health = 0.5;
      this.maxHealth = 0.5;
      this.alpha = system.alpha;

      this.active = true;

      var up = Vector.up();
      var s = Vector.zero();
      var pm = Matrix.identity();
      var currentSize = Vector.zero();
      var wind = new Vector();

      this.matrix = Matrix.identity();
      
      this.getAlpha = function() {
        return this.alpha * system.alphaCurve.getValue(1 - this.health / this.maxHealth);
        // return this.alpha * clamp(Math.exp(-3 * (1 - this.health / this.maxHealth)) - 0.1, 0, 1);
      };

      this.getMatrix = function() {
        if (cameraPos) {
          var pos;
          var vel;

          if (system.localParticles) {
            Matrix.copy(system.gameObject.transform.matrix, pm);
            // Matrix.setScale(pm, Vector.fill(1));
            pos = Matrix.transformVector(pm, this.position);
            vel = Matrix.transformDirection(pm, this.velocity);
          }
          else {
            pos = this.position;
            vel = this.velocity;
          }

          if (system.orientation == "faceVelocity") {
            var dir = Vector.normalize(vel);
            var lookDir = Vector.projectOnPlane(Vector.subtract(cameraPos, pos), dir);

            // Matrix.lookAt(pos, Vector.add(pos, lookDir), dir, this.matrix);
            Matrix.lookInDirection(pos, lookDir, dir, this.matrix);
          }
          else if (system.orientation == "faceCamera") {
            // var l = Vector.add(pos, Vector.subtract(pos, cameraPos));
            // Matrix.lookAt(pos, l, Vector.up(), this.matrix);
            Vector.set(s, cameraPos);
            Vector.subtractTo(s, pos);
            Matrix.lookInDirection(pos, s, up, this.matrix);
          }
          else {
            throw new Error("Unknown orientation mode: " + system.orientation);
          }

          Vector.lerp(this.endSize, this.startSize, this.health / this.maxHealth, currentSize);
          Matrix.scaleWithVector(this.matrix, currentSize);
        }

        return this.matrix;
      };

      this.update = function(dt) {
        if (this.active) {
          // Wind
          // var wind = new Vector((Math.random() - 0.3) * 3, 0, (Math.random() - 0.3) * 3);
          // this.velocity = Vector.add(this.velocity, Vector.multiply(wind, dt));

          system.wind(wind);
          Vector.multiplyTo(wind, dt);
          Vector.addTo(this.velocity, wind);

          // this.velocity.x += (Math.random() - 0.45) * 10 * dt;
          // this.velocity.z += (Math.random() - 0.45) * 10 * dt;

          //Drag
          // var drag = Vector.negate(Vector.compMultiply(this.velocity, Vector.applyFunc(this.velocity, Math.abs)));
          // this.velocity = Vector.add(this.velocity, Vector.multiply(drag, dt));

          this.velocity.x -= system.drag * Math.abs(this.velocity.x) * this.velocity.x * dt;
          this.velocity.y -= system.drag * Math.abs(this.velocity.y) * this.velocity.y * dt;
          this.velocity.z -= system.drag * Math.abs(this.velocity.z) * this.velocity.z * dt;

          // Gravity
          // this.velocity = Vector.add(this.velocity, Vector.multiply(new Vector(0, -9.82, 0), dt));
          this.velocity.y -= system.gravityScale * 9.82 * dt;

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
      };
    }
  }

  /*

    Classes

  */

  function Gizmos() {
    this.gameObject = new GameObject("Gizmos");
    var meshRenderer;

    var hasDoneSetup = false;

    var setup = () => {
      var material = CreateLitMaterial({}, renderer.programContainers.unlitInstanced);
      var meshData = generateMeshData();
    
      meshRenderer = new MeshInstanceRenderer(material, meshData);
      meshRenderer.drawMode = gl.LINES;
      this.gameObject.meshRenderer = meshRenderer;
    };
    
    this.visualize = function(gameObject) {
      if (!hasDoneSetup) {
        setup();
        hasDoneSetup = true;
      }

      var i = meshRenderer.addInstance(gameObject.transform.worldMatrix);
      setInterval(function() {
        var m = gameObject.transform.worldMatrix;
        Matrix.setScale(m, Vector.fill(0.3));
        meshRenderer.updateInstance(i, m);
      }, 16);
    };
  
    function generateMeshData() {
      const positions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 0, 0,
        0, 1, 0,
        0, 0, 0,
        0, 0, 1,
      ]);
      const indices = new Uint32Array([
        0, 1, 2, 3, 4, 5
      ]);
      // const colors = new Float32Array([
      //   1, 0, 0,
      //   1, 0, 0,
      //   0, 1, 0,
      //   0, 1, 0,
      //   0, 0, 1,
      //   0, 0, 1
      // ]);
      const colors = new Float32Array([
        0, 1, 1,
        0, 1, 1,
        1, 0, 1,
        1, 0, 1,
        1, 1, 0,
        1, 1, 0
      ]);
  
      return new MeshData({
        indices: {
          bufferData: indices,
          target: gl.ELEMENT_ARRAY_BUFFER
        },
        position: {
          bufferData: positions,
          size: 3
        },
        color: {
          bufferData: colors,
          size: 3
        }
      });
    }
  }

  function ScreenQuad() {
    const vertices = new Float32Array([
      -1.0,  1.0, // top left
      -1.0, -1.0, // bottom left
      1.0,  1.0, // top right
      1.0, -1.0, // bottom right
    ]);
    this.vertexBuffer = createBuffer(vertices);

    const uvs = new Float32Array([
      0, 1,
      0, 0,
      1, 1,
      1, 0,
    ]);
    this.uvBuffer = createBuffer(uvs);

    this.bindBuffers = function(positionLocation, uvLocation) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 8, 0);

      if (typeof uvLocation !== "undefined") {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
        gl.enableVertexAttribArray(uvLocation);
        gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 8, 0);
      }
    };

    this.render = function() {
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  }

  function PostProcessing() {
    /** @type {PostProcessingEffect[]} */
    this.effects = [];
    let needsRecompiling = true;

    const screenQuad = new ScreenQuad();

    let targetTextureWidth = gl.canvas.width;
    let targetTextureHeight = gl.canvas.height;

    const createFramebufferForPostprocessing = () => {
      // Framebuffer
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

      // Color texture
      const colorTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, targetTextureWidth, targetTextureHeight, 0, gl.RGBA, getFloatTextureType(), null);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);

      // Depth texture
      const depthTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT32F, targetTextureWidth, targetTextureHeight, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
      // gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, targetTextureWidth, targetTextureHeight, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
    
      return {
        width: targetTextureWidth,
        height: targetTextureHeight,
        framebuffer,
        colorTexture,
        depthTexture,
      };
    };

    // Downscaled framebuffer
    this.downscaledFramebuffer = createFramebuffer(targetTextureWidth / 4, targetTextureHeight / 4);
    
    // Render scene to this buffer
    this.sceneRenderBuffer = createFramebufferForPostprocessing();
    
    // We need two buffers, to read from one and render to the other
    this.renderBuffers = [
      createFramebufferForPostprocessing(),
      createFramebufferForPostprocessing()
    ];

    // Velocity texture
    if (renderer.version > 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneRenderBuffer.framebuffer);

      const velocityTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocityTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, targetTextureWidth, targetTextureHeight, 0, gl.RGBA, getFloatTextureType(), null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, velocityTexture, 0);
    
      this.sceneRenderBuffer.velocityTexture = velocityTexture;
    }

    /**
     * Generates combined shader code for list of effects
     * @param {PostProcessingEffect[]} includedEffects 
     * @returns {{
     *  vertex: String,
     *  fragment: String,
     * }}
     */
    this.getShaderSource = function(includedEffects) {
      const vertex = `
        #version 300 es

        in vec2 position;
        in vec2 inUV;

        out vec2 vUV;

        void main() {
          vUV = inUV;
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `;

      /**
       * 
       * @param {String} source 
       */
      const formatFragmentSouce = (source, uniqueName) => {
        source = source.replace("vec4 mainImage", `vec4 mainImage_${uniqueName}`);
        return source;
      };

      const fragment = `
        #version 300 es
        precision highp float;

        out vec4 fragColor;

        in vec2 vUV;

        uniform float cameraNear;
        uniform float cameraFar;
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;

        uniform float currentFPS;
        uniform float time;
        uniform vec2 screenSize;
        uniform float aspectRatio;

        uniform sampler2D sceneTexture;
        uniform sampler2D sceneDepthTexture;
        uniform sampler2D sceneVelocityTexture;

        ${includedEffects.map((e, i) => formatFragmentSouce(e.getFragmentSource(), i)).join("\n\n")}

        void main() {
          vec2 uv = vUV;
          vec4 outColor = texture(sceneTexture, uv);

          // Effects
          ${includedEffects.map((e, i) => `outColor = mainImage_${i}(outColor, uv);`).join("\n")}

          fragColor = outColor;
        }
      `;
      
      return {
        vertex,
        fragment,
      };
    };

    this.programContainers = null;

    /**
     * Add an effect to the postprocessing stack
     * @template T
     * @param {T} effect
     * @returns {T}
     */
    this.addEffect = function(effect) {
      // if (effect.name === "") {
      //   throw new Error("Effect must have a name");
      // }

      this.effects.push(effect);
      needsRecompiling = true;

      effect.initialize(renderer);

      return effect;
    };

    this.removeEffect = function(effect) {
      const index = this.effects.indexOf(effect);
      if (index === -1) {
        return effect;
      }

      this.effects.splice(index, 1);
      needsRecompiling = true;

      effect.dispose(renderer);

      return effect;
    };

    /**
     * 
     * @param {Camera} camera 
     */
    this.render = function(camera) {
      recompile();

      // Copy scene buffer to screen
      if (this.programContainers.length === 0) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.sceneRenderBuffer.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.clearBufferfv(gl.COLOR, 0, [1.0, 1.0, 1.0, 1.0]);
        gl.blitFramebuffer(
          0, 0, targetTextureWidth, targetTextureHeight,
          0, 0, targetTextureWidth, targetTextureHeight,
          gl.COLOR_BUFFER_BIT, gl.LINEAR
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      for (let i = 0; i < this.programContainers.length; i++) {
        const programContainer = this.programContainers[i];

        // Render to the screen on the last past
        const writeBuffer = i === this.programContainers.length - 1 ?
          null :
          this.renderBuffers[0].framebuffer;

        // Read from scene buffer on the first pass
        const readBuffer = i === 0 ?
          this.sceneRenderBuffer :
          this.renderBuffers[1];

        for (const effect of programContainer.effects) {
          effect.prepass(renderer, readBuffer);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, writeBuffer);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        useProgram(programContainer.program);

        bindVertexArray(null);
        screenQuad.bindBuffers(
          programContainer.getAttribLocation("position"),
          programContainer.getAttribLocation("inUV"),
        );

        // Color texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readBuffer.colorTexture);
        gl.uniform1i(programContainer.getUniformLocation("sceneTexture"), 0);

        // Depth texture
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneRenderBuffer.depthTexture);
        gl.uniform1i(programContainer.getUniformLocation("sceneDepthTexture"), 1);

        // Velocity texture
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneRenderBuffer.velocityTexture);
        gl.uniform1i(programContainer.getUniformLocation("sceneVelocityTexture"), 2);

        // Screen size
        gl.uniform2f(programContainer.getUniformLocation("screenSize"), targetTextureWidth, targetTextureHeight);
        gl.uniform1f(programContainer.getUniformLocation("aspectRatio"), renderer.aspect);
        
        // Time
        const time = (new Date() - renderer.startTime) / 1000;
        gl.uniform1f(programContainer.getUniformLocation("time"), time);

        // FPS
        gl.uniform1f(programContainer.getUniformLocation("currentFPS"), 1 / renderer.frameTime);

        // Camera properties
        gl.uniform1f(programContainer.getUniformLocation("cameraNear"), camera.getNear());
        gl.uniform1f(programContainer.getUniformLocation("cameraFar"), camera.getFar());
        gl.uniformMatrix4fv(programContainer.getUniformLocation("projectionMatrix"), false, camera.projectionMatrix);
        gl.uniformMatrix4fv(programContainer.getUniformLocation("viewMatrix"), false, camera.viewMatrix);
        
        // Set uniforms
        for (const effect of programContainer.effects) {
          effect.setUniforms(programContainer, gl);
        }

        screenQuad.render();

        swapRenderBuffers();
      }
    };

    const swapRenderBuffers = () => {
      const temp = this.renderBuffers[0];
      this.renderBuffers[0] = this.renderBuffers[1];
      this.renderBuffers[1] = temp;
    };

    const doesEffectNeedSplit = (effect) => {
      if (effect.doesEffectNeedSplit) {
        return true;
      }

      return effect.getFragmentSource().indexOf("sceneTexture") !== -1;
    };

    const recompile = () => {
      if (needsRecompiling) {
        needsRecompiling = false;

        // if (this.programContainers == null) {
        this.programContainers = [];
        const currentEffects = [];

        for (const effect of this.effects) {
          if (!doesEffectNeedSplit(effect)) {
            currentEffects.push(effect);
            continue;
          }

          if (currentEffects.length > 0) {
            const source = this.getShaderSource(currentEffects);
            const program = renderer.createProgram(source.vertex, source.fragment);
            const programContainer = new ProgramContainer(program);
            programContainer.effects = [ ...currentEffects ];
            this.programContainers.push(programContainer);
          }

          currentEffects.length = 0;
          currentEffects.push(effect);
        }

        if (currentEffects.length > 0) {
          const source = this.getShaderSource(currentEffects);
          const program = renderer.createProgram(source.vertex, source.fragment);
          const programContainer = new ProgramContainer(program);
          programContainer.effects = [ ...currentEffects ];
          this.programContainers.push(programContainer);

          currentEffects.length = 0;
        }

        return;
        // }

        // for (let i = 0; i < this.effects.length; i++) {
        //   const effect = this.effects[i];
        //   const source = this.getShaderSource([ effect ]);
        //   const programContainer = this.programContainers[i];
        //   renderer.updateFragmentShader(programContainer, source.fragment);
        // }
      }
    };

    this.getFramebuffer = function() {
      return this.sceneRenderBuffer.framebuffer;
    };

    this.bindFramebuffer = function() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.getFramebuffer());
    };

    this.resizeFramebuffers = function() {
      targetTextureWidth = gl.canvas.width;
      targetTextureHeight = gl.canvas.height;

      // Downscaled framebuffer
      gl.bindTexture(gl.TEXTURE_2D, this.downscaledFramebuffer.colorBuffer);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, targetTextureWidth / 4, targetTextureHeight / 4, 0, gl.RGBA, getFloatTextureType(), null);

      // Resize all buffers
      for (const renderBuffer of [ this.sceneRenderBuffer, ...this.renderBuffers ]) {
        // Color buffer
        gl.bindTexture(gl.TEXTURE_2D, renderBuffer.colorTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, getFloatTextureType(), null);

        // Depth texture
        gl.bindTexture(gl.TEXTURE_2D, renderBuffer.depthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, gl.canvas.width, gl.canvas.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);

        // Velocity texture
        if (renderBuffer.velocityTexture) {
          gl.bindTexture(gl.TEXTURE_2D, renderBuffer.velocityTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, getFloatTextureType(), null);
        }
      }

      for (const effect of this.effects) {
        effect.resizeFramebuffers(renderer);
      }

      gl.bindTexture(gl.TEXTURE_2D, null);
    };
  }

  // function OldPostProcessing() {
  //   var postprocessing = this;
  //   this.TONEMAPPING = { NONE: 0, ACES: 1, REINHARD: 2 };

  //   function Property(value, onChange = () => {}) {
  //     this.value = value;
  //     var lastValue = value;
  //     this.onChange = onChange;
  //     var hasRunInitial = false;

  //     this.update = function() {
  //       if (this.value != lastValue || !hasRunInitial) {
  //         this.onChange(this.value, lastValue);
  //         lastValue = this.value;
  //         hasRunInitial = true;
  //       }
  //     };
  //   }

  //   this.exposure = new Property(0, value => {
  //     gl.uniform1f(this.programContainer.getUniformLocation("exposure"), value);
  //   });
  //   this.gamma = new Property(2.2, value => {
  //     gl.uniform1f(this.programContainer.getUniformLocation("gamma"), value);
  //   });
  //   this.tonemapping = new Property(this.TONEMAPPING.ACES, value => {
  //     gl.uniform1i(this.programContainer.getUniformLocation("tonemapping"), value);
  //   });
  //   this.motionBlurStrength = new Property(0.2, (value, lastValue) => {
  //     if (!needRecompile(value, lastValue)) {
  //       gl.uniform1f(this.programContainer.getUniformLocation("motionBlurStrength"), value);
  //     }
  //   });
  //   this.saturation = new Property(0, (value) => {
  //     gl.uniform1f(this.programContainer.getUniformLocation("saturation"), value);
  //   });
  //   this.contrast = new Property(0, (value) => {
  //     gl.uniform1f(this.programContainer.getUniformLocation("contrast"), value);
  //   });
  //   this.vignette = {
  //     amount: new Property(0, (value) => {
  //       gl.uniform1f(this.programContainer.getUniformLocation("vignetteAmount"), value);
  //     }),
  //     falloff: new Property(0, (value) => {
  //       gl.uniform1f(this.programContainer.getUniformLocation("vignetteFalloff"), value);
  //     }),
  //   };
  //   this.whiteBalance = {
  //     temperature: new Property(0, (value) => {
  //       gl.uniform1f(this.programContainer.getUniformLocation("temperature"), value);
  //     }),
  //     tint: new Property(0, (value) => {
  //       gl.uniform1f(this.programContainer.getUniformLocation("tint"), value);
  //     }),
  //   };

  //   var needRecompile = (value, lastValue) => {
  //     if ((value > 0 && lastValue == 0) || (value == 0 && lastValue > 0)) {
  //       renderer.updateFragmentShader(this.programContainer, getShaderSource().fragment);
  
  //       for (var property of properties) {
  //         property.onChange(property.value, property.value);
  //       }

  //       bindUniforms();

  //       console.info("Recompiling postprocessing");

  //       return true;
  //     }

  //     return false;
  //   };

  //   var properties = [
  //     this.exposure,
  //     this.gamma,
  //     this.tonemapping,
  //     this.motionBlurStrength,
  //     this.saturation,
  //     this.contrast,
  //     this.vignette.amount,
  //     this.vignette.falloff,
  //     this.whiteBalance.temperature,
  //     this.whiteBalance.tint
  //   ];

  //   // this.exposure = 0;
  //   // this.gamma = 2.2;
  //   // this.tonemapping = this.TONEMAPPING.ACES;
  //   // this.motionBlurStrength = 0.2;
  //   // this.saturation = 20; //0.3

  //   // var _lastExposure;
  //   // var _lastGamma;
  //   // var _lastMotionBlurStrength;
  //   var _lastWidth;
  //   var _lastHeight;

  //   var source = getShaderSource();
  //   var program = renderer.createProgram(source.vertex, source.fragment);
  //   this.programContainer = new ProgramContainer(program);

  //   // this.colorBuffers = [];
  
  //   var targetTextureWidth = gl.canvas.width;
  //   var targetTextureHeight = gl.canvas.height;

  //   var colorRenderbuffer;
  //   var depthBuffer;

  //   this.useDepthTexture = true;

  //   if (renderer.version > 1/* && false*/) {
  //     this.preFramebuffer = gl.createFramebuffer();
  //     this.framebuffer = gl.createFramebuffer();

  //     colorRenderbuffer = gl.createRenderbuffer();
  //     gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderbuffer);
  //     gl.renderbufferStorageMultisample(gl.RENDERBUFFER, gl.getParameter(gl.MAX_SAMPLES), gl.RGBA16F, targetTextureWidth, targetTextureHeight);
      
  //     gl.bindFramebuffer(gl.FRAMEBUFFER, this.preFramebuffer);
  //     gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRenderbuffer);

  //     // Required for z sorting (better quality than above)
  //     depthBuffer = gl.createRenderbuffer();
  //     gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  //     gl.renderbufferStorageMultisample(gl.RENDERBUFFER, gl.getParameter(gl.MAX_SAMPLES), gl.DEPTH_COMPONENT16, targetTextureWidth, targetTextureHeight);
  //     gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
      
  //     gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

  //     this.colorBuffer = gl.createTexture();
  //     gl.activeTexture(gl.TEXTURE0);
  //     gl.bindTexture(gl.TEXTURE_2D, this.colorBuffer);
  //     gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, targetTextureWidth, targetTextureHeight, 0, gl.RGBA, getFloatTextureType(), null);
  //     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  //     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  //     gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorBuffer, 0);

  //     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  //   }
  //   else {
  //     // Framebuffer
  //     this.framebuffer = gl.createFramebuffer();
  //     gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    
  //     // Color buffer
  //     this.colorBuffer = gl.createTexture();
  //     gl.activeTexture(gl.TEXTURE0);
  //     gl.bindTexture(gl.TEXTURE_2D, this.colorBuffer);
  //     gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, targetTextureWidth, targetTextureHeight, 0, gl.RGBA, getFloatTextureType(), null);
    
  //     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  //     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  //     gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorBuffer, 0);

  //     // Motion blur
  //     if (renderer.version > 1) {
  //       this.motionBlurColorBuffer = gl.createTexture();
  //       gl.activeTexture(gl.TEXTURE0);
  //       gl.bindTexture(gl.TEXTURE_2D, this.motionBlurColorBuffer);
  //       gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, targetTextureWidth, targetTextureHeight, 0, gl.RGBA, getFloatTextureType(), null);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  //       gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.motionBlurColorBuffer, 0);
  //     }

  //     if (this.useDepthTexture) {
  //       // Low quality depth info
  //       this.depthTexture = gl.createTexture();
  //       gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
  //       gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, targetTextureWidth, targetTextureHeight, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  //       gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture, 0);
  //     }
  //     else {
  //       // Required for z sorting (better quality than depth texture?)
  //       depthBuffer = gl.createRenderbuffer();
  //       gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  //       gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, targetTextureWidth, targetTextureHeight);
  //       gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  //     }
  //   }

  //   this.downscaledFramebuffer = createFramebuffer(targetTextureWidth / 4, targetTextureHeight / 4);
  
  //   var screenQuad = new ScreenQuad();

  //   var bindUniforms = () => {
  //     useProgram(this.programContainer.program);
  //     gl.uniform1i(this.programContainer.getUniformLocation("mainTexture"), 0);
  //     gl.uniform1i(this.programContainer.getUniformLocation("bloomTexture"), 1);

  //     if (this.depthTexture || renderer.godrays) {
  //       // gl.uniform1i(this.programContainer.getUniformLocation("enableGodrays"), 1);
  //       gl.uniform1i(this.programContainer.getUniformLocation("depthTexture"), 2);
  //     }
  //     else {
  //       gl.uniform1i(this.programContainer.getUniformLocation("enableGodrays"), 0);
  //     }

  //     gl.uniform1i(this.programContainer.getUniformLocation("motionBlurTexture"), 3);

  //     if (this.motionBlurColorBuffer) {
  //       gl.uniform1i(this.programContainer.getUniformLocation("motionBlurTexture"), 16);
  //     }

  //     gl.uniform2f(this.programContainer.getUniformLocation("SIZE"), gl.canvas.width, gl.canvas.height);
    
  //     // // DoF
  //     // var NEAR = 0.1;
  //     // var FAR = 100.0;
  //     // var FOCAL_LENGTH = 1.0;
  //     // var FOCUS_DISTANCE = 4.0;
  //     // var MAGNIFICATION = FOCAL_LENGTH / Math.abs(FOCUS_DISTANCE - FOCAL_LENGTH);
  //     // var FSTOP = 2.8 * 0.3;
  //     // var BLUR_COEFFICIENT = FOCAL_LENGTH * MAGNIFICATION / FSTOP;
  //     // var PPM = Math.sqrt(gl.canvas.width * gl.canvas.width + gl.canvas.height * gl.canvas.height) / 35;   

  //     // gl.uniform1f(this.programContainer.getUniformLocation("uFocusDistance"), FOCUS_DISTANCE);
  //     // gl.uniform1f(this.programContainer.getUniformLocation("uBlurCoefficient"), BLUR_COEFFICIENT);
  //     // gl.uniform1f(this.programContainer.getUniformLocation("uPPM"), PPM);
  //     // gl.uniform2f(this.programContainer.getUniformLocation("uDepthRange"), NEAR, FAR);
  //     // gl.uniform2f(this.programContainer.getUniformLocation("uResolution"), gl.canvas.width, gl.canvas.height);
  //     // gl.uniform2f(this.programContainer.getUniformLocation("uTexelOffset"), 1, 0);
  //     // // gl.uniform2f(this.programContainer.getUniformLocation("uTexelOffset"), 0, 1);
  //     // gl.uniform1i(this.programContainer.getUniformLocation("uDepth"), 17);
  //   };

  //   bindUniforms();

  //   this.getFramebuffer = function() {
  //     if (this.preFramebuffer) {
  //       return this.preFramebuffer;
  //     }

  //     return this.framebuffer;
  //   };

  //   this.bindFramebuffer = function() {
  //     gl.bindFramebuffer(gl.FRAMEBUFFER, this.getFramebuffer());
  //   };

  //   this.blitAA = function() {
  //     if (this.preFramebuffer) {
  //       gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.preFramebuffer);
  //       gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
  //       gl.clearBufferfv(gl.COLOR, 0, [1.0, 1.0, 1.0, 1.0]);
  //       gl.blitFramebuffer(
  //         0, 0, targetTextureWidth, targetTextureHeight,
  //         0, 0, targetTextureWidth, targetTextureHeight,
  //         gl.COLOR_BUFFER_BIT, gl.LINEAR
  //       );
  //       gl.bindFramebuffer(gl.FRAMEBUFFER, this.preFramebuffer);
  //     }
  //   };
  
  //   this.resizeFramebuffers = function() {
  //     targetTextureWidth = gl.canvas.width;
  //     targetTextureHeight = gl.canvas.height;

  //     // Downscaled framebuffer
  //     gl.bindTexture(gl.TEXTURE_2D, this.downscaledFramebuffer.colorBuffer);
  //     gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, targetTextureWidth / 4, targetTextureHeight / 4, 0, gl.RGBA, getFloatTextureType(), null);

  //     // Color buffer
  //     gl.bindTexture(gl.TEXTURE_2D, this.colorBuffer);
  //     gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, getFloatTextureType(), null);

  //     // Motion blur
  //     if (this.motionBlurColorBuffer) {
  //       gl.bindTexture(gl.TEXTURE_2D, this.motionBlurColorBuffer);
  //       gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, getFloatTextureType(), null);
  //     }

  //     if (this.depthTexture) {
  //       gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
  //       gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, gl.canvas.width, gl.canvas.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  //     }
  //     else {
  //       if (this.preFramebuffer) {
  //         gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  //         gl.renderbufferStorageMultisample(gl.RENDERBUFFER, gl.getParameter(gl.MAX_SAMPLES), gl.DEPTH_COMPONENT16, gl.canvas.width, gl.canvas.height);
  //       }
  //       else {
  //         gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  //         gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, gl.canvas.width, gl.canvas.height);
  //       }
  //     }

  //     if (this.preFramebuffer) {
  //       gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderbuffer);
  //       gl.renderbufferStorageMultisample(gl.RENDERBUFFER, gl.getParameter(gl.MAX_SAMPLES), gl.RGBA16F, gl.canvas.width, gl.canvas.height);
  //     }

  //     gl.bindTexture(gl.TEXTURE_2D, null);
  //   };
  
  //   /**
  //    * 
  //    * @param {Camera} camera 
  //    */
  //   this.render = function(camera) {
  //     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  //     gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  //     gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
  //     useProgram(this.programContainer.program);

  //     // if (this.depthTexture || renderer.godrays) {
  //     //   gl.uniform1i(this.programContainer.getUniformLocation("enableGodrays"), 1);
  //     //   // gl.uniform1i(this.programContainer.getUniformLocation("depthTexture"), 2);
  //     // }
  //     // else {
  //     //   gl.uniform1i(this.programContainer.getUniformLocation("enableGodrays"), 0);
  //     // }
  
  //     bindVertexArray(null);
  //     gl.bindBuffer(gl.ARRAY_BUFFER, screenQuad.vertexBuffer);
  //     var loc = this.programContainer.getAttribLocation("position");
  //     gl.enableVertexAttribArray(loc);
  //     gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 8, 0);
  
  //     // Bind textures
  //     // Main scene color texture
  //     gl.activeTexture(gl.TEXTURE0);
  //     gl.bindTexture(gl.TEXTURE_2D, this.colorBuffer);
  //     // gl.uniform1i(this.mainTextureLocation, 0);

  //     // Bloom texture
  //     gl.activeTexture(gl.TEXTURE1);
  //     gl.bindTexture(gl.TEXTURE_2D, renderer.bloom.upsampleFramebuffers[renderer.bloom.upsampleFramebuffers.length - 1].colorBuffer);
  //     // gl.uniform1i(this.bloomTextureLocation, 1);

  //     // Depth texture
  //     if (this.depthTexture) {
  //       // gl.uniform1i(this.godraysLocation, 1);

  //       gl.activeTexture(gl.TEXTURE2);
  //       gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
  //       gl.uniform1i(this.programContainer.getUniformLocation("depthTexture"), 2);
  //       // gl.uniform1i(this.depthTextureLocation, 2);
  //     }
  //     else if (renderer.godrays) {
  //       // gl.uniform1i(this.godraysLocation, 1);

  //       gl.activeTexture(gl.TEXTURE2);
  //       gl.bindTexture(gl.TEXTURE_2D, renderer.godrays.framebufferData.colorBuffer);
  //       // gl.uniform1i(this.depthTextureLocation, 2);
  //     }
  //     else {
  //       // gl.uniform1i(this.godraysLocation, 0);
  //     }

  //     if (this.motionBlurColorBuffer) {
  //       gl.activeTexture(gl.TEXTURE25);
  //       gl.bindTexture(gl.TEXTURE_2D, this.motionBlurColorBuffer);
  //       gl.uniform1i(this.programContainer.getUniformLocation("motionBlurTexture"), 25);
  //     }

  //     // // DoF
  //     // gl.activeTexture(gl.TEXTURE17);
  //     // gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);

  //     // Rain drops on screen
  //     if (this.rainTexture) {
  //       gl.activeTexture(gl.TEXTURE17);
  //       gl.bindTexture(gl.TEXTURE_2D, this.rainTexture);
  //       gl.uniform1i(this.programContainer.getUniformLocation("rainTexture"), 17);
  //     }

  //     // Downscaled framebuffer
  //     gl.activeTexture(gl.TEXTURE18);
  //     gl.bindTexture(gl.TEXTURE_2D, this.downscaledFramebuffer.colorBuffer);
  //     gl.uniform1i(this.programContainer.getUniformLocation("downscaledTexture"), 18);

  //     // Set uniforms
  //     gl.uniform1f(this.programContainer.getUniformLocation("iTime"), (new Date() - renderer.startTime) / 1000);
  
  //     if (gl.canvas.width !== _lastWidth || gl.canvas.height !== _lastHeight) {
  //       _lastWidth = gl.canvas.width;
  //       _lastHeight = gl.canvas.height;
  //       gl.uniform2f(this.programContainer.getUniformLocation("SIZE"), gl.canvas.width, gl.canvas.height);
  //     }

  //     // if (this.exposure !== _lastExposure) {
  //     //   _lastExposure = this.exposure;
  //     //   gl.uniform1f(this.programContainer.getUniformLocation("exposure"), this.exposure);
  //     // }

  //     // if (this.gamma !== _lastGamma) {
  //     //   _lastGamma = this.gamma;
  //     //   gl.uniform1f(this.programContainer.getUniformLocation("gamma"), this.gamma);
  //     // }

  //     // if (this.motionBlurStrength !== _lastMotionBlurStrength) {
  //     //   _lastMotionBlurStrength = this.motionBlurStrength;
  //     //   gl.uniform1f(this.programContainer.getUniformLocation("motionBlurStrength"), this.motionBlurStrength);
  //     //   gl.uniform1i(this.programContainer.getUniformLocation("enableMotionBlur"), this.motionBlurStrength < 1e-6 ? 0 : 1);
  //     // }

  //     // Camera properties
  //     gl.uniform1f(this.programContainer.getUniformLocation("near"), camera.getNear());
  //     gl.uniform1f(this.programContainer.getUniformLocation("far"), camera.getFar());

  //     // Current FPS for motion blur
  //     gl.uniform1f(this.programContainer.getUniformLocation("currentFPS"), 1 / renderer.frameTime);

  //     // Bloom settings
  //     gl.uniform1f(this.programContainer.getUniformLocation("bloomIntensity"), renderer.bloom.getIntensity());
  //     // gl.uniform1i(this.programContainer.getUniformLocation("tonemapping"), this.tonemapping);
  //     // gl.uniform1f(this.programContainer.getUniformLocation("saturation"), this.saturation);

  //     for (var property of properties) {
  //       property.update();
  //     }

  //     // Render
  //     screenQuad.render();
  //   };

  //   function getShaderSource() {
  //     var p = postprocessingSource["webgl" + renderer.version].postprocessing;
  //     if (!p || !p.vertex || !p.fragment) {
  //       console.error(`Program postprocessing not found for version ${renderer.version}!`);
  //       return;
  //     }
  
  //     var fragment = "";

  //     if (renderer.version > 1) {
  //       fragment += "#version 300 es\n";
  //     }

  //     if (renderer.version > 1 && postprocessing.motionBlurStrength.value > 1e-6) {
  //       fragment += "#define ENABLE_MOTIONBLUR\n";
  //     }

  //     fragment += "#define TONEMAPPING " + postprocessing.tonemapping.value + "\n";

  //     if (renderer.godrays) {
  //       fragment += "#define ENABLE_GODRAYS\n";
  //     }

  //     if (renderer.bloom.getIntensity() > 1e-6) {
  //       fragment += "#define ENABLE_BLOOM\n";
  //     }

  //     // if (Math.abs(postprocessing.saturation.value) > 1e-6) {
  //     //   fragment += "#define ENABLE_COLORGRADING\n";
  //     // }

  //     fragment += p.fragment;

  //     return {
  //       vertex: p.vertex,
  //       fragment: fragment,
  //     };
  //   }
  // }

  // function Bloom(programContainer) {
  //   this.programContainer = programContainer;

  //   var _enabled = true;
  //   var _maxDownsamples = 7;
  //   var _sampleScale = 1;
  //   var _threshold = 1;
  //   var _knee = 0.5;
  //   var _clamp = 10;
  //   var _intensity = 0.05;

  //   var _cachedProperties = {
  //     enabled: _enabled
  //   };

  //   this.downsampleFramebuffers = [];
  //   this.upsampleFramebuffers = [];

  //   // Screen quad
  //   var vertices = new Float32Array([
  //     -1.0,  1.0,
  //     -1.0, -1.0,
  //     1.0,  1.0,
  //     1.0, -1.0,
  //   ]);
  //   var vertexBuffer = createBuffer(vertices);

  //   useProgram(this.programContainer.program);
  //   gl.uniform1i(this.programContainer.getUniformLocation("mainTexture"), 0);
  //   gl.uniform1i(this.programContainer.getUniformLocation("secondTexture"), 1);

  //   let getNrDownsamples = () => {
  //     let minDim = Math.min(gl.canvas.width, gl.canvas.height);
  //     let sizeLimit = Math.floor(Math.log(minDim) / Math.log(2));
  //     let downsamples = Math.min(_maxDownsamples, sizeLimit);
  //     return downsamples;
  //   };

  //   this.resizeFramebuffers = function() {
  //     for (let i = 0; i < this.downsampleFramebuffers.length; i++) {
  //       gl.deleteFramebuffer(this.downsampleFramebuffers[i].framebuffer);
  //     }
  //     for (let i = 0; i < this.upsampleFramebuffers.length; i++) {
  //       gl.deleteFramebuffer(this.upsampleFramebuffers[i].framebuffer);
  //     }

  //     this.downsampleFramebuffers = [];
  //     this.upsampleFramebuffers = [];

  //     let downsamples = getNrDownsamples();

  //     for (let i = 0; i < downsamples; i++) {
  //       let scale = Math.pow(0.5, i + 1);
  //       this.downsampleFramebuffers.push(createFramebuffer(Math.floor(gl.canvas.width * scale), Math.floor(gl.canvas.height * scale)));
  //     }
  
  //     for (let i = 0; i < downsamples - 1; i++) {
  //       let scale = Math.pow(0.5, downsamples - 1 - i);
  //       this.upsampleFramebuffers.push(createFramebuffer(Math.floor(gl.canvas.width * scale), Math.floor(gl.canvas.height * scale)));
  //     }
  //   };

  //   this.resizeFramebuffers();

  //   this.render = function() {
  //     if (!_enabled && _cachedProperties.enabled) {
  //       this.clearBloom();
  //     }
  //     _cachedProperties.enabled = _enabled;

  //     if (!_enabled) {
  //       return;
  //     }

  //     useProgram(this.programContainer.program);

  //     gl.uniform1f(this.programContainer.getUniformLocation("_SampleScale"), _sampleScale);
  //     gl.uniform1f(this.programContainer.getUniformLocation("threshold"), _threshold);
  //     gl.uniform1f(this.programContainer.getUniformLocation("knee"), _knee);
  //     gl.uniform1f(this.programContainer.getUniformLocation("_Clamp"), _clamp);

  //     let pl = this.programContainer.getAttribLocation("position");
  //     gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  //     gl.enableVertexAttribArray(pl);
  //     gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 8, 0);

  //     gl.activeTexture(gl.TEXTURE0);

  //     for (var i = 0; i < this.downsampleFramebuffers.length; i++) {
  //       var framebuffer = this.downsampleFramebuffers[i];

  //       gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
  //       gl.viewport(0, 0, framebuffer.width, framebuffer.height);
  //       gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  //       gl.bindTexture(gl.TEXTURE_2D, i < 1 ? renderer.postprocessing.sceneRenderBuffer.colorTexture : this.downsampleFramebuffers[i - 1].colorBuffer);

  //       if (this.programContainer.getUniformLocation("mainTextureSize")) {
  //         gl.uniform2fv(this.programContainer.getUniformLocation("mainTextureSize"), i < 1 ? [gl.canvas.width, gl.canvas.height] : [this.downsampleFramebuffers[i - 1].width, this.downsampleFramebuffers[i - 1].height]);
  //       }
  //       gl.uniform2f(this.programContainer.getUniformLocation("screenSize"), framebuffer.width, framebuffer.height);
  //       gl.uniform1i(this.programContainer.getUniformLocation("stage"), i == 0 ? 0 : 1);

  //       gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  //     }

  //     gl.uniform1i(this.programContainer.getUniformLocation("stage"), 2);

  //     for (let i = 0; i < this.upsampleFramebuffers.length; i++) {
  //       let framebuffer = this.upsampleFramebuffers[i];

  //       gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
  //       gl.viewport(0, 0, framebuffer.width, framebuffer.height);
  //       gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  //       gl.activeTexture(gl.TEXTURE0);
  //       gl.bindTexture(gl.TEXTURE_2D, i < 1 ? this.downsampleFramebuffers[this.downsampleFramebuffers.length - 1].colorBuffer : this.upsampleFramebuffers[i - 1].colorBuffer);

  //       gl.activeTexture(gl.TEXTURE1);
  //       gl.bindTexture(gl.TEXTURE_2D, this.downsampleFramebuffers[this.downsampleFramebuffers.length - 2 - i].colorBuffer);

  //       if (this.programContainer.getUniformLocation("mainTextureSize")) {
  //         let fbd = i < 1 ? this.downsampleFramebuffers[this.downsampleFramebuffers.length - 1] : this.upsampleFramebuffers[i - 1];
  //         gl.uniform2f(this.programContainer.getUniformLocation("mainTextureSize"), fbd.width, fbd.height);
  //       }
  //       gl.uniform2f(this.programContainer.getUniformLocation("screenSize"), framebuffer.width, framebuffer.height);

  //       gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  //     }
  //   };

  //   this.clearBloom = function() {
  //     gl.bindFramebuffer(gl.FRAMEBUFFER, this.upsampleFramebuffers[this.upsampleFramebuffers.length - 1].framebuffer);

  //     var lastClearColor = currentClearColor;
  //     clearColor(0, 0, 0, 1);
  //     gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  //     clearColor(...lastClearColor);
  //   };

  //   this.setProperties = function(properties) {
  //     _enabled = properties.enabled;
  //     _sampleScale = properties.sampleScale;
  //     _threshold = properties.threshold;
  //     _knee = properties.knee;
  //     _clamp = properties.clamp;
  //     _intensity = properties.intensity;
  //   };

  //   this.getIntensity = function() {
  //     return _intensity;
  //   };
  // }

  // function Godrays(programContainer) {
  //   // this.material = new Material(programContainer);
  //   this.material = new NewMaterial(programContainer);

  //   var scale = 0.2;
  //   this.framebufferData = createFramebuffer(gl.canvas.width * scale, gl.canvas.height * scale);

  //   // Required for z sorting (better quality than above)
  //   var depthBuffer = gl.createRenderbuffer();
  //   gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  //   gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, gl.canvas.width * scale, gl.canvas.height * scale);
  //   gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

  //   this.render = function(scene, camera) {
  //     gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferData.framebuffer);
  //     gl.viewport(0, 0, this.framebufferData.width, this.framebufferData.height);
  //     gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  //     scene.render(camera, {
  //       renderPass: ENUMS.RENDERPASS.OPAQUE,
  //       materialOverride: this.material
  //     });

  //     renderer.skybox.render(camera, scene.skyboxCubemap);
  //   };
  // }

  function ShadowCascades(programContainers, levelSizes = [50, 8], levelBiases = [-0.0025, -0.0005], res = 1024) {
    var _this = this;

    const originalLevelSizes = [...levelSizes];

    levelSizes.reverse();
    levelBiases.reverse();

    this.levels = levelSizes.length;

    this.programContainers = programContainers;
    this.programContainer = programContainers.basic;
    Object.defineProperty(this, "program", {
      get: function() {
        return _this.programContainer.program;
      },
      set: val => {
        _this.programContainer.setProgram(val);
      }
    });
    // this.material = new Material(this.programContainer);
    // this.materialInstanced = new Material(this.programContainers.instanced);
    // this.materialSkinned = new Material(this.programContainers.skinned);

    this.material = new NewMaterial(this.programContainer);
    this.materialInstanced = new NewMaterial(this.programContainers.instanced);
    this.materialSkinned = new NewMaterial(this.programContainers.skinned);

    var textureMatrices = new Float32Array(this.levels * 16);

    this.shadowmaps = [];
    for (let i = 0; i < this.levels; i++) {
      var shadowmap = new Shadowmap(res, levelSizes[i], levelBiases[i], [gl["TEXTURE" + (30 - i * 2)], gl["TEXTURE" + (31 - i * 2)]]);
      shadowmap.textureMatrix = new Float32Array(textureMatrices.buffer, Float32Array.BYTES_PER_ELEMENT * 16 * (1 - i), 16);
      this.shadowmaps.push(shadowmap);
    }

    var projectedTextures = new Array(this.levels);
    var biases = new Array(this.levels);
    for (let i = 0; i < this.levels; i++) {
      var ind = this.levels - 1 - i;
      projectedTextures[i] = 30 - ind * 2;
      biases[i] = this.shadowmaps[ind].bias;
    }

    this.clearShadowmaps = function() {
      for (var i = 0; i < this.levels; i++) {
        var shadowmap = this.shadowmaps[i];
        shadowmap.clearShadowmap();
      }
    };

    var frameCount = 0;
    this.refreshRate = 0;
    
    this.renderShadowmaps = function(cameraPosition) {
      frameCount++;

      let scene = renderer.scenes[renderer.currentScene];

      scene.root.traverseCondition(obj => {
        obj.isCulled = false;
      }, child => child.active && child.visible);

      // for (let i = this.levels - 1; i >= 0; i--) {
      for (let i = 0; i < this.levels; i++) {
        if (this.refreshRate >= 1 && frameCount % this.refreshRate !== Math.floor(i * this.refreshRate / this.levels)) {
          continue;
        }

        let shadowmap = this.shadowmaps[i];
        shadowmap.updateModelMatrix(cameraPosition);
        shadowmap.bind();

        let camera = {
          projectionMatrix: shadowmap.shadowPerspeciveMatrix,
          viewMatrix: shadowmap.shadowViewMatrix,
          inverseViewMatrix: shadowmap.shadowInverseViewMatrix,
          frustum: shadowmap.camera.frustum,
        };

        scene.updateUniformBuffers(
          camera.projectionMatrix,
          camera.viewMatrix,
          camera.inverseViewMatrix
        );

        scene.root.traverseCondition(obj => {
          if (!obj.isCulled && obj.meshRenderer && (!camera.frustum || !obj.getAABB() || obj.getAABB().isInsideFrustum(camera.frustum))) {
            obj.isCulled = false;
          }
          else {
            obj.isCulled = true;
          }
        }, child => child.active && child.visible);

        scene.render(camera, {
          materialOverride: this.material,
          materialOverrideInstanced: this.materialInstanced,
          materialOverrideSkinned: this.materialSkinned,
          renderPass: ENUMS.RENDERPASS.OPAQUE | ENUMS.RENDERPASS.SHADOWS
        });
      }

      // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    };

    this.setUniforms = function(material) {
      var l = material.getUniformLocation("textureMatrices[0]");
      if (l != null) {
        gl.uniformMatrix4fv(l, false, textureMatrices);
        gl.uniform1iv(material.getUniformLocation("projectedTextures[0]"), projectedTextures);
        gl.uniform1fv(material.getUniformLocation("biases[0]"), biases);
        gl.uniform1fv(material.getUniformLocation("shadowSizes[0]"), originalLevelSizes);
      }
    };
  }

  function Shadowmap(res = 512, shadowRange = 20, bias = -0.006, textureNumbers = [gl.TEXTURE31, gl.TEXTURE30]) {
    this.bias = bias;
    this.textureNumbers = textureNumbers;

    this.camera = new Camera({
      type: Camera.Type.Orthographic,
      size: shadowRange,
      near: 1,
      far: 300,
    });

    this.shadowPerspeciveMatrix = Matrix.orthographic({size: shadowRange, near: 1, far: 300});
    this.shadowModelMatrix = Matrix.identity();
    this.shadowViewMatrix = Matrix.identity();
    this.shadowInverseViewMatrix = Matrix.identity();
    this.textureMatrix = null;
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

    gl.activeTexture(gl.TEXTURE0);

    const zeroVector = Vector.zero();
    const inverseSunDirection = new Vector();
    const upVector = Vector.up();
    const inverseShadowModelMatrix = new Matrix();
    const localPos = new Vector();
    const roundedPos = new Vector();

    this.updateModelMatrix = function(pos) {
      const scene = renderer.getActiveScene();

      // Matrix.lookAt(pos, Vector.subtract(pos, scene.sunDirection), {x: 0, y: 1, z: 0}, this.shadowModelMatrix);
      // Matrix.transform([
      //   ["translate", {z: 100}]
      // ], this.shadowModelMatrix);

      Vector.negate(scene.sunDirection, inverseSunDirection);
      Matrix.lookAt(zeroVector, inverseSunDirection, upVector, this.shadowModelMatrix);

      Matrix.inverse(this.shadowModelMatrix, inverseShadowModelMatrix);
      Matrix.transformVector(inverseShadowModelMatrix, pos, localPos);

      const n = shadowRange / res * 2;
      roundedPos.x = roundNearest(localPos.x, n);
      roundedPos.y = roundNearest(localPos.y, n);
      roundedPos.z = localPos.z + 100;
      Matrix.applyTranslation(roundedPos, this.shadowModelMatrix);

      this.camera.transform.matrix = this.shadowModelMatrix;
      
      Matrix.inverse(this.shadowModelMatrix, this.shadowViewMatrix);
      Matrix.copy(this.shadowModelMatrix, this.shadowInverseViewMatrix);

      Matrix.copy(this.textureMatrixBase, this.textureMatrix);
      Matrix.multiply(this.textureMatrix, this.shadowPerspeciveMatrix, this.textureMatrix);
      Matrix.multiply(this.textureMatrix, this.shadowViewMatrix, this.textureMatrix);
    };

    this.bind = function() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFramebuffer);
      gl.viewport(0, 0, this.depthTextureSize, this.depthTextureSize);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    };
    
    this.clearShadowmap = function() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFramebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    };

    // this.createFrustum = async function() {
    //   this.frustum = new Object3D(getLineCubeData());
    //   this.frustum.setProgram(new ProgramContainer(await renderer.createProgramFromFile("./assets/shaders/solidColor")));
    // }

    // this.drawFrustum = function() {
    //   gl.disable(gl.DEPTH_TEST);
    //   this.frustum.bind();
    //   gl.uniformMatrix4fv(getUniformLocation(this.frustum.program, "projectionMatrix"), false, perspectiveMatrix);
    //   gl.uniformMatrix4fv(getUniformLocation(this.frustum.program, "viewMatrix"), false, viewMatrix);
    //   this.frustum.draw(Matrix.multiply(this.shadowModelMatrix, Matrix.inverse(this.shadowPerspeciveMatrix)), gl.LINES);
    //   gl.enable(gl.DEPTH_TEST);
    // }
  }

  // bruh single color when looking at specific angle on mobile
  function Skybox(programContainer) {
    this.programContainer = programContainer;

    var _this = this;
    Object.defineProperty(this, "program", {
      get: function() {
        return _this.programContainer.program;
      },
      set: val => {
        _this.programContainer.setProgram(val);
      }
    });

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
      if (!cubemap) {
        return;
      }

      useProgram(this.program);
      this.meshData.bindBuffers(this.programContainer);

      Matrix.copy(camera.viewMatrix, matrix);
      Matrix.removeTranslation(matrix);
      Matrix.multiply(camera.projectionMatrix, matrix, matrix);
      Matrix.inverse(matrix, matrix);

      const scene = renderer.getActiveScene();
      gl.uniform1f(this.uniformLocations.environmentIntensity, scene.environmentIntensity);
      gl.uniformMatrix4fv(this.uniformLocations.viewDirectionProjectionInverse, false, matrix);
      this.programContainer.setUniform("fogColor", scene.fogColor);
      this.programContainer.setUniform("fogIntensity", scene.skyboxFogIntensity);
      // this.programContainer.setUniform("iTime", renderer.getTime());
      // this.programContainer.setUniform("_SkyboxSpeed", scene.skyboxAnimation.speed);
      // this.programContainer.setUniform("_SkyboxDirection", Vector.toArray(scene.skyboxAnimation.direction));

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
      gl.uniform1i(this.uniformLocations.skybox, 0);
  
      gl.depthFunc(gl.LEQUAL);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthFunc(gl.LESS);
    };
  }

  this.RenderTexture = RenderTexture;
  function RenderTexture(width = 512, height = 512, settings = {}) {
    this.width = width;
    this.height = height;

    this.clearFlags = settings.clearFlags ?? (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    // Color texture
    this.colorTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, this.width, this.height, 0, gl.RGBA, getFloatTextureType(), null);
  
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture, 0);

    // Depth texture
    this.depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, this.width, this.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture, 0);
  
    this.bind = function() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    };

    this.resize = function(width, height) {
      this.width = width;
      this.height = height;

      gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, this.width, this.height, 0, gl.RGBA, getFloatTextureType(), null);

      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT16, this.width, this.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    };
  }

  /*

    Materials
  
  */

  this.UniformBuffer = UniformBuffer;
  function UniformBuffer(location, size) {
    this.data = new Float32Array();
    this.location = location;

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, size, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, this.location, this.buffer);

    this.update = function(data/*, offset = 0*/) {
      this.data = data;
      // this.data.set(data, offset);

      gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
      gl.bufferData(gl.UNIFORM_BUFFER, this.data, gl.DYNAMIC_DRAW);
      // gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.data, 0, null);
      gl.bindBuffer(gl.UNIFORM_BUFFER, null);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, this.location, this.buffer); // bruh, unecsi?
    };
  }

  Renderer.ProgramContainer = ProgramContainer;
  this.ProgramContainer = ProgramContainer;
  function ProgramContainer(program) {
    var _this = this;
    var _program;
    this.activeAttributes = {};
    this.activeUniforms = {};
    this.uniformBuffers = {};

    Object.defineProperty(this, "program", {
      get: function() {
        return _program;
      },
      set: function(program) {
        _this.setProgram(program);
      }
    });

    this.setProgram = function(program) {
      assertProgram(program);
      _program = program;
      this.updateUniformLocations();
    };

    this.getUniformLocation = function(uniformName) {
      var u = this.activeUniforms[uniformName];
      if (u) {
        return u.location;
      }
      return null;
    };
    
    this.setUniform = function(uniformName, value, warn = true) {
      var u = this.activeUniforms[uniformName];
      if (!u) {
        if (warn) {
          console.warn(`Cannot set uniform: ${uniformName}. Uniform does not exist`);
        }
        return;
      }

      if (u.setType.indexOf("Matrix") !== -1) {
      // if (u.setType.toLowerCase().indexOf("matrix") !== -1) {
        if (!ArrayBuffer.isView(value)) {
          console.error(value);
          throw new Error(`Cannot set matrix uniform: ${uniformName}. Matrix must be Float32Array`);
        }

        gl["uniform" + u.setType](u.location, false, value);
        return;
      }

      if (!Array.isArray(value)) {
        gl["uniform" + u.setType](u.location, value);
      }
      else {
        gl["uniform" + u.setType + "v"](u.location, value);
      }
    };

    this.bindTexture = function(texture, uniformName, activeTexture = 0) {
      gl.activeTexture(gl.TEXTURE0 + activeTexture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(
        this.getUniformLocation(uniformName),
        activeTexture,
      );
    };

    this.getAttribLocation = function(attributeName) {
      var a = this.activeAttributes[attributeName];
      if (a) {
        return a.location;
      }
    };

    this.updateUniformLocations = function() {
      this.activeAttributes = {};
      this.activeUniforms = {};
      this.uniformBuffers = {};

      const nrAttribs = gl.getProgramParameter(_program, gl.ACTIVE_ATTRIBUTES);
      for (let i = 0; i < nrAttribs; i++) {
        const attribInfo = gl.getActiveAttrib(_program, i);
        const location = gl.getAttribLocation(_program, attribInfo.name);

        const typeString = glEnumToString(attribInfo.type);

        this.activeAttributes[attribInfo.name] = {
          location,
          size: attribInfo.size,
          type: attribInfo.type,
          typeString,
        };
      }

      const nrUniforms = gl.getProgramParameter(_program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < nrUniforms; i++) {
        const uniform = gl.getActiveUniform(_program, i);
        const location = gl.getUniformLocation(_program, uniform.name);

        const typeString = glEnumToString(uniform.type);
        const setType = getUniformSetType(typeString);

        this.activeUniforms[uniform.name] = {
          location,
          size: uniform.size,
          type: uniform.type,
          typeString,
          setType,
        };
      }

      if (renderer.version > 1) {
        const indices = [...Array(nrUniforms).keys()];
        var nrUniformBlocks = Math.max(...gl.getActiveUniforms(_program, indices, gl.UNIFORM_BLOCK_INDEX)) + 1;

        if (nrUniformBlocks != -1) {
          for (let blockIndex = 0; blockIndex < nrUniformBlocks; blockIndex++) {
            var name = gl.getActiveUniformBlockName(_program, blockIndex);
            if (name != null) {
              var blockSize = gl.getActiveUniformBlockParameter(
                _program,
                blockIndex,
                gl.UNIFORM_BLOCK_DATA_SIZE
              );

              var subindices = gl.getActiveUniformBlockParameter(_program, blockIndex, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES);
              var uboVariableNames = new Array(subindices.length);
              for (var i = 0; i < uboVariableNames.length; i++) {
                uboVariableNames[i] = gl.getActiveUniform(_program, subindices[i]).name;
              }
              
              var uboVariableIndices = gl.getUniformIndices(
                _program,
                uboVariableNames
              );
              var uboVariableOffsets = gl.getActiveUniforms(
                _program,
                uboVariableIndices,
                gl.UNIFORM_OFFSET
              );

              this.uniformBuffers[name] = {
                name,
                blockIndex,
                blockSize,
                subnames: uboVariableNames,
                offsets: uboVariableOffsets,
                // ubo: new UniformBuffer(UBOLocationCounter, blockSize)
              };

              // UBOLocationCounter++;
            }
          }
        }
      }
    };

    this.setProgram(program);
  }

  class LitMaterial {
    constructor(settings = {}, programContainer = renderer.programContainers.lit) {
      return renderer.CreateLitMaterial(settings, programContainer);
    }
  }
  this.LitMaterial = LitMaterial;

  this.CreateLitMaterial = CreateLitMaterial;
  function CreateLitMaterial(settings = {}, programContainer = renderer.programContainers.lit) {
    // if (!programContainer && renderer.renderpipeline instanceof ForwardPBRRenderpipeline) {
    //   programContainer = renderer.programContainers.lit;
    // }

    return new NewLitMaterial(programContainer, settings);

    // var uniforms = {
    //   "useTexture": {type: "1i", name: "useTexture", arguments: [settings.albedoTexture == undefined ? 0 : 1]},
    //   "useNormalTexture": {type: "1i", name: "useNormalTexture", arguments: [settings.normalTexture == undefined ? 0 : 1]},
    //   "useMetallicRoughnessTexture": {type: "1i", name: "useMetallicRoughnessTexture", arguments: [settings.metallicRoughnessTexture == undefined ? 0 : 1]},
    //   "useEmissiveTexture": {type: "1i", name: "useEmissiveTexture", arguments: [settings.emissiveTexture == undefined ? 0 : 1]},
    //   "useOcclusionTexture": {type: "1i", name: "useOcclusionTexture", arguments: [settings.occlusionTexture == undefined ? 0 : 1]},
  
    //   "albedo": {type: "4f", name: "albedo", arguments: settings.albedoColor ?? [1, 1, 1, 1]},
    //   "metallic": {type: "1f", name: "metallic", arguments: [settings.metallic ?? 0]},
    //   "roughness": {type: "1f", name: "roughness", arguments: [settings.roughness ?? 1]},
    //   "emissiveFactor": {type: "3f", name: "emissiveFactor", arguments: settings.emissiveFactor ?? [0, 0, 0]},
  
    //   "alphaCutoff": {type: "1f", name: "alphaCutoff", arguments: [settings.alphaCutoff ?? 0]},
    //   "opaque": {type: "1i", name: "opaque", arguments: [settings.opaque ?? 1]},

    //   "doNoTiling": {type: "1i", name: "doNoTiling", arguments: [0]},

    //   "u_diffuseIBL": {type: "1i", name: "u_diffuseIBL", texture: true, arguments: [diffuseCubemapUnit - materialTextureUnitOffset]},
    //   "u_specularIBL": {type: "1i", name: "u_specularIBL", texture: true, arguments: [specularCubemapUnit - materialTextureUnitOffset]},
    //   "u_splitSum": {type: "1i", name: "u_splitSum", texture: true, arguments: [splitsumUnit - materialTextureUnitOffset]}
    // };
  
    // var textures = [];
    // if (settings.albedoTexture != undefined) {
    //   textures.push({type: gl.TEXTURE_2D, texture: settings.albedoTexture});
    //   uniforms["albedoTexture"] = {type: "1i", name: "albedoTexture", texture: true, arguments: [textures.length - 1]};
    // }
    // if (settings.normalTexture != undefined) {
    //   textures.push({type: gl.TEXTURE_2D, texture: settings.normalTexture});
    //   uniforms["normalTexture"] = {type: "1i", name: "normalTexture", texture: true, arguments: [textures.length - 1]};
    //   uniforms["normalStrength"] = {type: "1f", name: "normalStrength", arguments: [1]};
    // }
    // if (settings.metallicRoughnessTexture != undefined) {
    //   textures.push({type: gl.TEXTURE_2D, texture: settings.metallicRoughnessTexture});
    //   uniforms["metallicRoughnessTexture"] = {type: "1i", name: "metallicRoughnessTexture", texture: true, arguments: [textures.length - 1]};
    // }
    // if (settings.emissiveTexture != undefined) {
    //   textures.push({type: gl.TEXTURE_2D, texture: settings.emissiveTexture});
    //   uniforms["emissiveTexture"] = {type: "1i", name: "emissiveTexture", texture: true, arguments: [textures.length - 1]};
    // }
    // if (settings.occlusionTexture != undefined) {
    //   textures.push({type: gl.TEXTURE_2D, texture: settings.occlusionTexture});
    //   uniforms["occlusionTexture"] = {type: "1i", name: "occlusionTexture", texture: true, arguments: [textures.length - 1]};
    // }
  
    // return new Material(programContainer, uniforms, textures);
  }

  // this.Material = Material;
  // function Material(programContainer, uniforms = {}, textures = []) {
  //   var _this = this;

  //   if (!(programContainer instanceof ProgramContainer)) {
  //     throw new Error("Not a program container: " + programContainer);
  //   }
  //   this.programContainer = programContainer;

  //   this.name = "No name";
  //   this.doubleSided = false;
  //   this.doubleSidedShadows = true;
  //   this.opaque = true;

  //   this.uniforms = uniforms;
  //   this.textures = textures;

  //   if (Array.isArray(this.uniforms)) {
  //     throw new Error("Uniforms is array!");
  //   }

  //   // Add texture unit offset
  //   for (var name in this.uniforms) {
  //     var uniform = this.uniforms[name];

  //     if (uniform.texture) {
  //       for (var i = 0; i < uniform.arguments.length; i++) {
  //         uniform.arguments[i] += materialTextureUnitOffset;
  //       }
  //     }

  //     uniform.func = gl["uniform" + uniform.type + "v"].bind(gl);
  //   }
  
  //   this.copy = function() {
  //     var newUniforms = JSON.parse(JSON.stringify(this.uniforms));
  //     for (let name in newUniforms) {
  //       let uniform = newUniforms[name];
  //       if (uniform.texture) {
  //         for (let i = 0; i < uniform.arguments.length; i++) {
  //           uniform.arguments[i] -= materialTextureUnitOffset;
  //         }
  //       }
  //     }

  //     var m = new Material(this.programContainer, newUniforms, this.textures);
  //     m.name = this.name;
  //     m.doubleSided = this.doubleSided;
  //     m.doubleSidedShadows = this.doubleSidedShadows;
  //     m.opaque = this.opaque;

  //     return m;
  //   };

  //   this.isOpaque = function() {
  //     if (this.getUniform("opaque")) {
  //       return this.getUniform("opaque").arguments[0] != 0;
  //     }
      
  //     return this.opaque;
  //   };

  //   this.setUniform = function(name, values) {
  //     var valuesArray = Array.isArray(values) ? values : [values];
  //     var uniform = this.getUniform(name);

  //     if (uniform) {
  //       // bruh fix for texture
  //       uniform.arguments = valuesArray;
  //     }
  //     else if (this.programContainer.activeUniforms[name]) {
  //       var t = this.programContainer.activeUniforms[name].typeString;
  //       var isTexture = t.indexOf("SAMPLER") !== -1;
        
  //       var args = null;
  //       if (isTexture) {
  //         args = new Array(valuesArray.length);
  //         for (var i = 0; i < args.length; i++) {
  //           var textureIndex = this.textures.indexOf(valuesArray[i]); 
  //           if (textureIndex === -1) {
  //             this.textures.push(valuesArray[i]);
  //             args[i] = this.textures.length - 1;
  //           }
  //           else {
  //             args[i] = textureIndex;
  //           }

  //           args[i] += materialTextureUnitOffset;
  //         }
  //       }
  //       else {
  //         args = valuesArray;
  //       }

  //       var u = this.uniforms[name] = {
  //         texture: isTexture,
  //         type: getUniformSetType(t),
  //         name,
  //         arguments: args
  //       };
  //       u.func = gl["uniform" + u.type + "v"].bind(gl);
  //     }
  //     else {
  //       console.warn("Not a uniform: " + name);
  //     }
  //   };
  
  //   this.createUniform = function(name, type, values) {
  //     if (!this.getUniform(name)) {
  //       var u = this.uniforms[name] = {
  //         name,
  //         type,
  //         arguments: Array.isArray(values) ? values : [values]
  //       };
  //       u.func = gl["uniform" + u.type + "v"].bind(gl);
  //       return true;
  //     }
  
  //     return false;
  //   };
  
  //   this.getUniform = function(name) {
  //     return this.uniforms[name];
  //   };
  
  //   this.bindUniforms = function(camera) {
  //     // bruh, fixes un-used textures using same location
  //     // var i = 0;
  //     // for (var name in this.programContainer.activeUniforms) {
  //     //   if (!this.getUniform(name)) {
  //     //     var uniform = this.programContainer.activeUniforms[name];
  //     //     if (uniform.typeString.indexOf("SAMPLER") !== -1) {
  //     //       if (uniform.typeString == "SAMPLER_2D") {
  //     //         gl.uniform1i(uniform.location, splitsumUnit);
  //     //       }
  //     //       else if (uniform.typeString == "SAMPLER_CUBE") {
  //     //         gl.uniform1i(uniform.location, diffuseCubemapUnit);
  //     //       }
  //     //       else {
  //     //         gl.uniform1i(uniform.location, 20 + i);
  //     //         i++;
  //     //       }
  //     //     }
  //     //   }
  //     // }

  //     for (let i = 0; i < this.textures.length; i++) {
  //       let currentTexture = this.textures[i];
  //       let tex = currentTexture.texture ?? currentTexture;
  
  //       if (tex instanceof WebGLTexture) {
  //         gl.activeTexture(gl.TEXTURE0 + i + materialTextureUnitOffset);
  //         gl.bindTexture(currentTexture.type ?? gl.TEXTURE_2D, tex);
  //       }
  //     }

  //     for (let name in this.uniforms) {
  //       let uniform = this.uniforms[name];
  //       let location = getUniformLocation(uniform.name);

  //       if (location != null) {
  //         // Bruh (check if texture call)
  //         // if (uniform.texture) {
  //         //   (gl["uniform" + uniform.type]).call(gl, location, uniform.arguments[0] + materialTextureUnitOffset);
  //         // }
  //         // else {
  //         //   (gl["uniform" + uniform.type]).call(gl, location, ...uniform.arguments);
  //         // }

  //         if (uniform.func) {
  //           uniform.func(location, uniform.arguments);
  //         }
  //         else {
  //           gl["uniform" + uniform.type + "v"](location, uniform.arguments);
  //         }

  //         // if (uniform.texture) {
  //         //   var n = new Array(uniform.arguments.length);
  //         //   for (var i = 0; i < n.length; i++) {
  //         //     n[i] = uniform.arguments[i] + materialTextureUnitOffset;
  //         //   }
  //         //   // console.info(name, n);
  //         //   gl["uniform" + uniform.type + "v"](location, n);
  //         // }
  //         // else {
  //         //   gl["uniform" + uniform.type + "v"](location, uniform.arguments);
  //         // }
  //       }
  //     }
  
  //     // bruh
  //     var currentScene = renderer.scenes[renderer.currentScene];

  //     var time = (new Date() - renderer.startTime) / 1000; // bruh
  //     if (getUniformLocation("iTime") != null && typeof time != "undefined") gl.uniform1f(getUniformLocation("iTime"), time); // bruh

  //     // bruh
  //     var lights = currentScene.getLights();
  //     if (getUniformLocation("nrLights")) gl.uniform1i(getUniformLocation("nrLights"), lights.length);

  //     for (let i = 0; i < lights.length; i++) {
  //       let light = lights[i];

  //       if (getUniformLocation(`lights[${i}].type`))      gl.uniform1i(getUniformLocation(`lights[${i}].type`), light.type);
  //       if (getUniformLocation(`lights[${i}].position`))  gl.uniform3f(getUniformLocation(`lights[${i}].position`), light.position.x, light.position.y, light.position.z);
  //       if (getUniformLocation(`lights[${i}].direction`)) if (light.direction) gl.uniform3f(getUniformLocation(`lights[${i}].direction`), light.direction.x, light.direction.y, light.direction.z);
  //       if (getUniformLocation(`lights[${i}].angle`))     if ("angle" in light) gl.uniform1f(getUniformLocation(`lights[${i}].angle`), light.angle);
  //       if (getUniformLocation(`lights[${i}].color`))     gl.uniform3f(getUniformLocation(`lights[${i}].color`), light.color[0], light.color[1], light.color[2]);
  //     }

  //     if (getUniformLocation("sunDirection") != null)         gl.uniform3fv(getUniformLocation("sunDirection"), Vector.toArray(currentScene.sunDirection)); // bruh gc
  //     if (getUniformLocation("sunIntensity") != null)         gl.uniform3fv(getUniformLocation("sunIntensity"), Vector.toArray(currentScene.sunIntensity)); // ^
  //     if (getUniformLocation("environmentIntensity") != null) gl.uniform1f(getUniformLocation("environmentIntensity"), currentScene.environmentIntensity);
  //     if (getUniformLocation("ambientColor") != null)         gl.uniform3fv(getUniformLocation("ambientColor"), currentScene.ambientColor);
  //     if (getUniformLocation("fogDensity") != null)           gl.uniform1f(getUniformLocation("fogDensity"), currentScene.fogDensity);
  //     if (getUniformLocation("fogColor") != null)             gl.uniform4fv(getUniformLocation("fogColor"), currentScene.fogColor);

  //     var sps = this.programContainer.uniformBuffers["sharedPerScene"];
  //     if (sps && currentScene.sharedUBO) {
  //       gl.uniformBlockBinding(this.programContainer.program, sps.blockIndex, currentScene.sharedUBO.location);
  //     }
  //     else {
  //       if (getUniformLocation("projectionMatrix") != null)  gl.uniformMatrix4fv(getUniformLocation("projectionMatrix"), false, camera.projectionMatrix);
  //       if (getUniformLocation("inverseViewMatrix") != null) gl.uniformMatrix4fv(getUniformLocation("inverseViewMatrix"), false, camera.inverseViewMatrix);
  //       if (getUniformLocation("viewMatrix") != null)        gl.uniformMatrix4fv(getUniformLocation("viewMatrix"), false, camera.viewMatrix);
  //       // bruh ^^^ order matters
  //     }
  //   };
  
  //   this.bindModelMatrixUniform = function(matrix, prevMatrix, prevViewMatrix) {
  //     gl.uniformMatrix4fv(getUniformLocation("modelMatrix"), false, matrix);
  //     if (prevMatrix) {
  //       gl.uniformMatrix4fv(getUniformLocation("prevModelMatrix"), false, prevMatrix);
  //     }
  //     if (prevViewMatrix) {
  //       gl.uniformMatrix4fv(getUniformLocation("prevViewMatrix"), false, prevViewMatrix);
  //     }
  //   };

  //   this.setCulling = function(shadowPass = false) {
  //     if (shadowPass) {
  //       if (this.doubleSidedShadows) {
  //         renderer.disableCulling();
  //         // gl.disable(gl.CULL_FACE);
  //       }
  //       else {
  //         renderer.enableCulling();
  //         // gl.enable(gl.CULL_FACE);
  //       }
  //     }
  //     else {
  //       if (this.doubleSided) {
  //         renderer.disableCulling();
  //         // gl.disable(gl.CULL_FACE);
  //       }
  //       else {
  //         renderer.enableCulling();
  //         // gl.enable(gl.CULL_FACE);
  //       }
  //     }
  //   };

  //   var getUniformLocation = (name) => {
  //     return this.programContainer.activeUniforms[name]?.location;
  //   };
  //   this.getUniformLocation = getUniformLocation;

  //   Object.defineProperty(this, "program", {
  //     get: function() {
  //       return _this.programContainer.program;
  //     },
  //     set: val => {
  //       _this.programContainer.setProgram(val);
  //     }
  //   });
  // }

  let setMaterialCulling = (material, shadowPass = false) => {
    if (shadowPass) {
      if (material.doubleSidedShadows) {
        renderer.disableCulling();
      }
      else {
        renderer.enableCulling();
      }
    }
    else {
      if (material.doubleSided) {
        renderer.disableCulling();
      }
      else {
        renderer.enableCulling();
      }
    }
  };

  let bindMaterial = (material, settings = {}) => {
    bindMaterialToProgram(material, material.programContainer, settings);
  };

  let _sunDirectionArray = [ 0, 0, 0 ];
  let _sunIntensityArray = [ 0, 0, 0 ];
  let bindSharedLitUniforms = (scene, programContainer) => {
    let getUniformLocation = (loc) => {
      return programContainer.getUniformLocation(loc);
    };

    if (getUniformLocation("iTime")) gl.uniform1f(getUniformLocation("iTime"), time);

    // bruh
    var lights = scene.getLights();
    if (getUniformLocation("nrLights")) gl.uniform1i(getUniformLocation("nrLights"), lights.length);

    for (let i = 0; i < lights.length; i++) {
      let light = lights[i];

      if (getUniformLocation(`lights[${i}].type`))      gl.uniform1i(getUniformLocation(`lights[${i}].type`), light.type);
      if (getUniformLocation(`lights[${i}].position`))  gl.uniform3f(getUniformLocation(`lights[${i}].position`), light.position.x, light.position.y, light.position.z);
      if (getUniformLocation(`lights[${i}].direction`)) if (light.direction) gl.uniform3f(getUniformLocation(`lights[${i}].direction`), light.direction.x, light.direction.y, light.direction.z);
      if (getUniformLocation(`lights[${i}].angle`))     if ("angle" in light) gl.uniform1f(getUniformLocation(`lights[${i}].angle`), light.angle);
      if (getUniformLocation(`lights[${i}].color`))     gl.uniform3f(getUniformLocation(`lights[${i}].color`), light.color[0], light.color[1], light.color[2]);
    }

    if (getUniformLocation("sunDirection") != null)         gl.uniform3fv(getUniformLocation("sunDirection"), Vector.toArray(scene.sunDirection, _sunDirectionArray));
    if (getUniformLocation("sunIntensity") != null)         gl.uniform3fv(getUniformLocation("sunIntensity"), Vector.toArray(scene.sunIntensity, _sunIntensityArray));
    if (getUniformLocation("environmentIntensity") != null) gl.uniform1f(getUniformLocation("environmentIntensity"), scene.environmentIntensity);
    if (getUniformLocation("environmentMinLight") != null)  gl.uniform1f(getUniformLocation("environmentMinLight"), scene.environmentMinLight);
    if (getUniformLocation("ambientColor") != null)         gl.uniform3fv(getUniformLocation("ambientColor"), scene.ambientColor);
    if (getUniformLocation("fogDensity") != null)           gl.uniform1f(getUniformLocation("fogDensity"), scene.fogDensity);
    if (getUniformLocation("fogColor") != null)             gl.uniform4fv(getUniformLocation("fogColor"), scene.fogColor);
  };

  let isTextureUniform = (materialUniform) => {
    return materialUniform instanceof WebGLTexture || (Array.isArray(materialUniform) && materialUniform.every(u => u instanceof WebGLTexture));
  };

  let getTextureTargetFromUniformType = (type) => {
    type = type.toUpperCase();

    let target = null;
    if (type.indexOf("SAMPLER_2D_ARRAY") !== -1) target = gl.TEXTURE_2D_ARRAY;
    else if (type.indexOf("SAMPLER_CUBE") !== -1) target = gl.TEXTURE_CUBE_MAP;
    else if (type.indexOf("SAMPLER_3D") !== -1) target = gl.TEXTURE_3D;
    else if (type.indexOf("SAMPLER_2D") !== -1) target = gl.TEXTURE_2D;
    else {
      throw new Error("Unknown texture target: ", type);
    }

    return target;
  };

  let bindMaterialToProgram = (material, programContainer, settings = {}) => {
    let scene = renderer.getActiveScene();
    let currentTextureIndex = 0;

    let handleTextureBind = (texture, uniformName) => {
      if (!programContainer.activeUniforms[uniformName]) {
        return;
      }

      let ts = programContainer.activeUniforms[uniformName].typeString;
      let target = getTextureTargetFromUniformType(ts);

      if (Array.isArray(texture)) {
        var indices = Array.from({length: texture.length}, (_, i) => currentTextureIndex + i);

        gl.uniform1iv(
          programContainer.getUniformLocation(uniformName),
          indices,
        );

        for (var i = 0; i < texture.length; i++) {
          gl.activeTexture(gl.TEXTURE0 + currentTextureIndex);
          gl.bindTexture(target, texture[i]);

          currentTextureIndex++;
        }
      }
      else {
        gl.activeTexture(gl.TEXTURE0 + currentTextureIndex);
        gl.bindTexture(target, texture);

        gl.uniform1i(
          programContainer.getUniformLocation(uniformName),
          currentTextureIndex,
        );

        currentTextureIndex++;
      }
    };

    let getUniformLocation = (loc) => {
      return programContainer.getUniformLocation(loc);
    };

    if (settings.modelMatrix)     programContainer.setUniform("modelMatrix", settings.modelMatrix, false);
    if (settings.prevModelMatrix) programContainer.setUniform("prevModelMatrix", settings.prevModelMatrix, false);

    // Bind "lit" uniforms
    if (material.isLit && !settings.shadowPass) {
      handleTextureBind(renderer.splitsumTexture, "u_splitSum"); // ! bind splitsum texture first (gl.TEXTURE0) because it is a 2D texture and most unused texture slots are 2d textures (ex roughness texture, ao texture, emissive texture) and ends up reading from gl.TEXTURE0 
      handleTextureBind(scene.diffuseCubemap, "u_diffuseIBL");
      handleTextureBind(scene.specularCubemap, "u_specularIBL");
    }

    handleTextureBind(renderer.ditherTexture, "ditherTexture");

    // // Camera
    // let sps = programContainer.uniformBuffers["sharedPerScene"];
    // if (sps && scene.sharedUBO) {
    //   gl.uniformBlockBinding(programContainer.program, sps.blockIndex, scene.sharedUBO.location);
    // }
    // else {
    //   let camera = settings.camera;
    //   if (camera) {
    //     if (getUniformLocation("projectionMatrix") != null)  gl.uniformMatrix4fv(getUniformLocation("projectionMatrix"), false, camera.projectionMatrix);
    //     if (getUniformLocation("inverseViewMatrix") != null) gl.uniformMatrix4fv(getUniformLocation("inverseViewMatrix"), false, camera.inverseViewMatrix);
    //     if (getUniformLocation("viewMatrix") != null)        gl.uniformMatrix4fv(getUniformLocation("viewMatrix"), false, camera.viewMatrix);
    //   }
    // }
    // if (settings.prevViewMatrix)  programContainer.setUniform("prevViewMatrix", settings.prevViewMatrix, false);

    // Scene specific uniforms
    if (!this.currentBoundLitPrograms.has(programContainer)) {
      bindSharedLitUniforms(scene, programContainer);

      // Camera
      let sps = programContainer.uniformBuffers["sharedPerScene"];
      if (sps && scene.sharedUBO) {
        gl.uniformBlockBinding(programContainer.program, sps.blockIndex, scene.sharedUBO.location);
      }
      else {
        let camera = settings.camera;
        if (camera) {
          if (getUniformLocation("projectionMatrix") != null)  gl.uniformMatrix4fv(getUniformLocation("projectionMatrix"), false, camera.projectionMatrix);
          if (getUniformLocation("inverseViewMatrix") != null) gl.uniformMatrix4fv(getUniformLocation("inverseViewMatrix"), false, camera.inverseViewMatrix);
          if (getUniformLocation("viewMatrix") != null)        gl.uniformMatrix4fv(getUniformLocation("viewMatrix"), false, camera.viewMatrix);
        }
      }
      if (settings.prevViewMatrix)  programContainer.setUniform("prevViewMatrix", settings.prevViewMatrix, false);

      // Camera properties
      /** @type {Camera} */
      const camera = settings.camera;
      if (camera) {
        if (getUniformLocation("cameraNear") != null) gl.uniform1f(getUniformLocation("cameraNear"), camera.getNear?.());
        if (getUniformLocation("cameraFar") != null)  gl.uniform1f(getUniformLocation("cameraFar"), camera.getFar?.());
      }

      // Shadows
      if (!settings.shadowPass) {
        gl.uniform1i(programContainer.getUniformLocation("shadowQuality"), settings.shadowQuality ?? 0);
        gl.uniform1f(programContainer.getUniformLocation("shadowSampleRadius"), scene.shadowSampleRadius);
        
        if (renderer.shadowCascades && renderer.renderpipeline instanceof ForwardPBRRenderpipeline) {
          renderer.shadowCascades.setUniforms(material);
        }
      }

      this.currentBoundLitPrograms.set(programContainer, 1);
    }

    // Material specific uniforms
    // if (!this.currentBoundMaterials.has(material)) {
    programContainer.setUniform("opaque", material.opaque, false);

    for (let uniformKey in material.uniforms) {
      if (programContainer.activeUniforms[uniformKey]) {
        if (isTextureUniform(material.uniforms[uniformKey])) {
          handleTextureBind(material.uniforms[uniformKey], uniformKey);
        }
        else {
          programContainer.setUniform(uniformKey, material.uniforms[uniformKey]);
        }
      }
    }

    //   this.currentBoundMaterials.set(material, 1);
    // }
  };

  /*

    Mesh renderers

  */

  this.Skin = Skin;
  function Skin(joints, inverseBindMatrixData) {
    this.joints = joints;
    this.inverseBindMatrixData = inverseBindMatrixData;

    this.inverseBindMatrices = [];
    this.jointMatrices = [];
    this.jointData = new Float32Array(joints.length * 16);
    this.textureIndex = 25; // bruh
    this.parentNode = null;

    // var initialUpdate = true;
  
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
      var s = new Skin([...this.joints], new Float32Array(inverseBindMatrixData));
      s.parentNode = this.parentNode;
      return s;
    };

    this.update = function() {
      // if (initialUpdate) {
      //   this.updateMatrixTexture();
      //   initialUpdate = false;
      // }

      // bruh should update when joints change
      this.updateMatrixTexture();
    };
  
    this.bindTexture = function(mat) {
      gl.uniform1i(mat.programContainer.getUniformLocation("u_jointTexture"), this.textureIndex);
      gl.uniform1f(mat.programContainer.getUniformLocation("u_numJoints"), this.joints.length);

      gl.activeTexture(gl.TEXTURE0 + this.textureIndex); // bruh use counter in bindMaterial function instead of fixed texture index
      gl.bindTexture(gl.TEXTURE_2D, this.jointTexture);
    };

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
    };
  }

  class BaseMeshRenderer {
    drawOnDownscaledFramebuffer = false;

    constructor() {
      this.eventHandler = new EventHandler();
      this.on = this.eventHandler.on.bind(this.eventHandler);
      this.off = this.eventHandler.off.bind(this.eventHandler);
    }

    // render(camera, matrix, shadowPass = false, opaquePass = true, prevMatrix, settings = {}) {
    //   if (settings.downscaledPass != this.drawOnDownscaledFramebuffer) {
    //     return;
    //   }
    // }

    cleanup() {
      for (let meshData of this.meshData) {
        meshData.cleanup();
      }
    }

    setShadowQuality(quality, opaquePass = false) {
      for (var mat of this.materials) {
        if (mat.isOpaque() != opaquePass || mat.programContainer === null) {
          continue;
        }

        useProgram(mat.programContainer.program);
        gl.uniform1i(mat.programContainer.getUniformLocation("shadowQuality"), quality);
      }
    }
    
    isFullyOpaque() {
      for (let material of this.materials) {
        if (!material.isOpaque()) {
          return false;
        }
      }
      return true;
    }

    // bruh, this is technically not correct. Should combine all MeshData and then check convexity on that
    isConvex() {
      for (let meshData of this.meshData) {
        if (!meshData.isConvex()) {
          return false;
        }
      }

      return true;
    }
  }
  Renderer.BaseMeshRenderer = BaseMeshRenderer;

  class SkinnedMeshRenderer extends BaseMeshRenderer {
    constructor(skin, materials, meshData, options = {}) {
      super();

      this.materials = Array.isArray(materials) ? materials : [materials];
      this.meshData = Array.isArray(meshData) ? meshData : [meshData];
      this.drawMode = options.drawMode ?? gl.TRIANGLES;

      this.skin = skin;
    }

    update() {
      this.skin.update();
    }
  
    render(camera, matrix, shadowPass = false, opaquePass = true, prevMatrix, settings = {}) {
      let downscaledPass = settings.downscaledPass ?? false;
      if (downscaledPass != this.drawOnDownscaledFramebuffer) {
        return;
      }

      for (var i = 0; i < this.meshData.length; i++) {
        var md = this.meshData[i];
        var mat = this.materials[i];

        if (mat.programContainer === null) {
          continue;
        }

        // bruh fix arguments in render function above ^ (way to many, maybe just a 'settings' arg)
        if (settings.submeshCondition && !settings.submeshCondition(md, mat)) {
          continue;
        }

        if (mat.isOpaque() != opaquePass) {
          continue;
        }
  
        useProgram(mat.programContainer.program);
        md.bindBuffers(mat.programContainer);

        if (mat instanceof NewMaterial) {
          bindMaterial(mat, {
            camera,
            modelMatrix: matrix,
            prevModelMatrix: prevMatrix,
            prevViewMatrix: camera.prevViewMatrix,
            shadowPass,
          });
        }
        else {
          // bruh depricated
          mat.bindModelMatrixUniform(matrix, prevMatrix, camera.prevViewMatrix);
          mat.bindUniforms(camera);
        }

        this.skin.bindTexture(mat);

        // if (!shadowPass && renderer.shadowCascades) {
        //   renderer.shadowCascades.setUniforms(mat);
        // }

        if (shadowPass) {
          gl.uniform1iv(mat.programContainer.getUniformLocation("projectedTextures[0]"), [ 0, 0 ]);
        }
  
        setMaterialCulling(mat, shadowPass);
        md.drawCall(this.drawMode);
      }
    }

    copy() {
      var mats = [];
      for (var mat of this.materials) {
        mats.push(mat.copy());
      }
  
      var mds = [];
      for (var md of this.meshData) {
        mds.push(md.copy());
      }
  
      var newSkinnedMeshRenderer = new SkinnedMeshRenderer(this.skin.copy(), mats, mds);
      newSkinnedMeshRenderer.drawMode = this.drawMode;
  
      return newSkinnedMeshRenderer;
    }
  }
  Renderer.SkinnedMeshRenderer = SkinnedMeshRenderer;
  
  class MeshInstanceRenderer extends BaseMeshRenderer {
    constructor(materials, meshData, options = {}) {
      super();

      this.materials = Array.isArray(materials) ? materials : [materials];
      this.meshData = Array.isArray(meshData) ? meshData : [meshData];
      this.drawMode = options.drawMode ?? gl.TRIANGLES;
    
      // var matrixLocations = [];
      // for (var mat of this.materials) {
      //   matrixLocations.push(gl.getAttribLocation(mat.program, 'modelMatrix'));
      // }

      // Transform data
      this._matrixNeedsUpdate = false;
      this.matrixBuffer = gl.createBuffer();
      this.matrices = [];

      // Dither data
      this.enableDither = true;
      this.ditherBuffer = gl.createBuffer();
      this.ditherAmount = new WeakMap();
      this.ditherData = null;
      this._ditherNeedsUpdate = true;

      // Color data
      this.instanceColorBuffer = gl.createBuffer();
      this.instanceColors = new WeakMap();
      this.instanceColorData = null;
      this._colorNeedsUpdate = true;
    }

    // bruh bounding box does not take into account the size of each mesh, only its origin
    getAABB(dst) {
      dst = dst || new AABB();

      dst.isEmpty = true;
      Vector.zero(dst.bl);
      Vector.zero(dst.tr);

      const _tempAABB = new AABB();

      for (let meshData of this.meshData) {
        for (let matrix of this.matrices) {
          meshData.aabb.copy(_tempAABB).approxTransform(matrix);
          dst.extend(_tempAABB);
        }
      }

      // for (let matrix of this.matrices) {
      //   dst.extend(Matrix.getPosition(matrix));
      // }

      return dst;
    }
  
    addInstance(instance, forceUpdate = false) {
      if (!Matrix.isMatrix(instance)) {
        throw new Error("Instance must be a matrix");
      }

      const newMat = Matrix.copy(instance);
      return this.addInstanceDontCopy(newMat, forceUpdate);
    }

    addInstanceDontCopy(instance, forceUpdate = false) {
      this._matrixNeedsUpdate = true;
      this._ditherNeedsUpdate = true;
      this._colorNeedsUpdate = true;

      this.matrices.push(instance);
      this.instanceColors.set(instance, [1, 1, 1, 1]);
      if (this.enableDither) {
        this.ditherAmount.set(instance, 0);
      }
  
      if (forceUpdate) {
        this._updateMatrixData();
        this._updateColorBuffer();
        this._updateDitherBuffer();
      }
  
      return instance;
    }
  
    updateInstance(instance, newMatrix, updateBuffer = true) {
      if (this._matrixNeedsUpdate) {
        this._updateMatrixData();
        this._matrixNeedsUpdate = false;
      }

      Matrix.copy(newMatrix, instance);
      this.matrixData.set(instance, this.matrices.indexOf(instance) * 16);
  
      if (updateBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.matrixData);
      }

      this._ditherNeedsUpdate = true;
      this._colorNeedsUpdate = true;
    }
  
    removeInstance(instance) {
      const index = this.matrices.indexOf(instance);
      if (index === -1) {
        return;
      }

      this.matrices.splice(index, 1);

      this._matrixNeedsUpdate = true;
      this._ditherNeedsUpdate = true;
      this._colorNeedsUpdate = true;
    }

    removeAllInstances() {
      this.matrices = [];

      this._matrixNeedsUpdate = true;
      this._ditherNeedsUpdate = true;
      this._colorNeedsUpdate = true;
    }

    /**
     * Set the albedo color of an instance
     * @param {Matrix} instance 
     * @param {[number, number, number, number]} color 
     */
    setColor(instance, color) {
      this.instanceColors.set(instance, color);
      this._colorNeedsUpdate = true;
    }

    /**
     * Set the dither amount of an instance
     * @param {Matrix} instance 
     * @param {number} ditherAmount 
     */
    setDitherAmount(instance, ditherAmount = 0) {
      if (!this.enableDither) {
        return;
      }

      this.ditherAmount.set(instance, ditherAmount);
      this._ditherNeedsUpdate = true;
    }
  
    _updateMatrixData() {
      if (!this._matrixNeedsUpdate) {
        return;
      }
      this._matrixNeedsUpdate = false;

      this.matrixData = new Float32Array(this.matrices.length * 16);
      for (var i = 0; i < this.matrices.length; i++) {
        this.matrixData.set(this.matrices[i], i * 16);
      }
  
      gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.matrixData, gl.DYNAMIC_DRAW);
    }

    _updateColorBuffer() {
      if (!this._colorNeedsUpdate) {
        return;
      }
      this._colorNeedsUpdate = false;

      this.instanceColorData = new Float32Array(this.matrices.length * 4); // 4 color channels (rgba) for each instance
      this.instanceColorData.fill(1); // Default white

      for (let i = 0; i < this.matrices.length; i++) {
        // Only update part of array if the default color is overridden.
        const colorLookup = this.instanceColors.get(this.matrices[i]);
        if (!colorLookup) {
          continue;
        }

        this.instanceColorData.set(colorLookup, i * 4);
      }
  
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceColorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.instanceColorData, gl.STREAM_DRAW);
    }

    _updateDitherBuffer() {
      if (!this.enableDither) {
        return;
      }

      if (!this._ditherNeedsUpdate) {
        return;
      }
      this._ditherNeedsUpdate = false;

      this.ditherData = new Float32Array(this.matrices.length);
      for (var i = 0; i < this.matrices.length; i++) {
        this.ditherData[i] = this.ditherAmount.get(this.matrices[i]) ?? 0;
      }
  
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ditherBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.ditherData, gl.STREAM_DRAW);
    }
  
    render(camera, baseMatrix, shadowPass = false, opaquePass = true, prevMatrix, settings = {}) {
      let downscaledPass = settings.downscaledPass ?? false;
      if (downscaledPass != this.drawOnDownscaledFramebuffer) {
        return;
      }

      this._updateMatrixData();
      this._updateDitherBuffer();
      this._updateColorBuffer();

      if (this.matrices.length > 0) {
        for (var i = 0; i < this.meshData.length; i++) {
          var md = this.meshData[i];
          var mat = this.materials[i];

          if (mat.programContainer === null) {
            continue;
          }

          // bruh fix arguments in render function above ^ (way to many, maybe just a 'settings' arg)
          if (settings.submeshCondition && !settings.submeshCondition(md, mat)) {
            continue;
          }
  
          if (mat.isOpaque() != opaquePass) {
            continue;
          }

          useProgram(mat.programContainer.program);
          md.bindBuffers(mat.programContainer);
  
          // Model matrix
          gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
          var matrixLoc = mat.programContainer.getAttribLocation("modelMatrix");
          for (var j = 0; j < 4; j++) {
            const loc = matrixLoc + j;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 4 * 16, j * 16);
            vertexAttribDivisor(loc, 1);
          }

          // Color
          const loc = mat.programContainer.getAttribLocation("color");
          if (loc) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceColorBuffer);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 4 * 4, 0);
            vertexAttribDivisor(loc, 1);
          }

          // Dithering
          if (this.enableDither) {
            const loc = mat.programContainer.getAttribLocation("ditherAmount");
            if (loc) {
              gl.bindBuffer(gl.ARRAY_BUFFER, this.ditherBuffer);
              gl.enableVertexAttribArray(loc);
              gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 0, 0);
              vertexAttribDivisor(loc, 1);
            }
          }

          if (mat instanceof NewMaterial) {
            bindMaterial(mat, {
              camera,
              prevModelMatrix: prevMatrix,
              prevViewMatrix: camera.prevViewMatrix,
              shadowPass,
            });
          }
          else {
            // bruh depricated
            mat.bindUniforms(camera);
          }

          // if (!shadowPass && renderer.shadowCascades) {
          //   renderer.shadowCascades.setUniforms(mat);
          // }
  
          setMaterialCulling(mat, shadowPass);
          drawElementsInstanced(this.drawMode, md.indices.length, md.indexType, 0, this.matrices.length);
        }
      }
    }

    copy() {
      var mats = [];
      for (var mat of this.materials) {
        mats.push(mat.copy());
      }
  
      var mds = [];
      for (var md of this.meshData) {
        mds.push(md.copy());
      }
  
      var newMeshRenderer = new MeshInstanceRenderer(mats, mds);
      newMeshRenderer.drawMode = this.drawMode;
  
      return newMeshRenderer;
    }

    // setShadowQuality(quality, opaquePass = false) {
    //   for (var mat of this.materials) {
    //     if (mat.isOpaque() != opaquePass) {
    //       continue;
    //     }

    //     useProgram(mat.programContainer.program);
    //     gl.uniform1i(mat.programContainer.getUniformLocation("shadowQuality"), quality);
    //   }
    // }
  }
  Renderer.MeshInstanceRenderer = MeshInstanceRenderer;
  this.MeshInstanceRenderer = MeshInstanceRenderer;

  class MeshRenderer extends BaseMeshRenderer {
    constructor(materials, meshData, options = {}) {
      super();

      this.materials = Array.isArray(materials) ? materials : [materials];
      this.meshData = Array.isArray(meshData) ? meshData : [meshData];
      this.drawMode = options.drawMode ?? gl.TRIANGLES;

      if (this.materials.some(m => /*!(m instanceof Material) && */!(m instanceof NewMaterial))) {
        console.error(this.materials);
        throw new Error("Not a valid Material!");
      }

      if (this.meshData.some(m => !(m instanceof MeshData))) {
        console.error(this.meshData);
        throw new Error("Not a valid MeshData!");
      }

      // bruh, Still need to detect when updating this.meshData
      for (let meshData of this.meshData) {
        meshData.on("updateAABB", () => {
          this.eventHandler.fireEvent("updateAABB");
        });
      }
    }

    getAABB(dst) {
      dst = dst || new AABB();

      dst.isEmpty = true;
      Vector.zero(dst.bl);
      Vector.zero(dst.tr);

      for (var meshData of this.meshData) {
        dst.extend(meshData.aabb);
      }

      return dst;
    }
  
    render(camera, matrix, shadowPass = false, opaquePass = true, prevMatrix, settings = {}) {
      let downscaledPass = settings.downscaledPass ?? false;
      if (downscaledPass != this.drawOnDownscaledFramebuffer) {
        return;
      }

      for (var i = 0; i < this.meshData.length; i++) {
        var md = this.meshData[i];
        var mat = this.materials[i];

        if (mat.programContainer === null) {
          continue;
        }

        // bruh fix arguments in render function above ^ (way to many, maybe just a 'settings' arg)
        if (settings.submeshCondition && !settings.submeshCondition(md, mat)) {
          continue;
        }

        if (mat.isOpaque() != opaquePass) {
          continue;
        }
  
        useProgram(mat.programContainer.program);
        md.bindBuffers(mat.programContainer);
        
        if (mat instanceof NewMaterial) {
          bindMaterial(mat, {
            camera,
            modelMatrix: matrix,
            prevModelMatrix: prevMatrix,
            prevViewMatrix: camera.prevViewMatrix,
            shadowPass,
            shadowQuality: settings.shadowQuality,
          });
        }
        else {
          // bruh depricated
          mat.bindModelMatrixUniform(matrix, prevMatrix, camera.prevViewMatrix);
          mat.bindUniforms(camera);
        }

        // if (!shadowPass) {
        //   gl.uniform1i(mat.programContainer.getUniformLocation("shadowQuality"), settings.shadowQuality ?? 0);
          
        //   if (renderer.shadowCascades) {
        //     renderer.shadowCascades.setUniforms(mat);
        //   }
        // }

        if (shadowPass) {
          let loc = mat.programContainer.getUniformLocation("projectedTextures[0]");
          if (loc) {
            gl.uniform1iv(loc, [ 0, 0 ]);
          }
        }
  
        setMaterialCulling(mat, shadowPass);
        md.drawCall(this.drawMode);
      }
    }

    getInstanceMeshRenderer(programContainer = renderer.programContainers.litInstanced) {
      var mats = [];
      for (var mat of this.materials) {
        var newMat = mat.copy();
        newMat.programContainer = programContainer;
        mats.push(newMat);
      }

      var i = new MeshInstanceRenderer(mats, this.meshData, {
        drawMode: this.drawMode
      });
      return i;
    }

    copy() {
      // var mats = [];
      // for (var mat of this.materials) {
      //   mats.push(mat.copy());
      // }
  
      // var mds = [];
      // for (var md of this.meshData) {
      //   mds.push(md.copy());
      // }

      var mats = this.materials.map(m => m.copy());
      var mds = this.meshData.map(m => m.copy());
  
      var newMeshRenderer = new MeshRenderer(mats, mds);
      newMeshRenderer.drawMode = this.drawMode;
  
      return newMeshRenderer;
    }
  }
  this.MeshRenderer = MeshRenderer;

  /*

    Mesh data

  */

  this.MeshData = MeshData;
  function MeshData(data) {
    this.eventHandler = new EventHandler();
    this.on = this.eventHandler.on.bind(this.eventHandler);

    this.data = data;

    Object.defineProperty(this, "indices", {
      get: () => {
        return this.data?.indices?.bufferData;
      },
    });

    Object.defineProperty(this, "indexType", {
      get: () => {
        return this.data?.indices?.type ?? gl.UNSIGNED_INT;
      },
    });
  
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

    // console.count("create buffer");
    // console.warn("create buffer");
  
    var allVAOs = []; // bruh (extra memory?)
    this.vaos = new WeakMap();

    const _aabb = new AABB();
    const _tempVector = new Vector();

    let updateAABB = () => {
      _aabb.isEmpty = true;
      Vector.zero(_aabb.bl);
      Vector.zero(_aabb.tr);

      if (this.data.position) {
        for (var j = 0; j < this.data.position.bufferData.length; j += 3) {
          _tempVector.x = this.data.position.bufferData[j];
          _tempVector.y = this.data.position.bufferData[j + 1];
          _tempVector.z = this.data.position.bufferData[j + 2];
          _aabb.extend(_tempVector);
        }
      }

      this.eventHandler.fireEvent("updateAABB");
    };

    updateAABB();

    Object.defineProperty(this, "aabb", {
      get: () => {
        return _aabb;
      },
      set: () => {
        throw new Error("Set MeshData aabb");
      }
    });
  
    this.updateData = function(data, bufferUsageMode = gl.DYNAMIC_DRAW) {
      this.data = data;

      for (let key of Object.keys(data)) {
        var b = this.buffers.find(b => b.attribute == key);
        if (
          b &&
          b.size == data[key].size &&
          b.target == (data[key].target ?? gl.ARRAY_BUFFER) &&
          b.type == (data[key].type ?? gl.FLOAT) &&
          b.stride == (data[key].stride ?? 0)
        ) {
          gl.bindBuffer(b.target, b.buffer);
          gl.bufferData(b.target, data[key].bufferData, bufferUsageMode);
        }
        else {
          console.warn("New attribute or missmatching size, target, type or stride: " + key);
        }
      }

      updateAABB();
    };

    this.setAttribute = function(attribute, data, bufferUsageMode = gl.DYNAMIC_DRAW) {
      var b = this.buffers.find(b => b.attribute == attribute);
      if (b) {
        gl.bindBuffer(b.target, b.buffer);
        gl.bufferData(b.target, data.bufferData, bufferUsageMode);

        if ("size" in data) b.size = data.size;
        if ("target" in data) b.target = data.target;
        if ("type" in data) b.type = data.type;
        if ("stride" in data) b.stride = data.stride;

        this.data[attribute] = data;
      }
      else {
        this.buffers.push({
          attribute: attribute,
          buffer: createBuffer(data.bufferData, data.target ?? gl.ARRAY_BUFFER),
          size: data.size,
          target: data.target ?? gl.ARRAY_BUFFER,
          type: data.type ?? gl.FLOAT,
          stride: data.stride ?? 0
        });
      }

      if (attribute === "position") {
        updateAABB();
      }
    };

    this.recalculateNormals = function() {
      if (!(this.data.position && this.data.indices)) {
        throw new Error("Can't generate normals! Missing positions or indicies");
      }

      var normalData = calculateNormals(
        this.data.position.bufferData,
        this.data.indices.bufferData
      );
      
      this.setAttribute("normal", {
        bufferData: normalData,
        size: 3
      });
    };

    this.recalculateTangents = function() {
      if (!(this.data.position && this.data.indices && this.data.uv)) {
        throw new Error("Can't generate tangents! Missing positions, indicies or uvs");
      }

      var tangentData = calculateTangents(
        this.data.position.bufferData,
        this.data.indices.bufferData,
        this.data.uv.bufferData
      );

      this.setAttribute("tangent", {
        bufferData: tangentData,
        size: 4
      });
    };

    this.applyTransform = function(matrix) {
      if (this.data && this.data.position && this.data.indices) {
        for (let i = 0; i < this.data.position.bufferData.length; i += 3) {
          let v = {
            x: this.data.position.bufferData[i + 0],
            y: this.data.position.bufferData[i + 1],
            z: this.data.position.bufferData[i + 2]
          };
          v = Matrix.transformVector(matrix, v);
          this.data.position.bufferData[i + 0] = v.x;
          this.data.position.bufferData[i + 1] = v.y;
          this.data.position.bufferData[i + 2] = v.z;
        }

        this.setAttribute("position", this.data.position);
      }
      else {
        throw new Error("Can't transform MeshData. MeshData is missing 'position' or 'indices' attribute");
      }
    };

    this.getSubdivision = function(levels = 1, connected = false) {
      let vertices = this.data.position.bufferData;
      let indices = this.data.indices.bufferData;
      let uvs = this.data.uv.bufferData;

      function Edge(a, b, v, last) {
        this.a = a;
        this.b = b;
        this.v = v;
        this.last = last;
      }

      let getVertex = (index, dst) => {
        dst = dst || new Vector();
        dst.x = vertices[index * 3 + 0];
        dst.y = vertices[index * 3 + 1];
        dst.z = vertices[index * 3 + 2];
        return dst;
      };

      let getUV = (index, dst) => {
        dst = dst || new Vector();
        dst.x = uvs[index * 2 + 0];
        dst.y = uvs[index * 2 + 1];
        dst.z = 0;
        return dst;
      };

      let newVertices = [];
      let newUVs = [];
      let newIndices = [];

      // newVertices = [...vertices];
      // newUVs = [...uvs];
      // newIndices = Array.from(indices);
      
      let allEdges = new Map();

      let edgeHasVertex = (edge) => {
        return allEdges.get(`${edge[0]}-${edge[1]}`);// || allEdges.get(`${edge[1]}-${edge[0]}`);
        // return allEdges.find(e => (e.a == edge[0] && e.b == edge[1] || (e.b == edge[0] && e.a == edge[1])));
      };

      // let getConnectedVertices = (vertex) => {
      //   let connectedVertices = [];

      //   for (let i = 0; i < indices.length; i += 3) {
      //     let ia = indices[i + 0];
      //     let ib = indices[i + 1];
      //     let ic = indices[i + 2];

      //     if (
      //       ia == vertex ||
      //       ib == vertex ||
      //       ic == vertex
      //     ) {
      //       connectedVertices.push(ia, ib, ic);
      //     }
      //   }

      //   connectedVertices = new Set(connectedVertices);
      //   connectedVertices.delete(vertex);
      //   connectedVertices = Array.from(connectedVertices);

      //   return connectedVertices;
      // };

      let getConnectedTriangles = (edge) => {
        let connectedTriangles = [];

        for (let i = 0; i < indices.length; i += 3) {
          let ia = indices[i + 0];
          let ib = indices[i + 1];
          let ic = indices[i + 2];

          let edges = [
            [ia, ib],
            [ib, ic],
            [ic, ia]
          ];
          let last = [
            ic,
            ia,
            ib
          ];

          for (let j = 0; j < edges.length; j++) {
            let currentEdge = edges[j];
            if ((currentEdge[0] == edge[0] && currentEdge[1] == edge[1]) || (currentEdge[0] == edge[1] && currentEdge[1] == edge[0])) {
              connectedTriangles.push({
                a: edge[0],
                b: edge[1],
                last: last[j],
              });
            }
          }
        }

        return connectedTriangles;
      };

      // Compute connected vertices
      let connectedVertices = new Array(vertices.length / 3);
      for (let i = 0; i < connectedVertices.length; i++) {
        connectedVertices[i] = [];
      }

      for (let i = 0; i < indices.length; i += 3) {
        let ia = indices[i + 0];
        let ib = indices[i + 1];
        let ic = indices[i + 2];

        let edges = [
          [ia, ib],
          [ib, ic],
          [ic, ia]
        ];
        let last = [
          ic,
          ia,
          ib
        ];

        for (let j = 0; j < last.length; j++) {
          connectedVertices[last[j]].push(...edges[j]);
        }
      }

      // Remove duplicates
      for (let i = 0; i < connectedVertices.length; i++) {
        connectedVertices[i] = Array.from(new Set(connectedVertices[i]));
      }

      // Move existing vertices
      const _pos = new Vector();
      let newPosition = Vector.zero();
      for (let i = 0; i < vertices.length / 3; i++) {
        // let connectedVertices = getConnectedVertices(i);
        let currentConnectedVertices = connectedVertices[i];
        let n = currentConnectedVertices.length;

        let beta = n == 2 ? 1 / 8 : n == 3 ? 3 / 16 : 3 / 8 / n;
        let center = n >= 3 ? 1 - n * beta : 3 / 4;

        Vector.zero(newPosition);
        for (let vertex of currentConnectedVertices) {
          Vector.multiply(getVertex(vertex), beta, _pos);
          Vector.addTo(newPosition, _pos);
        }
        Vector.multiply(getVertex(i), center, _pos);
        Vector.addTo(newPosition, _pos);

        newVertices[i * 3 + 0] = newPosition.x;
        newVertices[i * 3 + 1] = newPosition.y;
        newVertices[i * 3 + 2] = newPosition.z;

        newUVs[i * 2 + 0] = uvs[i * 2 + 0];
        newUVs[i * 2 + 1] = uvs[i * 2 + 1];
      }

      // 
      for (let i = 0; i < indices.length; i += 3) {
        let ia = indices[i + 0];
        let ib = indices[i + 1];
        let ic = indices[i + 2];

        let edges = [
          [ia, ib],
          [ib, ic],
          [ic, ia]
        ];
        let last = [
          ic,
          ia,
          ib
        ];

        let newTriangleVertices = [];

        for (let j = 0; j < edges.length; j++) {
          let edge = edges[j];

          if (!connected) {
            let edgeClass = edgeHasVertex(edge);
            if (!edgeClass) {
              let ct = getConnectedTriangles(edge);
              if (ct.length == 2) {
                // Position
                let newPosition = Vector.zero();
                Vector.addTo(newPosition, Vector.multiply(getVertex(ct[0].a), 3 / 8));
                Vector.addTo(newPosition, Vector.multiply(getVertex(ct[0].b), 3 / 8));
                Vector.addTo(newPosition, Vector.multiply(getVertex(ct[0].last), 1 / 8));
                Vector.addTo(newPosition, Vector.multiply(getVertex(ct[1].last), 1 / 8));

                newVertices.push(newPosition.x, newPosition.y, newPosition.z);
                newTriangleVertices.push(newVertices.length / 3 - 1);

                // UV
                let newUV = Vector.zero();
                Vector.addTo(newUV, Vector.multiply(getUV(ct[0].a), 3 / 8));
                Vector.addTo(newUV, Vector.multiply(getUV(ct[0].b), 3 / 8));
                Vector.addTo(newUV, Vector.multiply(getUV(ct[0].last), 1 / 8));
                Vector.addTo(newUV, Vector.multiply(getUV(ct[1].last), 1 / 8));
                newUVs.push(newUV.x, newUV.y);
              }
              else if (ct.length == 1) {
                let newPosition = Vector.zero();
                Vector.addTo(newPosition, Vector.multiply(getVertex(ct[0].a), 1 / 2));
                Vector.addTo(newPosition, Vector.multiply(getVertex(ct[0].b), 1 / 2));

                newVertices.push(newPosition.x, newPosition.y, newPosition.z);
                newTriangleVertices.push(newVertices.length / 3 - 1);

                let newUV = Vector.zero();
                Vector.addTo(newUV, Vector.multiply(getUV(ct[0].a), 1 / 2));
                Vector.addTo(newUV, Vector.multiply(getUV(ct[0].b), 1 / 2));
                newUVs.push(newUV.x, newUV.y);
              }
              else {
                console.warn(ct.length);
              }

              // allEdges.push(new Edge(edge[0], edge[1], newVertices.length / 3 - 1, null));
              let e = new Edge(edge[0], edge[1], newVertices.length / 3 - 1, null);
              allEdges.set(`${edge[0]}-${edge[1]}`, e);
              allEdges.set(`${edge[1]}-${edge[0]}`, e);
            }
            else {
              newTriangleVertices.push(edgeClass.v);
            }
          }
          else {
            let edgeClass = edgeHasVertex(edge);
            if (!edgeClass) {
              const newPosition = Vector.zero();
              Vector.addTo(newPosition, Vector.multiply(getVertex(edge[0]), 3 / 8));
              Vector.addTo(newPosition, Vector.multiply(getVertex(edge[1]), 3 / 8));
              Vector.addTo(newPosition, Vector.multiply(getVertex(last[j]), 1 / 8));

              newVertices.push(newPosition.x, newPosition.y, newPosition.z);
              newTriangleVertices.push(newVertices.length / 3 - 1);

              const newUV = Vector.zero();
              Vector.addTo(newUV, Vector.multiply(getUV(edge[0]), 3 / 8));
              Vector.addTo(newUV, Vector.multiply(getUV(edge[1]), 3 / 8));
              Vector.addTo(newUV, Vector.multiply(getUV(last[j]), 1 / 8));
              newUVs.push(newUV.x, newUV.y);

              edgeClass = new Edge(edge[0], edge[1], newVertices.length / 3 - 1, last[j]);
              // allEdges.push(edgeClass);
              allEdges.set(`${edge[0]}-${edge[1]}`, edgeClass);
              allEdges.set(`${edge[1]}-${edge[0]}`, edgeClass);
            }
            else {
              let v = Vector.multiply(getVertex(last[j]), 1 / 8);
              newVertices[edgeClass.v * 3 + 0] += v.x;
              newVertices[edgeClass.v * 3 + 1] += v.y;
              newVertices[edgeClass.v * 3 + 2] += v.z;

              {
                let v = Vector.multiply(getUV(last[j]), 1 / 8);
                newUVs[edgeClass.v * 2 + 0] += v.x;
                newUVs[edgeClass.v * 2 + 1] += v.y;
              }

              newTriangleVertices.push(edgeClass.v);
            }
          }
        }

        newIndices.push(ia, newTriangleVertices[0], newTriangleVertices[2]);
        newIndices.push(newTriangleVertices[0], ib, newTriangleVertices[1]);
        newIndices.push(newTriangleVertices[1], ic, newTriangleVertices[2]);
        newIndices.push(newTriangleVertices[0], newTriangleVertices[1], newTriangleVertices[2]);

        // newIndices.push(ia, ib, ic);
      }

      // console.info(newIndices, newVertices);
      // console.info(indices, vertices);

      // for (let i = 0; i < newVertices.length; i += 3) {
      //   let sphere = scene.add(renderer.CreateShape("sphere"));
      //   sphere.transform.scale = Vector.fill(0.03);
      //   sphere.transform.position.x = newVertices[i];
      //   sphere.transform.position.y = newVertices[i + 1];
      //   sphere.transform.position.z = newVertices[i + 2];

      //   if (i < vertices.length) {
      //     sphere.meshRenderer.materials[0].setUniform("albedo", [0, 1, 0, 1]);
      //   }
      // }

      // console.log(newUVs);

      return {
        indices: {
          bufferData: new Uint32Array(newIndices),
          type: 5125, // UInt32
          target: gl.ELEMENT_ARRAY_BUFFER
        },
        position: {
          bufferData: new Float32Array(newVertices),
          size: 3
        },
        uv: {
          bufferData: new Float32Array(newUVs),
          size: 2
        },
      };
    };

    this.subdivide = function(levels = 1) {
      let data = this.getSubdivision(levels);

      this.setAttribute("indices", data.indices);
      this.setAttribute("position", data.position);

      this.recalculateNormals();
      // this.recalculateTangents();
    };

    this.isConvex = function() {
      const indices = this.data.indices.bufferData;

      const getVertexPosition = (buffer, offset) => {
        const p = new Vector(
          buffer[offset * 3],
          buffer[offset * 3 + 1],
          buffer[offset * 3 + 2]
        );
        return p;
      };

      const validateFace = (origin, normal) => {
        for (let i = 0; i < indices.length; i++) {
          const index = indices[i];
          const vertex = getVertexPosition(indices, index);

          const signedDistance = getSignedDistanceToPlane(vertex, origin, normal);
          if (signedDistance > 0) {
            return false;
          }
        }

        return true;
      };

      for (let i = 0; i < indices.length; i += 3) {
        const indexA = indices[i];
        const indexB = indices[i + 1];
        const indexC = indices[i + 2];
    
        const vertexA = getVertexPosition(indices, indexA);
        const vertexB = getVertexPosition(indices, indexB);
        const vertexC = getVertexPosition(indices, indexC);

        const normal = getTriangleNormal([ vertexA, vertexB, vertexC ]);
        const origin = vertexA;

        const validation = validateFace(origin, normal);
        if (!validation) {
          return false;
        }
      }

      return true;
    };

    // bruh
    this.copy = function() {
      return this;
    };
  
    // this.getAttribLocations = function(program) {
    //   var output = {};
    //   for (var i = 0; i < this.buffers.length; i++) {
    //     var buffer = this.buffers[i];
    //     if (buffer.target != gl.ELEMENT_ARRAY_BUFFER) {
    //       output[buffer.attribute] = gl.getAttribLocation(program, buffer.attribute);
    //     }
    //   }
      
    //   return output;
    // }
  
    this.bindBuffers = function(programContainer) {
      var program = programContainer.program;

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

        var attribLocations = programContainer.activeAttributes;
  
        for (var i = 0; i < this.buffers.length; i++) {
          var buffer = this.buffers[i];
          if (buffer.target == gl.ELEMENT_ARRAY_BUFFER) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.buffer);
          }
          else {
            var attribLocation = attribLocations[buffer.attribute];
            if (typeof attribLocation !== "undefined") {
              attribLocation = attribLocation.location;
              if (attribLocation != -1) {
                gl.bindBuffer(buffer.target, buffer.buffer);
                gl.enableVertexAttribArray(attribLocation);
                vertexAttribDivisor(attribLocation, 0);
                gl.vertexAttribPointer(attribLocation, buffer.size, buffer.type, false, buffer.stride, 0);
              }
            }
          }
        }
      }
      else {
        bindVertexArray(vao);
      }
    };

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
    };

    this.cleanup = function() {
      for (var vao of allVAOs) {
        deleteVertexArray(vao);
      }

      for (var buffer of this.buffers) {
        gl.deleteBuffer(buffer.buffer);
      }
    };

    // function calculateNormals(vertices, indices) {
    //   // bruh fix for stride
    //   function getVertex(i) {
    //     return {
    //       x: vertices[i * 3],
    //       y: vertices[i * 3 + 1],
    //       z: vertices[i * 3 + 2]
    //     };
    //   }

    //   if (indices) {
    //     var normalTable = new Array(vertices.length / 3);
    //     for (var i = 0; i < normalTable.length; i++) {
    //       normalTable[i] = [];
    //     }

    //     var ib = indices;
    //     for (var i = 0; i < ib.length; i += 3) {
    //       var v0 = getVertex(ib[i]);
    //       var v1 = getVertex(ib[i + 1]);
    //       var v2 = getVertex(ib[i + 2]);

    //       var normal = getTriangleNormal([v0, v1, v2]);

    //       normalTable[ib[i]].push(normal);
    //       normalTable[ib[i + 1]].push(normal);
    //       normalTable[ib[i + 2]].push(normal);
    //     }

    //     var outNormals = [];
    //     for (var i = 0; i < normalTable.length; i++) {
    //       var normal = Vector.divide(normalTable[i].reduce((a, b) => {
    //         return Vector.add(a, b);
    //       }, Vector.zero()), normalTable[i].length);

    //       outNormals.push(normal.x, normal.y, normal.z);
    //     }

    //     return new Float32Array(outNormals);
    //   }
    //   else {
    //     var normals = new Float32Array(vertices.length);
    //     for (var i = 0; i < vertices.length / 3; i += 3) {
    //       var v0 = getVertex(i);
    //       var v1 = getVertex(i + 1);
    //       var v2 = getVertex(i + 2);

    //       var normal = getTriangleNormal([v0, v1, v2]);

    //       normals[i * 3] = normal.x;
    //       normals[i * 3 + 1] = normal.y;
    //       normals[i * 3 + 2] = normal.z;

    //       normals[(i + 1) * 3] = normal.x;
    //       normals[(i + 1) * 3 + 1] = normal.y;
    //       normals[(i + 1) * 3 + 2] = normal.z;

    //       normals[(i + 2) * 3] = normal.x;
    //       normals[(i + 2) * 3 + 1] = normal.y;
    //       normals[(i + 2) * 3 + 2] = normal.z;
    //     }

    //     return normals;
    //   }
    // }

    // function calculateTangents(vertices, indices, uvs) {
    //   // bruh use vectors instead (maybe...)
    //   // bruh fix for stride
    //   function getVertex(i) {
    //     return [
    //       vertices[i * 3],
    //       vertices[i * 3 + 1],
    //       vertices[i * 3 + 2]
    //     ];
    //   }

    //   function getUV(i) {
    //     return [
    //       uvs[i * 2],
    //       uvs[i * 2 + 1]
    //     ];
    //   }

    //   function subtract(a, b) {
    //     var out = new Array(a.length);
    //     for (var i = 0; i < a.length; i++) {
    //       out[i] = a[i] - b[i];
    //     }
    //     return out;
    //   }

    //   function setTangentVector(tangents, i0, i1, i2) {
    //     var v0 = getVertex(i0);
    //     var v1 = getVertex(i1);
    //     var v2 = getVertex(i2);

    //     var uv0 = getUV(i0);
    //     var uv1 = getUV(i1);
    //     var uv2 = getUV(i2);
        
    //     var deltaPos1 = subtract(v1, v0);
    //     var deltaPos2 = subtract(v2, v0);

    //     var deltaUV1 = subtract(uv1, uv0);
    //     var deltaUV2 = subtract(uv2, uv0);

    //     var r = 1 / (deltaUV1[0] * deltaUV2[1] - deltaUV1[1] * deltaUV2[0]);

    //     var tangent;
    //     if (isNaN(r) || !isFinite(r)) {
    //       failedTangents++;

    //       var normal = getTriangleNormal([
    //         Vector.fromArray(v0),
    //         Vector.fromArray(v1),
    //         Vector.fromArray(v2)
    //       ]);
    //       tangent = Vector.toArray(Vector.findOrthogonal(normal));
    //     }
    //     else {
    //       tangent = [
    //         (deltaPos1[0] * deltaUV2[1] - deltaPos2[0] * deltaUV1[1]) * r,
    //         (deltaPos1[1] * deltaUV2[1] - deltaPos2[1] * deltaUV1[1]) * r,
    //         (deltaPos1[2] * deltaUV2[1] - deltaPos2[2] * deltaUV1[1]) * r
    //       ];
    //     }

    //     // tangents = Vector.toArray(Vector.normalize(Vector.fromArray(tangents)));

    //     var epsilon = 0.01;
    //     tangent[0] += epsilon;
    //     tangent[1] += epsilon;
    //     tangent[2] += epsilon;

    //     tangents[i0 * 3] = tangent[0];
    //     tangents[i0 * 3 + 1] = tangent[1];
    //     tangents[i0 * 3 + 2] = tangent[2];

    //     tangents[i1 * 3] = tangent[0];
    //     tangents[i1 * 3 + 1] = tangent[1];
    //     tangents[i1 * 3 + 2] = tangent[2];

    //     tangents[i2 * 3] = tangent[0];
    //     tangents[i2 * 3 + 1] = tangent[1];
    //     tangents[i2 * 3 + 2] = tangent[2];

    //     console.info(tangent);

    //     return tangent;
    //   }

    //   var failedTangents = 0;
    //   var tangents = new Float32Array(vertices.length);

    //   if (!indices) {
    //     for (var i = 0; i < vertices.length / 3; i += 3) {
    //       setTangentVector(tangents, i, i + 1, i + 2);
    //     }
    //   }
    //   else {
    //     var ib = indices;
    //     for (var i = 0; i < ib.length; i += 3) {
    //       setTangentVector(tangents, ib[i], ib[i + 1], ib[i + 2]);
    //     }
    //   }

    //   if (failedTangents.length > 0) {
    //     console.warn(failedTangents + " tangents generated without UVs");
    //   }
    //   return tangents;
    // }
  }

  /*

    Textures

  */

  // async function loadCubemap(path, fileExtension) {
  //   var texture = gl.createTexture();
  //   // gl.activeTexture(textureLocation);
  //   gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    
  //   const faceInfos = [
  //     {target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: "pos-x"},
  //     {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: "neg-x"},
  //     {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: "pos-y"},
  //     {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: "neg-y"},
  //     {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: "pos-z"},
  //     {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: "neg-z"}
  //   ];
  //   for (var faceInfo of faceInfos) {
  //     var image = await loadImage(path + faceInfo.url + "." + fileExtension);
  //     gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  //     gl.texImage2D(faceInfo.target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  //   }
  
  //   gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  //   gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  
  //   return texture;
  // }

  this.loadMetalRoughness = function(metalSrc, roughnessSrc) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 255, 0, 255]));

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
      gl.generateMipmap(gl.TEXTURE_2D);
    }).catch(err => {
      throw err;
    });

    return texture;
  };

  this.loadTexture = loadTexture;
  function loadTexture(url, settings = {}) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
  
    if (typeof url == "string") {
      var image = new Image();
      image.crossOrigin = "Anonymous";
      image.src = url;
      image.addEventListener("error", () => {
        console.error(`Failed to load image's URL: ${url}`);
      });
      image.onload = function() {
        setupTexture(texture, image, settings);
      };
    }
    else {
      setupTexture(texture, url, settings);
    }
  
    return texture;
  }

  this.loadTextureAsync = loadTextureAsync;
  async function loadTextureAsync(url, settings = {}) {
    let image;
    if (typeof url == "string") {
      image = await loadImage(url);
    }
    else {
      image = url;
    }

    var texture = gl.createTexture();
    return setupTexture(texture, image, settings);
  }

  function setupTexture(texture, image, settings) {
    if (!Object.prototype.hasOwnProperty.call(settings, "anisotropicFiltering")) settings.anisotropicFiltering = true;
    if (!Object.prototype.hasOwnProperty.call(settings, "generateMipmap")) settings.generateMipmap = true;
    // if (!settings.hasOwnProperty("flipY")) settings.flipY = true;
    // bruh flipY förstör för alla andra :(

    if (Object.prototype.hasOwnProperty.call(settings, "maxTextureSize") && image.width > settings.maxTextureSize) {
      var aspect = image.width / image.height;
      image = resizeImage(image, settings.maxTextureSize, settings.maxTextureSize / aspect);
    }

    // Make textures 2^N
    if (renderer.version == 1) {
      var s = Math.pow(2, Math.floor(Math.log2(image.width)));
      image = resizeImage(image, s, s);
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, settings.flipY ? true : false); // bruh :(
    gl.texImage2D(gl.TEXTURE_2D, settings.level ?? 0, settings.internalFormat ?? gl.RGBA, settings.format ?? gl.RGBA, gl.UNSIGNED_BYTE, image);

    // Mipmapping
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

    // Anisotropic filtering
    if (settings.anisotropicFiltering && renderer.EXT_texture_filter_anisotropic) {
      const ext = renderer.EXT_texture_filter_anisotropic;
      const max = renderer.MAX_ANISOTROPY;
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
    }

    return texture;
  }

  /* 

    Mesh data generation
  
  */

  this.loadGLTF = async function(path, loadSettings = {}) {
    console.groupCollapsed("Load GLTF: " + path);
    var gltfData = await this.getGLTFData(path);
    var gameObject = await this.createGameObjectFromGLTFData(gltfData, loadSettings);
    console.groupEnd();

    return gameObject;
  };

  this.getGLTFData = async function(path) {
    return new Promise((resolve, reject) => {
      var oReq = new XMLHttpRequest();
      oReq.open("GET", path, true);
      oReq.responseType = "arraybuffer";
  
      oReq.onload = async function(/*oEvent*/) {
        if (oReq.status != 200) {
          reject("Could not load GLTF model: " + oReq.statusText);
          return;
        }

        var arrayBuffer = oReq.response;
        if (arrayBuffer) {
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

          resolve({ json, buffers, path });
        }
      };
  
      oReq.send(null);
    });
  };

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

  this.createGameObjectFromGLTFData = async function(glftData, loadSettings = {}) {
    var { json, buffers, path } = glftData;

    var texturesCreated = [];
    var materialsCreated = [];

    console.time("Loading " + path);
    console.info(json);

    var end = path.indexOf(".glb") + 4;
    var start = path.lastIndexOf("/", end) + 1;
    var mainParent = new GameObject(path.slice(start, end));

    var currentNodes = [];
    var outObjects = [];
    var skinsToResolve = [];

    var scene = json.scene ?? 0;
    var currentScene = json.scenes[scene];
    for (let i = 0; i < currentScene.nodes.length; i++) {
      outObjects = outObjects.concat((await AddChildrenRecursive(currentScene.nodes[i])));
    }

    mainParent.addChildren(outObjects);

    if (!loadSettings.disableAnimations && !objectIsEmpty(json.animations)) {
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
            let outputVectors = [];
            for (let k = 0; k < outputBuffer.byteLength / 4; k += 3) {
              outputVectors.push({
                x: outputBuffer[k],
                y: outputBuffer[k + 1],
                z: outputBuffer[k + 2]
              });
            }

            outBuf = outputVectors;
          }
          else if (outputAccessor.type == "VEC4") {
            let outputVectors = [];
            for (let k = 0; k < outputBuffer.byteLength / 4; k += 4) {
              outputVectors.push({
                x: outputBuffer[k],
                y: outputBuffer[k + 1],
                z: outputBuffer[k + 2],
                w: outputBuffer[k + 3]
              });
            }

            outBuf = outputVectors;
          }

          var inputTangents;
          var outputTangents;

          if (sampler.interpolation == "CUBICSPLINE") {
            inputTangents = outBuf.filter((e, i) => i % 3 == 0);
            outputTangents = outBuf.filter((e, i) => i % 3 == 0);
            outBuf = outBuf.filter((e, i) => i % 3 == 1);
          }

          currentChannels.push({
            "target": currentNodes[channel.target.node],
            "path": channel.target.path,
            "interpolation": sampler.interpolation,
            "inputBuffer": inputBuffer,
            "outputBuffer": outBuf,
            "inputTangents": inputTangents,
            "outputTangents": outputTangents,
          });
        }

        var animData = new AnimationData(animation.name, currentChannels);
        mainParent.animationController.animations.push(animData);
      }
    }

    for (let i = 0; i < skinsToResolve.length; i++) {
      let skin = skinsToResolve[i];
      let outJoints = [];
      for (let j = 0; j < skin.joints.length; j++) {
        let match = currentNodes[skin.joints[j]];
        if (match) {
          outJoints[j] = match;
        }
        else {
          console.warn("Invalid joint index!");
        }
      }

      let mats = [];
      for (let j = 0; j < skin.obj.meshRenderer.materials.length; j++) {
        // let currentMat = skin.obj.meshRenderer.materials[j];
        // let newMat = new Material(renderer.programContainers.litSkinned, {}, currentMat.textures);
        // newMat.uniforms = currentMat.uniforms;
        // mats.push(newMat);

        // let newMat = new NewLitMaterial(renderer.programContainers.litSkinned, currentMat.uniforms);

        let pc = null;
        // if (renderer.renderpipeline instanceof ForwardPBRRenderpipeline) { // if-statement does not work with deferred
        pc = renderer.programContainers.litSkinned;
        // }

        let currentMat = skin.obj.meshRenderer.materials[j];
        let newMat = new NewLitMaterial(pc, currentMat.uniforms);
        mats.push(newMat);
      }

      skin.obj.meshRenderer = new SkinnedMeshRenderer(new Skin(outJoints, skin.inverseBindMatrixData), mats, skin.obj.meshRenderer.meshData);
      skin.obj.meshRenderer.skin.parentNode = skin.obj.parent;
    }

    // Bruh
    mainParent.traverse(o => {
      o.transform.matrix = o.transform.matrix;
    });

    console.timeEnd("Loading " + path);

    return mainParent;

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

      var customData = node.extras;
      if (customData) {
        console.info("Custom data:", customData);
        gameObject.customData = {...customData};
      }
    
      if (node.mesh != undefined) {
        var mesh = json.meshes[node.mesh];

        var customMeshData = mesh.extras;
        if (customMeshData) {
          console.info("Custom mesh data:", customMeshData);
          gameObject.customData = {
            ...gameObject.customData,
            ...customMeshData
          };
        }

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

          const loadVertexColors = loadSettings.loadVertexColors ?? true;
          var vertexColors = getAccessorAndBuffer(currentPrimitive.attributes.COLOR_0);
          if (loadVertexColors && vertexColors) {
            meshData.color = { bufferData: invertColors(vertexColors.buffer), size: vertexColors.size, stride: vertexColors.stride };
          }

          var uvs = getAccessorAndBuffer(currentPrimitive.attributes.TEXCOORD_0);
          if (uvs) {
            meshData.uv = { bufferData: uvs.buffer, size: uvs.size, stride: uvs.stride };
            // for (var j = 0; j < meshData.uv.bufferData.byteLength; j += 2) {
            //   meshData.uv.bufferData[j + 1] = 1 - meshData.uv.bufferData[j + 1];
            // }
          }
    
          if (loadNormals) {
            var normals = getAccessorAndBuffer(currentPrimitive.attributes.NORMAL);
            if (normals) {
              meshData.normal = { bufferData: normals.buffer, size: normals.size, stride: normals.stride };
            }
            else {
              console.warn("Generating normals");
              meshData.normal = { bufferData: calculateNormals(vertices.buffer, indices.buffer), size: 3 };
            }
          }

          if (loadTangents) {
            var tangents = getAccessorAndBuffer(currentPrimitive.attributes.TANGENT);
            if (tangents) {
              meshData.tangent = { bufferData: tangents.buffer, size: tangents.size, stride: tangents.stride };
            }
            else if (uvs) {
              console.warn("Generating tangents");
              meshData.tangent = { bufferData: calculateTangents(vertices.buffer, indices.buffer, uvs.buffer), size: 4 };
            }
          }
    
          if (currentPrimitive.attributes.JOINTS_0) {
            let accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.JOINTS_0);
            meshData.joints = {
              bufferData: accAndBuffer.buffer,
              size: accAndBuffer.size,
              type: accAndBuffer.type,
              stride: accAndBuffer.stride
            };
          }
          if (currentPrimitive.attributes.WEIGHTS_0) {
            let accAndBuffer = getAccessorAndBuffer(currentPrimitive.attributes.WEIGHTS_0);
            meshData.weights = {
              bufferData: accAndBuffer.buffer,
              size: accAndBuffer.size,
              type: accAndBuffer.type,
              stride: accAndBuffer.stride
            };
          }

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
                albedo: albedoColor,
                albedoTexture,
                normalTexture: normalTexture,
                metallicRoughnessTexture,
                roughness,
                metallic,
                emissiveFactor,
                emissiveTexture,
                occlusionTexture
              });
              meshMaterial.opaque = !!opaque;
              meshMaterial.doubleSided = doubleSided;
              meshMaterial.name = material.name || "No name!";
              materialsCreated[materialIndex] = meshMaterial;
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

      if (loadSettings.downloadTextures) {
        downloadURL(sourceURI, "texture");
      }

      if (Object.prototype.hasOwnProperty.call(loadSettings, "maxTextureSize")) {
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
  };

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
    };
  
    //return [positions, indices];
  }
  
  this.getCubeData = getCubeData;
  function getCubeData() {
    var vertices = new Float32Array([   // Coordinates
      1.0, 1.0, 1.0,  -1.0, 1.0, 1.0,  -1.0,-1.0, 1.0,   1.0,-1.0, 1.0, // front
      1.0, 1.0, 1.0,   1.0,-1.0, 1.0,   1.0,-1.0,-1.0,   1.0, 1.0,-1.0, // right
      1.0, 1.0, 1.0,   1.0, 1.0,-1.0,  -1.0, 1.0,-1.0,  -1.0, 1.0, 1.0, // up
      -1.0, 1.0, 1.0,  -1.0, 1.0,-1.0,  -1.0,-1.0,-1.0,  -1.0,-1.0, 1.0, // left
      -1.0,-1.0,-1.0,   1.0,-1.0,-1.0,   1.0,-1.0, 1.0,  -1.0,-1.0, 1.0, // down
      1.0,-1.0,-1.0,  -1.0,-1.0,-1.0,  -1.0, 1.0,-1.0,   1.0, 1.0,-1.0  // back
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

    var tangents = calculateTangents(vertices, indices, uvs);
  
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
        size: 4
      },
      uv: {
        bufferData: uvs,
        size: 2
      }
    };
  }

  this.getSubdividedPlaneMeshData = function(subdivisions) {
    const uvs = [];
    const vertices = [];
    const triangles = [];
    const tangents = [];
  
    const res = Math.pow(2, subdivisions);

    for (let i = 0; i <= res; i++) {
      for (let j = 0; j <= res; j++) {
        const x = i / res * 2 - 1;
        const y = j / res * 2 - 1;
        const z = 0;

        const u = i / res;
        const v = j / res;

        vertices.push(x, y, z);
        uvs.push(u, v);
      }
    }
  
    const normals = new Array(vertices.length / 3);
    for (let i = 0; i < normals.length; i++) {
      normals[i] = [];
    }
  
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const ind = j + i * (res + 1);
        const indices = [
          ind,
          ind + res + 1,
          ind + 1,
  
          ind + 1,
          ind + res + 1,
          ind + res + 1 + 1,
        ];
        triangles.push(...indices);
  
        const t1Normal = getTriangleNormal([Vector.fromArray(vertices, indices[0] * 3), Vector.fromArray(vertices, indices[1] * 3), Vector.fromArray(vertices, indices[2] * 3)]);
        const t2Normal = getTriangleNormal([Vector.fromArray(vertices, indices[3] * 3), Vector.fromArray(vertices, indices[4] * 3), Vector.fromArray(vertices, indices[5] * 3)]);
  
        normals[indices[0]].push(t1Normal);
        normals[indices[1]].push(t1Normal);
        normals[indices[2]].push(t1Normal);
        normals[indices[3]].push(t2Normal);
        normals[indices[4]].push(t2Normal);
        normals[indices[5]].push(t2Normal);
      }
    }
  
    const outNormals = [];
    for (let i = 0; i < normals.length; i++) {
      const normal = Vector.divide(normals[i].reduce((a, b) => {
        return Vector.add(a, b);
      }, Vector.zero()), normals[i].length);
  
      outNormals.push(normal.x, normal.y, normal.z);
      tangents.push(normal.y, normal.x, normal.z, -1); // bruh -1 might be wrong
    }
  
    const meshData = {
      indices: {
        bufferData: new Uint32Array(triangles),
        target: gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      normal: {
        bufferData: new Float32Array(outNormals),
        size: 3
      },
      tangent: {
        bufferData: new Float32Array(tangents),
        size: 4
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    };
    
    return new MeshData(meshData);
  };

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
      1, 0, 0, -1,
      1, 0, 0, -1,
      1, 0, 0, -1,
      1, 0, 0, -1,
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
        size: 4
      },
      uv: {
        bufferData: uvs,
        size: 2
      }
    };
  }

  this.getSphereData = getSphereData;
  function getSphereData(subdivs = 3) {
    var X = 0.5257311121191336;//06;
    var Z = 0.8506508083520399;//32;
    var N = 0;

    var vertices = [-X,N,Z, X,N,Z, -X,N,-Z, X,N,-Z, N,Z,X, N,Z,-X, N,-Z,X, N,-Z,-X, Z,X,N, -Z,X, N, Z,-X,N, -Z,-X, N];
    var indices = [0,1,4, 0,4,9, 9,4,5, 4,8,5, 4,1,8, 8,1,10, 8,10,3, 5,8,3, 5,3,2, 2,3,7, 7,3,10, 7,10,6, 7,6,11, 11,6,0, 0,6,1, 6,10,1, 9,11,0, 9,2,11, 9,5,2, 7,11,2];

    for (let iter = 0; iter < subdivs; iter++) {
      let newIndices = [];
      let addedEdges = [];
      for (let i = 0; i < indices.length; i += 3) {
        let edgeIndices = [];
        for (let j = 0; j < 3; j++) {
          let vi1 = indices[i + j];
          let vi2 = indices[i + (j + 1) % 3];

          let hasBeenAdded = edgeHasBeenAdded(addedEdges, vi1, vi2);
          if (!hasBeenAdded) {
            let v1 = Vector.fromArray(vertices.slice(vi1 * 3, vi1 * 3 + 3));
            let v2 = Vector.fromArray(vertices.slice(vi2 * 3, vi2 * 3 + 3));
            let center = Vector.normalize(Vector.lerp(v1, v2, 0.5));
            vertices.push(center.x, center.y, center.z);
            edgeIndices.push(vertices.length / 3 - 1);

            addedEdges.push({
              edge: [vi1, vi2],
              index: edgeIndices[edgeIndices.length - 1]
            });
          }
          else {
            edgeIndices.push(hasBeenAdded);
          }
        }

        newIndices.push(indices[i], edgeIndices[0], edgeIndices[2]);
        newIndices.push(indices[i + 1], edgeIndices[1], edgeIndices[0]);
        newIndices.push(indices[i + 2], edgeIndices[2], edgeIndices[1]);
        newIndices.push(edgeIndices[0], edgeIndices[1], edgeIndices[2]);
      }

      indices = newIndices;
    }

    var normals = [];
    for (let i = 0; i < vertices.length; i += 3) {
      let normal = Vector.normalize(Vector.fromArray(vertices.slice(i, i + 3)));
      normals.push(normal.x, normal.y, normal.z);
    }

    let uvs = [];
    for (let i = 0; i < vertices.length; i += 3) {
      let p = Vector.normalize(Vector.fromArray(vertices.slice(i, i + 3)));
      let u = Math.atan2(p.x, p.z) / (2 * Math.PI) + 0.5;
      let v = Math.asin(p.y) / Math.PI + .5;
      uvs.push(u, v);
    }

    return new this.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      normal: {
        bufferData: new Float32Array(normals),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });

    function edgeHasBeenAdded(list, a, b) {
      return list.find(item => (item.edge[0] == a && item.edge[1] == b) || (item.edge[0] == b && item.edge[1] == a))?.index;

      // for (var i = 0; i < list.length; i++) {
      //   var item = list[i];
      //   if ((item.edge[0] == a && item.edge[1] == b) || (item.edge[0] == b && item.edge[1] == a)) {
      //     return item.index;
      //   }
      // }
    }
  }

  this.getParticleMeshData = getParticleMeshData;
  function getParticleMeshData(size = 1) {
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
    
    for (let i = 0; i < lines.length; i++) {
      let split = lines[i].split(" ");
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
            for (let j = 0; j < 3; j++) {
              indices[currentObject][j].push(
                parseInt(split[1].split("/")[j]) - 1,
                parseInt(split[2].split("/")[j]) - 1,
                parseInt(split[3].split("/")[j]) - 1
              );
            }
          }
          else if (split.length == 5) {
            for (let j = 0; j < 3; j++) {
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
    // var newTangents = [];
    var newUVs = [];
  
    var a = [newVertices, newUVs, newNormals];
    var b = [vertices, uvs, normals];
  
    var newIndex = 0;
    for (let key in indices) {
      let currentIndices = indices[key];
      newIndices[key] = [];
  
      for (let i = 0; i < currentIndices[0].length; i++) {
        for (let j = 0; j < 3; j += 2) {
          a[j].push(
            b[j][currentIndices[j][i] * 3],
            b[j][currentIndices[j][i] * 3 + 1],
            b[j][currentIndices[j][i] * 3 + 2]
          );
        }
  
        newIndices[key].push(newIndex);
        newIndex++;
      }
  
      newIndices[key] = new Uint32Array(newIndices[key]);
  
      for (let i = 0; i < currentIndices[0].length; i++) {
        let j = 1;
        a[j].push(
          b[j][currentIndices[j][i] * 2],
          b[j][currentIndices[j][i] * 2 + 1]
        );
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
  
    let out = newIndices;
    if (!splitObjects) {
      out = [];
      for (let key in newIndices) {
        out = out.concat(Array.from(newIndices[key]));
      }
      out = new Uint32Array(out);
    }
  
    return new MeshData({
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
    });
    
    /*return [
      new Float32Array(newVertices),
      out,
      null,
      new Float32Array(newNormals),
      new Float32Array(newUVs),
      new Float32Array(newTangents)
    ];*/
  }

  /**
   * @param {"cube" |"plane" | "sphere"} shape
   * @param {NewMaterial} material
   * @param {number} subdivs
   * @returns {GameObject}
   */
  this.CreateShape = function(shape, material = null, subdivs = 3) {
    var meshData;
    shape = shape.toLowerCase();

    if (shape == ENUMS.SHAPES.PLANE) {
      meshData = new this.MeshData(this.getPlaneData());
    }
    else if (shape == ENUMS.SHAPES.CUBE) {
      meshData = new this.MeshData(this.getCubeData());
    }
    else if (shape == ENUMS.SHAPES.SPHERE) {
      meshData = this.getSphereData(subdivs);
    }
    else {
      throw new Error("Invalid shape: " + shape);
    }

    material = material ?? this.CreateLitMaterial();
    var meshRenderer = new MeshRenderer(material, meshData);

    var gameObject = new GameObject("Shape");
    gameObject.meshRenderer = meshRenderer;

    return gameObject;
  };

  /**
   * 
   * @param {Vector} origin 
   * @param {Vector} normal 
   * @param {NewMaterial} material 
   * @returns {GameObject}
   */
  this.CreatePlane = function(subdivisions = 0, origin = Vector.zero(), normal = Vector.up(), material = null) {
    const meshData = subdivisions === 0 ? new MeshData(this.getPlaneData()) : this.getSubdividedPlaneMeshData(subdivisions);
    material = material ?? this.CreateLitMaterial();
    const meshRenderer = new MeshRenderer(material, meshData);

    const gameObject = new GameObject("Plane");
    gameObject.transform.matrix = Matrix.lookInDirection(
      origin,
      normal,
      Math.abs(Vector.dot(normal, Vector.up())) > 0.999 ? new Vector(1, 0, 0) : Vector.up()
    );
    gameObject.meshRenderer = meshRenderer;

    return gameObject;
  };

  this.CreatePBRGrid = async function(scene, w = 10, h = 10, shape = "sphere") {
    var meshData = 
      shape == "cube" ?
        (await this.loadGLTF(this.path + "assets/models/primitives/cube.glb")).children[0].meshRenderer.meshData[0] :
        (await this.loadGLTF(this.path + "assets/models/primitives/uvSphere.glb")).children[0].meshRenderer.meshData[0];
      

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

        if (shape == "cube") {
          gameObject.transform.scale = new Vector(0.5, 0.5, 100);
        }

        scene.add(gameObject);
      }
    }
  };

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

        for (let i = 0; i < o.meshRenderer.meshData.length; i++) {
          let mat = o.meshRenderer.materials[i];
          let md = o.meshRenderer.meshData[i];
  
          let batch = batches.find(b => b.material == mat);
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
            let addAndTransformAttribute = function(name, toSize = 3) {
              if (md.data[name]) {
                var bd = md.data[name].bufferData;
                var step = md.data[name].size;
  
                var i = 0;
                for (var j = 0; j < bd.length; j += step) {
                  var v = Vector.fromArray(bd, j, 1, 3);
                  // var v = {
                  //   x: bd[j],
                  //   y: bd[j + 1],
                  //   z: bd[j + 2]
                  // };
  
                  // v = Matrix.transformVector(noTranslateWorldMatrix, v);
                  v = Vector.normalize(Matrix.transformVector(noTranslateWorldMatrix, v));
    
                  batch[name][batch.indexOffset * toSize + i] = v.x;
                  batch[name][batch.indexOffset * toSize + i + 1] = v.y;
                  batch[name][batch.indexOffset * toSize + i + 2] = v.z;
                  if (toSize == 4) {
                    batch[name][batch.indexOffset * toSize + i + 3] = (step == 4 ? bd[j + 3] : 1);
                  }
  
                  i += toSize;
                  // i += 3;
                }
              }
            };
            
            for (let j = 0; j < md.data.position.bufferData.length; j += 3) {
              let v = {
                x: md.data.position.bufferData[j],
                y: md.data.position.bufferData[j + 1],
                z: md.data.position.bufferData[j + 2]
              };
              v = Matrix.transformVector(o.transform.worldMatrix, v);

              batch.vertices.push(v.x, v.y, v.z);
            }
  
            for (let j = 0; j < md.data.indices.bufferData.length; j++) {
              batch.indices.push(md.data.indices.bufferData[j] + batch.indexOffset);
            }

            if (md.data.uv) {
              for (let j = 0; j < md.data.uv.bufferData.length; j++) {
                batch.uv[batch.indexOffset * 2 + j] = md.data.uv.bufferData[j];
              }
            }

            addAndTransformAttribute("normal");
            addAndTransformAttribute("tangent", 4);

            batch.indexOffset += md.data.position.bufferData.length / 3;
          }

          md.cleanup();
        }
      }
    });

    var materials = [];
    var meshData = [];
    
    for (var batch of batches) {
      for (let i = 0; i < batch.uv.length; i++) {
        if (typeof batch.uv[i] == "undefined") {
          batch.uv[i] = 0;
        }
      }
      for (let i = 0; i < batch.normal.length; i++) {
        if (typeof batch.normal[i] == "undefined") {
          batch.normal[i] = 0;
        }
      }
      for (let i = 0; i < batch.tangent.length; i++) {
        if (typeof batch.tangent[i] == "undefined") {
          batch.tangent[i] = 0;
        }
      }

      materials.push(batch.material);
      meshData.push(new MeshData({
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
          size: 4,
          // size: 3,
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

      // var g = new GameObject("Batch for " + batch.material.name);
      // g.meshRenderer = new MeshRenderer(batch.material, new MeshData({
      //   position: {
      //     bufferData: new Float32Array(batch.vertices),
      //     size: 3
      //   },
      //   indices: {
      //     bufferData: new Uint32Array(batch.indices),
      //     target: renderer.gl.ELEMENT_ARRAY_BUFFER
      //   },
      //   tangent: {
      //     bufferData: new Float32Array(batch.tangent),
      //     size: 3
      //   },
      //   normal: {
      //     bufferData: new Float32Array(batch.normal),
      //     size: 3
      //   },
      //   uv: {
      //     bufferData: new Float32Array(batch.uv),
      //     size: 2
      //   },
      // }));
      // batchedGameobject.addChild(g);
    }

    batchedGameobject.meshRenderer = new MeshRenderer(materials, meshData);
  
    return batchedGameobject;
  };

  /*

    Call setup

  */
  if (!settings.dontCallSetup) {
    this.setup(settings);
  }





  function ForwardPBRRenderpipeline(renderer) {
    if (!(renderer instanceof Renderer)) {
      throw new Error("renderer is not of class 'Renderer'");
    }

    console.info("Using %cforward%c renderpipeline", "color: green; text-transform: uppercase; font-weight: bold;", "");
  
    this.renderer = renderer;
    const gl = this.renderer.gl;
  
    /**
     * Render scene using this renderpipeline
     * @param {Camera} camera 
     * @param {Camera[]} secondaryCameras 
     * @param {Scene} scene 
     * @param {{}} settings 
     */
    this.render = function(camera, secondaryCameras, scene, settings) {
      if (typeof camera === "undefined") {
        throw new Error("Camera is not defined");
      }

      this.renderer.currentBoundMaterials = new WeakMap();

      // Shadows
      if (this.renderer.shadowCascades && _settings.enableShadows && (scene.sunIntensity.x != 0 || scene.sunIntensity.y != 0 || scene.sunIntensity.z != 0) && settings.shadows !== false) {
        this.renderer.shadowCascades.renderShadowmaps(camera.transform.position);
      }
  
      scene.updateUniformBuffers(
        camera.projectionMatrix,
        camera.viewMatrix,
        camera.inverseViewMatrix
      );
  
      // Bind post processing framebuffer
      const usePostProcessing = !!(this.renderer.postprocessing && _settings.enablePostProcessing);
      if (usePostProcessing) {
        this.renderer.postprocessing.bindFramebuffer();

        if (renderer.version > 1) {
          gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1 ]);
        }
      }
      else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
  
      // Clear framebuffer/screen
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Fill motion blur texture with (0.5, 0.5, ..., ...)
      if (usePostProcessing && renderer.version > 1) {
        gl.drawBuffers([ gl.NONE, gl.COLOR_ATTACHMENT1 ]);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.5, 0.5, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1 ]);
        gl.clearColor(...currentClearColor);
      }
  
      // Skybox
      gl.disable(gl.BLEND);
      if (scene.skyboxVisible) {
        this.renderer.skybox.render(camera, scene.skyboxCubemap);
      }
      // gl.enable(gl.BLEND);
  
      // bruh lit sometimes has unused sampler2D (ex occlusionTexture)
      //      with default location 0 so TEXTURE0 must be TEXTURE_2D
      //      (what about unused sampler2D and samplerCube?)
  
      // gl.activeTexture(gl.TEXTURE0);
      // gl.bindTexture(gl.TEXTURE_2D, this.blankTexture);
      // gl.bindTexture(gl.TEXTURE_2D, null);
      // gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  
      // gl.activeTexture(gl.TEXTURE0 + diffuseCubemapUnit);
      // gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.diffuseCubemap);
  
      // gl.activeTexture(gl.TEXTURE0 + specularCubemapUnit);
      // gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.specularCubemap);
  
      // gl.activeTexture(gl.TEXTURE0 + splitsumUnit);
      // gl.bindTexture(gl.TEXTURE_2D, this.renderer.splitsumTexture);

      // console.time("Cull");
      scene.root.traverseCondition(obj => {
        if (obj.meshRenderer && (!camera.frustum || !obj.getAABB() || obj.getAABB().isInsideFrustum(camera.frustum)) || obj.disableFrustumCulling) {
          obj.isCulled = false;
        }
        else {
          obj.isCulled = true;
        }
      }, child => child.active && child.visible);
      // console.timeEnd("Cull");

      // console.time("Opaque pass");

      // bruh, magic?
      if (currentClearColor[3] == 1) {
        gl.colorMask(true, true, true, false);
      }

      gl.disable(gl.BLEND);
      scene.render(camera, { renderPass: ENUMS.RENDERPASS.OPAQUE });
      this.renderer.gizmos.gameObject.render(camera);
      // console.timeEnd("Opaque pass");

      // console.time("Alpha pass");
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      scene.render(camera, { renderPass: ENUMS.RENDERPASS.ALPHA });
      gl.depthMask(true);
      // console.timeEnd("Alpha pass");

      // // Draw on downscaled framebuffer
      // gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderer.postprocessing.downscaledFramebuffer.framebuffer);
      // gl.viewport(0, 0, gl.canvas.width / 4, gl.canvas.height / 4);
      // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.renderer.postprocessing.downscaledFramebuffer.framebuffer);
      // gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.renderer.postprocessing.getFramebuffer());
      // let width = gl.canvas.width;
      // let height = gl.canvas.height;
      // gl.blitFramebuffer(0, 0, width, height, 0, 0, width / 4, height / 4, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  
      // gl.depthMask(false);
      // scene.render(camera, { renderPass: ENUMS.RENDERPASS.ALPHA | ENUMS.RENDERPASS.DOWNSCALED });
      // gl.depthMask(true);

      if (usePostProcessing && renderer.version > 1) {
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      }
  
      if (secondaryCameras) {
        for (var cam of secondaryCameras) {
          scene.updateUniformBuffers(
            cam.projectionMatrix,
            cam.viewMatrix,
            cam.inverseViewMatrix
          );
  
          if (cam.renderTexture) {
            cam.renderTexture.bind();
            gl.viewport(0, 0, cam.renderTexture.width, cam.renderTexture.height);
            gl.clear(cam.renderTexture.clearFlags);
          }
          else {
            // Bind post processing framebuffer
            if (usePostProcessing) {
              this.renderer.postprocessing.bindFramebuffer();
            }
            else {
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
  
            gl.clear(gl.DEPTH_BUFFER_BIT);
          }
  
          // scene.render(cam, { renderPass: ENUMS.RENDERPASS.OPAQUE, materialOverride: new Material(renderer.programContainers.shadow) });
          scene.render(cam, {
            renderPass: ENUMS.RENDERPASS.OPAQUE,
            // materialOverride: new NewMaterial(renderer.programContainers.shadow), // bruh
            // materialOverrideInstanced: this.renderer.shadowCascades.materialInstanced, // bruh
            // materialOverrideSkinned: this.renderer.shadowCascades.materialSkinned, // bruh
          });
  
          gl.depthMask(false);
          scene.render(cam, { renderPass: ENUMS.RENDERPASS.ALPHA });
          gl.depthMask(true);
        }
      }
  
      gl.colorMask(true, true, true, true);
  
      bindVertexArray(null);
  
      // Post processing
      if (this.renderer.postprocessing && _settings.enablePostProcessing) this.renderer.postprocessing.render(camera);
    
      Matrix.copy(camera.viewMatrix, camera.prevViewMatrix);

      // var scene = this.scenes[this.currentScene];

      // // scene.updateUniformBuffers(
      // //   camera.projectionMatrix,
      // //   camera.viewMatrix,
      // //   camera.inverseViewMatrix
      // // );

      // // Shadows
      // if (this.shadowCascades && _settings.enableShadows && (scene.sunIntensity.x != 0 || scene.sunIntensity.y != 0 || scene.sunIntensity.z != 0) && settings.shadows !== false) {
      //   this.shadowCascades.renderShadowmaps(camera.transform.position);
      // }

      // scene.updateUniformBuffers(
      //   camera.projectionMatrix,
      //   camera.viewMatrix,
      //   camera.inverseViewMatrix
      // );

      // // Bind post processing framebuffer
      // if (this.postprocessing && _settings.enablePostProcessing) {
      //   this.postprocessing.bindFramebuffer();
      // }
      // else {
      //   gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // }

      // // Clear framebuffer/screen
      // if (renderer.version > 1) {
      //   gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      // }
      // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // // Skybox
      // gl.disable(gl.BLEND);
      // if (scene.skyboxVisible) {
      //   this.skybox.render(camera, scene.skyboxCubemap);
      // }
      // // gl.enable(gl.BLEND);

      // // bruh lit sometimes has unused sampler2D (ex occlusionTexture)
      // //      with default location 0 so TEXTURE0 must be TEXTURE_2D
      // //      (what about unused sampler2D and samplerCube?)

      // // gl.activeTexture(gl.TEXTURE0);
      // // gl.bindTexture(gl.TEXTURE_2D, this.blankTexture);
      // // gl.bindTexture(gl.TEXTURE_2D, null);
      // // gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

      // gl.activeTexture(gl.TEXTURE0 + diffuseCubemapUnit);
      // gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.diffuseCubemap);

      // gl.activeTexture(gl.TEXTURE0 + specularCubemapUnit);
      // gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.specularCubemap);

      // gl.activeTexture(gl.TEXTURE0 + splitsumUnit);
      // gl.bindTexture(gl.TEXTURE_2D, this.splitsumTexture);

      // // bruh, magic?
      // if (currentClearColor[3] == 1) {
      //   gl.colorMask(true, true, true, false);
      // }

      // gl.disable(gl.BLEND);
      // scene.render(camera, { renderPass: ENUMS.RENDERPASS.OPAQUE });
      // this.gizmos.gameObject.render(camera);

      // gl.enable(gl.BLEND);
      // gl.depthMask(false);
      // scene.render(camera, { renderPass: ENUMS.RENDERPASS.ALPHA });
      // gl.depthMask(true);

      // if (renderer.version > 1) {
      //   gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      // }

      // if (secondaryCameras) {
      //   for (var cam of secondaryCameras) {
      //     scene.updateUniformBuffers(
      //       cam.projectionMatrix,
      //       cam.viewMatrix,
      //       cam.inverseViewMatrix
      //     );

      //     if (cam.renderTexture) {
      //       cam.renderTexture.bind();
      //       gl.viewport(0, 0, cam.renderTexture.width, cam.renderTexture.height);
      //       gl.clear(cam.renderTexture.clearFlags);
      //     }
      //     else {
      //       // Bind post processing framebuffer
      //       if (this.postprocessing && _settings.enablePostProcessing) {
      //         this.postprocessing.bindFramebuffer();
      //       }
      //       else {
      //         gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      //       }

      //       gl.clear(gl.DEPTH_BUFFER_BIT);
      //     }

      //     scene.render(cam, { renderPass: ENUMS.RENDERPASS.OPAQUE, materialOverride: new Material(renderer.programContainers.shadow) });

      //     gl.depthMask(false);
      //     scene.render(cam, { renderPass: ENUMS.RENDERPASS.ALPHA });
      //     gl.depthMask(true);
      //   }
      // }

      // gl.colorMask(true, true, true, true);

      // bindVertexArray(null);

      // // Blit anti aliasing texture
      // if (this.postprocessing && _settings.enablePostProcessing) {
      //   this.postprocessing.blitAA();
      // }

      // // Bloom
      // if (this.bloom && _settings.enableBloom) this.bloom.render();

      // // Post processing
      // if (this.postprocessing && _settings.enablePostProcessing) this.postprocessing.render(camera);
    
      // camera.prevViewMatrix = Matrix.copy(camera.viewMatrix);
    };

    // let _sunDirectionArray = [ 0, 0, 0 ];
    // let _sunIntensityArray = [ 0, 0, 0 ];
  }

  this.DeferredPBRRenderpipeline = DeferredPBRRenderpipeline;
  function DeferredPBRRenderpipeline(renderer) {
    if (!(renderer instanceof Renderer)) {
      throw new Error("Renderer is not of class 'Renderer'");
    }

    if (renderer.version < 2) {
      throw new Error("Deferred rendering is only available with WebGL2");
    }

    console.info("Using %cdeferred%c renderpipeline", "color: red; text-transform: uppercase; font-weight: bold;", "");
  
    this.renderer = renderer;
    var gl = this.renderer.gl;

    var width = gl.canvas.width;
    var height = gl.canvas.height;

    const FLOAT_TYPE = getFloatTextureType();

    var gBufferProgramContainers = {
      basic: new ProgramContainer(this.renderer.createProgram(deferredShaders.basic.vertex, deferredShaders.basic.fragment)),
      instanced: new ProgramContainer(this.renderer.createProgram(deferredShaders.instanced.vertex, deferredShaders.instanced.fragment)),
      skinned: new ProgramContainer(this.renderer.createProgram(deferredShaders.skinned.vertex, deferredShaders.skinned.fragment)),
    };
    var combineProgramContainer = new ProgramContainer(this.renderer.createProgram(deferredShaders.combine.vertex, deferredShaders.combine.fragment));

    var screenQuad = new ScreenQuad();
    var gBuffer = createGBuffer(width, height);
    var combineBuffer = createCombineBuffer(width, height);

    // var oldPositionBuffer = createOldPositionBuffer(width, height);

    var colorAttArray = [];
    for (var i = 0; i < Object.keys(gBuffer.colorBuffers).length; i++) {
      colorAttArray.push(gl.COLOR_ATTACHMENT0 + i);
    }

    var ssr = new SSR();
    this.ssr = ssr;
    var blur = new Blur();

    this.enableSSR = false;

    this.renderer.on("resize", () => {
      this.resizeFramebuffers();
      ssr.resizeFramebuffers();
      blur.resizeFramebuffers();
    });

    this.resizeFramebuffers = function() {
      gl.deleteFramebuffer(gBuffer.framebuffer);
      gBuffer = createGBuffer(gl.canvas.width, gl.canvas.height);

      gl.deleteFramebuffer(combineBuffer.framebuffer);
      combineBuffer = createCombineBuffer(gl.canvas.width, gl.canvas.height);
    };

    this.render = function(camera, secondaryCameras, scene, settings) {
      width = gl.canvas.width;
      height = gl.canvas.height;
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

      shadowPass(camera, secondaryCameras, scene, settings);

      gBufferPass(camera, secondaryCameras, scene, settings);

      // // copy position texture into temp texture
      // // gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 0, 0, width, height, 0);
      // gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, oldPositionBuffer.framebuffer);
      // gl.bindFramebuffer(gl.READ_FRAMEBUFFER, gBuffer.framebuffer);
      // gl.readBuffer(gl.COLOR_ATTACHMENT0);
      // gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);

      var cf = this.enableSSR ? combineBuffer.framebuffer : this.renderer.postprocessing.getFramebuffer();

      gl.bindFramebuffer(gl.FRAMEBUFFER, cf);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      bindVertexArray(null);
      this.renderer.skybox.render(camera, scene.skyboxCubemap);

      bindVertexArray(null);
      combinePass(camera, secondaryCameras, scene, settings);

      bindVertexArray(null);
      forwardPass(
        cf,
        camera, secondaryCameras, scene, settings
      );

      bindVertexArray(null);
      ssrPass(camera, secondaryCameras, scene, settings);

      bindVertexArray(null);
      bloomPass();

      bindVertexArray(null);
      this.renderer.postprocessing.render(camera);

      Matrix.copy(camera.viewMatrix, camera.prevViewMatrix);
    };

    var gBufferPass = (camera, secondaryCameras, scene, /*settings*/) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer.framebuffer);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.drawBuffers(colorAttArray);

      // reset textures?
      for (var i = 0; i < 32; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      for (let key in gBufferProgramContainers) {
        let container = gBufferProgramContainers[key];
        useProgram(container.program);
        gl.uniformMatrix4fv(container.getUniformLocation("projectionMatrix"), false, camera.projectionMatrix);
        gl.uniformMatrix4fv(container.getUniformLocation("inverseViewMatrix"), false, camera.inverseViewMatrix);
        gl.uniformMatrix4fv(container.getUniformLocation("viewMatrix"), false, camera.viewMatrix);
      }

      bindVertexArray(null);

      scene.root.traverseCondition(gameObject => {
        if (gameObject.meshRenderer) {
          // Frustum culling
          if (!(!camera.frustum || !gameObject.getAABB() || gameObject.getAABB().isInsideFrustum(camera.frustum))) { // boolean algebra would help :)
            return;
          }

          var mr = gameObject.meshRenderer;

          if (mr instanceof MeshInstanceRenderer) {
            let gBufferProgramContainer = gBufferProgramContainers.instanced;
            useProgram(gBufferProgramContainer.program);

            if (mr._matrixNeedsUpdate) {
              mr._updateMatrixData();
              mr._matrixNeedsUpdate = false;
            }

            if (mr.matrices.length > 0) {
              for (let i = 0; i < mr.meshData.length; i++) {
                let md = mr.meshData[i];
                let mat = mr.materials[i];

                if (mat.programContainer !== null && mat.programContainer != this.renderer.programContainers.litInstanced) {
                  continue;
                }
        
                if (!mat.isOpaque()) {
                  continue;
                }
      
                md.bindBuffers(gBufferProgramContainer);
        
                gl.bindBuffer(gl.ARRAY_BUFFER, mr.matrixBuffer);
                let matrixLoc = gBufferProgramContainer.getAttribLocation("modelMatrix");
                for (let j = 0; j < 4; j++) {
                  const loc = matrixLoc + j;
                  gl.enableVertexAttribArray(loc);
                  gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 4 * 16, j * 16);
                  vertexAttribDivisor(loc, 1);
                }

                bindMaterialDeferred(gBufferProgramContainer, mat, gameObject.transform.worldMatrix);
        
                drawElementsInstanced(mr.drawMode, md.indices.length, md.indexType, 0, mr.matrices.length);
              }
            }
          }
          else if (mr instanceof MeshRenderer) {
            let gBufferProgramContainer = gBufferProgramContainers.basic;
            useProgram(gBufferProgramContainer.program);

            for (let i = 0; i < mr.meshData.length; i++) {
              let md = mr.meshData[i];
              let mat = mr.materials[i];

              if (mat.programContainer !== null && mat.programContainer != this.renderer.programContainers.lit) {
                continue;
              }
      
              if (!mat.isOpaque()) {
                continue;
              }
        
              md.bindBuffers(gBufferProgramContainer);
              
              bindMaterialDeferred(gBufferProgramContainer, mat, gameObject.transform.worldMatrix);
        
              md.drawCall(mr.drawMode);
            }
          }
          else if (mr instanceof SkinnedMeshRenderer) {
            let gBufferProgramContainer = gBufferProgramContainers.skinned;
            useProgram(gBufferProgramContainer.program);

            for (var i = 0; i < mr.meshData.length; i++) {
              var md = mr.meshData[i];
              var mat = mr.materials[i];

              if (mat.programContainer !== null && mat.programContainer != this.renderer.programContainers.litSkinned) {
                continue;
              }
      
              if (!mat.isOpaque()) {
                continue;
              }
        
              md.bindBuffers(gBufferProgramContainer);
              bindMaterialDeferred(gBufferProgramContainer, mat, gameObject.transform.worldMatrix);
              mr.skin.bindTexture({
                programContainer: gBufferProgramContainer, // bruh :(
              });
        
              md.drawCall(mr.drawMode);
            }
          }
        }
      }, child => child.active && child.visible);
    };

    var shadowPass = (camera, secondaryCameras, scene, settings) => {
      bindVertexArray(null);

      if (
        this.renderer.shadowCascades &&
        _settings.enableShadows &&
        (scene.sunIntensity.x != 0 || scene.sunIntensity.y != 0 || scene.sunIntensity.z != 0) &&
        settings.shadows !== false &&
        scene.shadowQuality > 0
      ) {
        this.renderer.shadowCascades.renderShadowmaps(camera.transform.position);
      }
    };

    var bloomPass = () => {
      this.renderer.bloom?.render();
    };

    var forwardPass = (targetFramebuffer, camera, secondaryCameras, scene/*, settings*/) => {
      // gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.renderer.postprocessing.getFramebuffer());
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targetFramebuffer);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, gBuffer.framebuffer);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);

      // this.renderer.postprocessing.bindFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);

      scene.updateUniformBuffers(
        camera.projectionMatrix,
        camera.viewMatrix,
        camera.inverseViewMatrix
      );

      gl.activeTexture(gl.TEXTURE0 + diffuseCubemapUnit);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.diffuseCubemap);
  
      gl.activeTexture(gl.TEXTURE0 + specularCubemapUnit);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.specularCubemap);
  
      gl.activeTexture(gl.TEXTURE0 + splitsumUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.renderer.splitsumTexture);

      // bruh, magic?
      if (currentClearColor[3] == 1) {
        gl.colorMask(true, true, true, false);
      }

      gl.disable(gl.BLEND);
      scene.root.traverseCondition(gameObject => {
        let shadowPass = false;
        let opaquePass = true;

        if (gameObject.meshRenderer) {
          let currentMatrix = gameObject.transform.worldMatrix;
          gameObject.meshRenderer.setShadowQuality?.(gameObject.receiveShadows ? 2 : 0, opaquePass);
          gameObject.meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass, gameObject.prevModelMatrix, {
            submeshCondition: (_, m) => {
              return m.programContainer !== null && !(
                (_programContainers["lit"] && m.programContainer == this.renderer.programContainers.lit) ||
                (_programContainers["litInstanced"] && m.programContainer == this.renderer.programContainers.litInstanced) ||
                (_programContainers["litSkinned"] && m.programContainer == this.renderer.programContainers.litSkinned)
              );
            }
          });

          gameObject.updatePrevModelMatrix();
        }

        for (var component of gameObject.getComponents()) {
          if (typeof component.render === "function") {
            let currentMatrix = gameObject.transform.worldMatrix;
            component.render(camera, currentMatrix, shadowPass, opaquePass);
          }
        }
      }, child => child.active && child.visible);

      gl.enable(gl.BLEND);
      gl.depthMask(false);

      scene.root.traverseCondition(gameObject => {
        let shadowPass = false;
        let opaquePass = false;

        if (gameObject.meshRenderer) {
          let currentMatrix = gameObject.transform.worldMatrix;
          gameObject.meshRenderer.setShadowQuality?.(gameObject.receiveShadows ? 2 : 0, opaquePass);
          gameObject.meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass, gameObject.prevModelMatrix);
        }

        for (var component of gameObject.getComponents()) {
          if (typeof component.render === "function") {
            let currentMatrix = gameObject.transform.worldMatrix;
            component.render(camera, currentMatrix, shadowPass, opaquePass);
          }
        }
      }, child => child.active && child.visible);

      gl.disable(gl.BLEND);
      gl.depthMask(true);

      gl.colorMask(true, true, true, true);
    };
    
    var combinePass = (camera, secondaryCameras, scene/*, settings*/) => {
      useProgram(combineProgramContainer.program);

      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

      // bindVertexArray(null); // this is necessairy for fullscreen quads apparently

      gl.bindBuffer(gl.ARRAY_BUFFER, screenQuad.vertexBuffer);
      var loc = combineProgramContainer.getAttribLocation("position");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 8, 0);

      gl.uniform2f(
        combineProgramContainer.getUniformLocation("SIZE"),
        gl.canvas.width, gl.canvas.height
      );

      // Color buffers

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.position);
      gl.uniform1i(
        combineProgramContainer.getUniformLocation("gPosition"),
        0
      );

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.normal);
      gl.uniform1i(
        combineProgramContainer.getUniformLocation("gNormal"),
        1
      );

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.albedo);
      gl.uniform1i(
        combineProgramContainer.getUniformLocation("gAlbedo"),
        2
      );

      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.properties);
      gl.uniform1i(
        combineProgramContainer.getUniformLocation("gProperties"),
        6
      );

      // gl.activeTexture(gl.TEXTURE7);
      // gl.bindTexture(gl.TEXTURE_2D, oldPositionBuffer.colorBuffer);
      // gl.uniform1i(
      //   combineProgramContainer.getUniformLocation("gOldPosition"),
      //   7
      // );

      // PBR textures

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.diffuseCubemap);
      gl.uniform1i(
        combineProgramContainer.getUniformLocation("u_diffuseIBL"),
        3
      );
  
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, scene.specularCubemap);
      gl.uniform1i(
        combineProgramContainer.getUniformLocation("u_specularIBL"),
        4
      );
  
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.renderer.splitsumTexture);
      gl.uniform1i(
        combineProgramContainer.getUniformLocation("u_splitSum"),
        5
      );

      // Lights

      var lights = scene.getLights();
      gl.uniform1i(combineProgramContainer.getUniformLocation("nrLights"), lights.length);

      for (let i = 0; i < lights.length; i++) {
        let light = lights[i];

        gl.uniform1i(combineProgramContainer.getUniformLocation(`lights[${i}].type`), light.type);
        gl.uniform3f(combineProgramContainer.getUniformLocation(`lights[${i}].position`), light.position.x, light.position.y, light.position.z);
        if (light.direction) gl.uniform3f(combineProgramContainer.getUniformLocation(`lights[${i}].direction`), light.direction.x, light.direction.y, light.direction.z);
        if ("angle" in light) gl.uniform1f(combineProgramContainer.getUniformLocation(`lights[${i}].angle`), light.angle);
        gl.uniform3f(combineProgramContainer.getUniformLocation(`lights[${i}].color`), light.color[0], light.color[1], light.color[2]);
      }

      // Other

      // Motion blur
      gl.uniformMatrix4fv(
        combineProgramContainer.getUniformLocation("projectionMatrix"),
        false,
        camera.projectionMatrix
      );

      gl.uniformMatrix4fv(
        combineProgramContainer.getUniformLocation("viewMatrix"),
        false,
        camera.viewMatrix
      );

      gl.uniformMatrix4fv(
        combineProgramContainer.getUniformLocation("prevViewMatrix"),
        false,
        camera.prevViewMatrix
      );
      //

      gl.uniformMatrix4fv(
        combineProgramContainer.getUniformLocation("inverseViewMatrix"),
        false,
        camera.inverseViewMatrix
      );

      gl.uniform3fv(
        combineProgramContainer.getUniformLocation("sunDirection"),
        Vector.toArray(scene.sunDirection)
      );

      gl.uniform3fv(
        combineProgramContainer.getUniformLocation("sunIntensity"),
        Vector.toArray(scene.sunIntensity)
      );

      gl.uniform3fv(
        combineProgramContainer.getUniformLocation("ambientColor"),
        Vector.toArray(scene.ambientColor)
      );

      gl.uniform1f(
        combineProgramContainer.getUniformLocation("environmentIntensity"),
        scene.environmentIntensity
      );

      gl.uniform1f(
        combineProgramContainer.getUniformLocation("environmentMinLight"),
        scene.environmentMinLight
      );

      if (combineProgramContainer.getUniformLocation("fogDensity") != null) {
        gl.uniform1f(
          combineProgramContainer.getUniformLocation("fogDensity"),
          scene.fogDensity
        );
      }

      combineProgramContainer.setUniform("fogColor", scene.fogColor);

      gl.uniform1i(
        combineProgramContainer.getUniformLocation("shadowQuality"),
        scene.shadowQuality
      );

      // Shadows
      bindShadowCascades(combineProgramContainer, scene);

      screenQuad.render();
    };

    var _bmds = { modelMatrix: null, shadowPass: false };

    var bindMaterialDeferred = (container, material, modelMatrix) => {
      _bmds.modelMatrix = modelMatrix;
      
      bindMaterialToProgram(material, container, _bmds);

      container.setUniform("enableMotionBlur", material.uniforms["enableMotionBlur"] ?? 1);

      gl.uniformMatrix4fv(container.getUniformLocation("modelMatrix"), false, modelMatrix);
      // gl.uniformMatrix4fv(gBufferProgramContainer.getUniformLocation("prevModelMatrix"), false, prevMatrix);
      // gl.uniformMatrix4fv(gBufferProgramContainer.getUniformLocation("prevViewMatrix"), false, prevViewMatrix);

      setMaterialCulling(material, false);
    };

    var bindShadowCascades = (program, scene) => {
      var sc = renderer.shadowCascades;
      sc.setUniforms(program);
      gl.uniform1f(program.getUniformLocation("shadowSampleRadius"), scene.shadowSampleRadius);

      var projectedTextureIndices = Array.from({length: sc.levels}, (_, i) => 30 - i * 2).reverse(); // bruh does not need to be generated each frame
      gl.uniform1iv(program.getUniformLocation("projectedTextures[0]"), projectedTextureIndices);

      for (let i = 0; i < sc.levels; i++) {
        let textureIndex = 30 - i * 2;
        gl.activeTexture(gl.TEXTURE0 + textureIndex);
        gl.bindTexture(gl.TEXTURE_2D, sc.shadowmaps[i].depthTexture);
      }
    };

    // function createOldPositionBuffer(currentWidth, currentHeight) {
    //   var framebuffer = gl.createFramebuffer();
    //   gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    //   var colorBuffer = gl.createTexture();
    //   gl.bindTexture(gl.TEXTURE_2D, colorBuffer);

    //   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, currentWidth, currentHeight, 0, gl.RGBA, FLOAT_TYPE, null);

    //   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    //   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    //   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    //   gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorBuffer, 0);

    //   return {
    //     framebuffer,
    //     colorBuffer
    //   };
    // }

    function createCombineBuffer(width, height) {
      var f = createFramebuffer(width, height);

      f.motionBlurColorBuffer = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, f.motionBlurColorBuffer);
      gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, width, height, 0, gl.RGBA, FLOAT_TYPE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, f.motionBlurColorBuffer, 0);

      return f;
    }

    function createGBuffer(currentWidth, currentHeight) {
      var framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

      // RGBA32F instead of RGBA16F helps with banding artifacts
      var bufferSettings = {
        position: { internalFormat: gl.RGBA32F, type: FLOAT_TYPE, filter: gl.NEAREST },
        albedo: { internalFormat: gl.RGBA16F, type: FLOAT_TYPE, filter: gl.LINEAR },
        normal: { internalFormat: gl.RGBA32F, type: FLOAT_TYPE, filter: gl.LINEAR }, // This needs to be 32f instead of 16f to remove specular highlight artifacts
        properties: { internalFormat: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR },
        positionViewSpace: { internalFormat: gl.RGBA32F, type: FLOAT_TYPE, filter: gl.NEAREST },
      };

      var colorBuffers = {
        position: null,
        normal: null,
        albedo: null,
        properties: null,
        positionViewSpace: null,
      };

      gl.activeTexture(gl.TEXTURE0);

      var i = 0;
      for (var key in colorBuffers) {
        var colorBuffer = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, colorBuffer);

        var bs = bufferSettings[key];

        var internalFormat = bs?.internalFormat ?? gl.RGBA32F;
        var type = bs?.type ?? FLOAT_TYPE;

        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, currentWidth, currentHeight, 0, gl.RGBA, type, null);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, bs?.filter ?? gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, bs?.filter ?? gl.NEAREST);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // 
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // this is really important for removing SSR artifacts

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, colorBuffer, 0);
      
        colorBuffers[key] = colorBuffer;
        i++;
      }

      var depthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, currentWidth, currentHeight);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

      return {
        framebuffer,
        colorBuffers,
        depthBuffer,
      };
    }

    var ssrPass = (camera, secondaryCameras, scene, settings) => {
      if (this.enableSSR) {
        ssr.pass(camera, secondaryCameras, scene, settings);
        
        if (ssr.blur > 0) {
          blur.pass(ssr.framebuffer.colorBuffer, ssr.framebuffer.framebuffer, ssr.blur, ssr.blurVMultiplier, ssr.blurHMultiplier);
        }

        ssr.combinePass(this.renderer.postprocessing.getFramebuffer());
      }
    };

    function SSR() {
      this.scale = 0.5;
      this.blur = 5;
      this.blurHMultiplier = 1;
      this.blurVMultiplier = 1;
      this.maxRoughness = 0.5;
      this.maxDistance = 64;
      this.stepResolution = 0.1;
      this.refinementSteps = 10;
      this.thickness = 10;

      var screenQuad = new ScreenQuad();

      var SSRProgramContainer = new ProgramContainer(renderer.createProgram(deferredShaders.ssr.vertex, deferredShaders.ssr.fragment));
      var combineProgramContainer = new ProgramContainer(renderer.createProgram(deferredShaders.ssrCombine.vertex, deferredShaders.ssrCombine.fragment));

      this.framebuffer = createFramebuffer(width, height);

      this.resizeFramebuffers = function() {
        gl.deleteFramebuffer(this.framebuffer.framebuffer);
        this.framebuffer = createFramebuffer(gl.canvas.width, gl.canvas.height);
      };

      this.pass = function(camera/*, secondaryCameras, scene, settings*/) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer.framebuffer);
        gl.viewport(0, 0, gl.canvas.width * this.scale, gl.canvas.height * this.scale);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        useProgram(SSRProgramContainer.program);

        bindVertexArray(null);
        screenQuad.bindBuffers(SSRProgramContainer.getAttribLocation("position"));

        // Bind uniforms

        // SSRProgramContainer.setUniform("scale", this.scale);
        // SSRProgramContainer.setUniform("maxRoughness", this.maxRoughness);
        // SSRProgramContainer.setUniform("maxDistance", this.maxDistance);
        // SSRProgramContainer.setUniform("resolution", this.stepResolution);
        // SSRProgramContainer.setUniform("steps", this.refinementSteps);
        // SSRProgramContainer.setUniform("thickness", this.thickness);

        // Bind textures

        gl.activeTexture(gl.TEXTURE0);
        // gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.position);
        gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.positionViewSpace);
        gl.uniform1i(
          SSRProgramContainer.getUniformLocation("positionTexture"),
          0
        );

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.normal);
        gl.uniform1i(
          SSRProgramContainer.getUniformLocation("normalTexture"),
          1
        );

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.properties);
        gl.uniform1i(
          SSRProgramContainer.getUniformLocation("propertiesTexture"),
          2
        );

        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, combineBuffer.colorBuffer);
        // gl.bindTexture(gl.TEXTURE_2D, this.framebuffer.colorBuffer);
        // gl.bindTexture(gl.TEXTURE_2D, gBuffer.colorBuffers.albedo);
        gl.uniform1i(
          SSRProgramContainer.getUniformLocation("albedoTexture"),
          3
        );

        // Splitsum
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, renderer.splitsumTexture);
        gl.uniform1i(
          SSRProgramContainer.getUniformLocation("u_splitSum"),
          4
        );

        // Bind matrices
        gl.uniformMatrix4fv(SSRProgramContainer.getUniformLocation("lensProjection"), false, camera.projectionMatrix);
        gl.uniformMatrix4fv(SSRProgramContainer.getUniformLocation("inverseViewMatrix"), false, camera.inverseViewMatrix);
        gl.uniformMatrix4fv(SSRProgramContainer.getUniformLocation("viewMatrix"), false, camera.viewMatrix);

        screenQuad.render();
      };

      this.combinePass = function(targetFramebuffer) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        useProgram(combineProgramContainer.program);

        bindVertexArray(null);
        screenQuad.bindBuffers(combineProgramContainer.getAttribLocation("position"));

        gl.uniform2f(combineProgramContainer.getUniformLocation("SIZE"), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(combineProgramContainer.getUniformLocation("scale"), this.scale);

        // Bind textures

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, combineBuffer.colorBuffer);
        gl.uniform1i(
          combineProgramContainer.getUniformLocation("combinedTexture"),
          0
        );

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.framebuffer.colorBuffer);
        gl.uniform1i(
          combineProgramContainer.getUniformLocation("ssrTexture"),
          1
        );

        screenQuad.render();
      };
    }

    function Blur() {
      var screenQuad = new ScreenQuad();

      var programContainer = new ProgramContainer(renderer.createProgram(blurSource.vertex, blurSource.fragment));

      var intermediateFramebuffer = createFramebuffer(gl.canvas.width, gl.canvas.height);

      this.resizeFramebuffers = function() {
        gl.deleteFramebuffer(intermediateFramebuffer.framebuffer);
        intermediateFramebuffer = createFramebuffer(gl.canvas.width, gl.canvas.height);
      };

      this.pass = function(imageTexture, targetFramebuffer = null, radius = 20, v = 1, h = 1) {
        useProgram(programContainer.program);

        bindVertexArray(null);
        screenQuad.bindBuffers(programContainer.getAttribLocation("position"));

        gl.uniform2f(programContainer.getUniformLocation("SIZE"), gl.canvas.width, gl.canvas.height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFramebuffer.framebuffer);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imageTexture);
        gl.uniform1i(
          programContainer.getUniformLocation("imageTexture"),
          0
        );
        gl.uniform1i(programContainer.getUniformLocation("horizontal"), 0);
        gl.uniform1i(programContainer.getUniformLocation("radius"), radius * v);

        screenQuad.render();

        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, intermediateFramebuffer.colorBuffer);
        gl.uniform1i(
          programContainer.getUniformLocation("imageTexture"),
          0
        );
        gl.uniform1i(programContainer.getUniformLocation("horizontal"), 1);
        gl.uniform1i(programContainer.getUniformLocation("radius"), radius * h);

        screenQuad.render();
      };
    }
  }
}

/*

  Helper functions

*/

let _v0 = new Vector();
let _v1 = new Vector();
let _v2 = new Vector();

function calculateNormals(vertices, indices) {
  // bruh fix for stride
  function getVertex(i, dst) {
    dst = dst || new Vector();
    dst.x = vertices[i * 3];
    dst.y = vertices[i * 3 + 1];
    dst.z = vertices[i * 3 + 2];
    return dst;
  }

  if (indices) {
    var normalTable = new Array(vertices.length / 3);
    for (let i = 0; i < normalTable.length; i++) {
      normalTable[i] = [];
    }

    var ib = indices;
    for (let i = 0; i < ib.length; i += 3) {
      getVertex(ib[i], _v0);
      getVertex(ib[i + 1], _v1);
      getVertex(ib[i + 2], _v2);

      let normal = getTriangleNormal([_v0, _v1, _v2]);

      normalTable[ib[i]].push(normal);
      normalTable[ib[i + 1]].push(normal);
      normalTable[ib[i + 2]].push(normal);
    }

    var outNormals = [];
    for (let i = 0; i < normalTable.length; i++) {
      let normal = Vector.divide(normalTable[i].reduce((a, b) => {
        return Vector.add(a, b);
      }, Vector.zero()), normalTable[i].length);

      outNormals.push(normal.x, normal.y, normal.z);
    }

    return new Float32Array(outNormals);
  }
  else {
    var normals = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length / 3; i += 3) {
      getVertex(i, _v0);
      getVertex(i + 1, _v1);
      getVertex(i + 2, _v2);

      let normal = getTriangleNormal([_v0, _v1, _v2]);

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

function calculateTangents(vertices, indices, uvs) {
  // bruh use vectors instead (maybe...)
  // bruh fix for stride
  function getVertex(i) {
    return [
      vertices[i * 3],
      vertices[i * 3 + 1],
      vertices[i * 3 + 2]
    ];
  }

  function getUV(i) {
    return [
      uvs[i * 2],
      uvs[i * 2 + 1]
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

    // tangents = Vector.toArray(Vector.normalize(Vector.fromArray(tangents)));

    var epsilon = 0.01;
    tangent[0] += epsilon;
    tangent[1] += epsilon;
    tangent[2] += epsilon;

    tangents[i0 * 4] = tangent[0];
    tangents[i0 * 4 + 1] = tangent[1];
    tangents[i0 * 4 + 2] = tangent[2];
    tangents[i0 * 4 + 3] = 1; // Bitangent sign

    tangents[i1 * 4] = tangent[0];
    tangents[i1 * 4 + 1] = tangent[1];
    tangents[i1 * 4 + 2] = tangent[2];
    tangents[i1 * 4 + 3] = 1; // Bitangent sign

    tangents[i2 * 4] = tangent[0];
    tangents[i2 * 4 + 1] = tangent[1];
    tangents[i2 * 4 + 2] = tangent[2];
    tangents[i2 * 4 + 3] = 1; // Bitangent sign

    return tangent;
  }

  var failedTangents = 0;
  var tangents = new Float32Array(vertices.length / 3 * 4);

  if (!indices) {
    for (let i = 0; i < vertices.length / 3; i += 3) {
      setTangentVector(tangents, i, i + 1, i + 2);
    }
  }
  else {
    var ib = indices;
    for (let i = 0; i < ib.length; i += 3) {
      setTangentVector(tangents, ib[i], ib[i + 1], ib[i + 2]);
    }
  }

  if (failedTangents.length > 0) {
    console.warn(failedTangents + " tangents generated without UVs");
  }
  return tangents;
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

export default Renderer;