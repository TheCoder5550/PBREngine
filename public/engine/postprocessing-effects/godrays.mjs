import * as ENUMS from "../constants.mjs";
import Matrix from "../matrix.mjs";
import Vector from "../vector.mjs";
import PostProcessingEffect from "./postprocessingEffect.mjs";
import { NewMaterial } from "../material.mjs";

export default class Godrays extends PostProcessingEffect {
  scene = null;
  camera = null;

  bufferScale = 0.25;

  density = 1;
  weight = 0.01;
  decay = 0.97;
  exposure = 1;
  samples = 20;
  clamp = 10;

  _sunPosition = new Vector();
  _sunScreenPosition = new Vector();
  _viewProjection = Matrix.identity();
  _viewMatrixNoTranslation = Matrix.identity();

  initialize(renderer) {
    const gl = renderer.gl;

    this.occlusionBuffer = renderer.createFramebuffer(
      Math.floor(gl.canvas.width * this.bufferScale),
      Math.floor(gl.canvas.height * this.bufferScale)
    );

    // Fully black material
    {
      const vertex = `
        attribute vec3 position;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 modelMatrix;
        
        void main() {
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `;
      const fragment = `
        precision highp float;

        void main() {
          gl_FragColor = vec4(0, 0, 0, 1);
        }
      `;
      const program = renderer.createProgram(vertex, fragment);
      const programContainer = new renderer.ProgramContainer(program);
      this.blackMaterial = new NewMaterial(programContainer);
    }

    const vertices = new Float32Array([
      -1.0,  1.0,
      -1.0, -1.0,
      1.0,  1.0,
      1.0, -1.0,
    ]);
    this.vertexBuffer = renderer.createBuffer(vertices);

    // Draw sun as circle on screen
    {
      const vertex = `
        attribute vec2 position;

        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `;
      const fragment = `
        precision highp float;

        uniform vec3 sunIntensity;
        uniform vec2 sunScreenPosition;
        uniform vec2 screenSize;

        void main() {
          vec2 uv = gl_FragCoord.xy / screenSize;

          vec2 d = sunScreenPosition - uv;
          d.x *= screenSize.x / screenSize.y;
          if (length(d) > 0.05) {
            discard;
          }

          gl_FragColor = vec4(sunIntensity, 1);
          // gl_FragColor = vec4(vec3(1, 0.5, 0.2) * 10., 1);
        }
      `;
      const program = renderer.createProgram(vertex, fragment);
      const programContainer = new renderer.ProgramContainer(program);
      this.sunProgramContainer = programContainer;
    }
  }

  prepass(renderer) {
    const gl = renderer.gl;

    if (!this.scene) {
      throw new Error("Set godrays.scene to the current scene");
    }

    if (!this.camera) {
      throw new Error("Set godrays.camera to the same camera that is used to render the scene");
    }

    this.updateSunScreenSpacePosition();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.occlusionBuffer.framebuffer);
    gl.viewport(0, 0, this.occlusionBuffer.width, this.occlusionBuffer.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Draw sun as circle
    gl.depthMask(false);
    gl.useProgram(this.sunProgramContainer.program);

    const pl = this.sunProgramContainer.getAttribLocation("position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(pl);
    gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 8, 0);

    gl.uniform3f(this.sunProgramContainer.getUniformLocation("sunIntensity"),
      this.scene.sunIntensity.x,
      this.scene.sunIntensity.y,
      this.scene.sunIntensity.z,
    );
    gl.uniform2f(this.sunProgramContainer.getUniformLocation("sunScreenPosition"),
      this._sunScreenPosition.x,
      this._sunScreenPosition.y,
    );
    gl.uniform2f(this.sunProgramContainer.getUniformLocation("screenSize"),
      this.occlusionBuffer.width,
      this.occlusionBuffer.height,
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true);

    // Render scene in black
    const scene = renderer.getActiveScene();
    scene.render(this.camera, {
      renderPass: ENUMS.RENDERPASS.OPAQUE,
      materialOverride: this.blackMaterial
    });
  }

  setUniforms(programContainer, gl) {
    gl.uniform2f(programContainer.getUniformLocation("sunScreenPosition"),
      this._sunScreenPosition.x,
      this._sunScreenPosition.y,
    );

    gl.uniform1f(programContainer.getUniformLocation("density"), this.density);
    gl.uniform1f(programContainer.getUniformLocation("weight"), this.weight);
    gl.uniform1f(programContainer.getUniformLocation("decay"), this.decay);
    gl.uniform1f(programContainer.getUniformLocation("exposure"), this.exposure);
    gl.uniform1i(programContainer.getUniformLocation("samples"), this.samples);
    gl.uniform1f(programContainer.getUniformLocation("colorClamp"), this.clamp);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.occlusionBuffer.colorBuffer);
    gl.uniform1i(programContainer.getUniformLocation("occlusionTexture"), 6);
  }

  updateSunScreenSpacePosition() {
    Matrix.copy(this.camera.viewMatrix, this._viewMatrixNoTranslation);
    Matrix.removeTranslation(this._viewMatrixNoTranslation);

    Matrix.identity(this._viewProjection);
    Matrix.multiply(this._viewProjection, this.camera.projectionMatrix, this._viewProjection);
    Matrix.multiply(this._viewProjection, this._viewMatrixNoTranslation, this._viewProjection);

    Vector.copy(this.scene.sunDirection, this._sunPosition);
    this._sunPosition.w = 1;
    
    Matrix.transform4DVector(this._viewProjection, this._sunPosition, this._sunScreenPosition);
    Vector.divideTo(this._sunScreenPosition, this._sunScreenPosition.w);

    this._sunScreenPosition.x = (this._sunScreenPosition.x + 1) * 0.5;
    this._sunScreenPosition.y = (this._sunScreenPosition.y + 1) * 0.5;
  }

  getFragmentSource() {
    return `
      uniform sampler2D occlusionTexture;

      uniform vec2 sunScreenPosition;

      uniform float density;
      uniform float weight;
      uniform float decay;
      uniform float exposure;
      uniform int samples;
      uniform float colorClamp;
    
      vec3 godrays(float density, float weight, float decay, float exposure, vec2 screenSpaceLightPos, vec2 uv) {
        vec3 fragColor = vec3(0);
      
        vec2 deltaTextCoord = vec2(uv - screenSpaceLightPos.xy);
        vec2 textCoo = uv.xy;
        deltaTextCoord *= (1.0 /  float(samples)) * density;
        float illuminationDecay = 1.0;
      
        for (int i = 0; i < 100; i++) {
          if (i >= samples) {
            break;
          }

          textCoo -= deltaTextCoord;

          vec3 samp = texture(occlusionTexture, textCoo).rgb;
          // vec3 samp = clamp(texture(sceneTexture, textCoo).rgb, vec3(0.3), vec3(colorClamp) + vec3(0.3)) - vec3(0.3);
          // vec3 samp = clamp(texture(sceneDepthTexture, textCoo).rrr, vec3(0.3), vec3(10)) - vec3(0.3);

          samp *= illuminationDecay * weight;
          fragColor += samp;
          illuminationDecay *= decay;
        }
      
        fragColor *= exposure;

        return fragColor;
      }

      vec4 mainImage(vec4 inColor, vec2 uv) {
        // return texture(occlusionTexture, uv);

        inColor.rgb += godrays(
          density,
          weight,
          decay,
          exposure,
          sunScreenPosition.xy, uv
        );
        return inColor;
      }
    `;
  }

  resizeFramebuffers(renderer) {
    const gl = renderer.gl;

    const width = Math.floor(gl.canvas.width * this.bufferScale);
    const height = Math.floor(gl.canvas.height * this.bufferScale);

    this.occlusionBuffer.width = width;
    this.occlusionBuffer.height = height;

    // Color buffer
    gl.bindTexture(gl.TEXTURE_2D, this.occlusionBuffer.colorBuffer);
    gl.texImage2D(gl.TEXTURE_2D, 0, renderer.version == 1 ? gl.RGBA : gl.RGBA16F, width, height, 0, gl.RGBA, renderer.getFloatTextureType(), null);

    // Depth buffer
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.occlusionBuffer.depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
  }
}