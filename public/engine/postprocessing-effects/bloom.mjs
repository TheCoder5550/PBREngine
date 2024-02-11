import PostProcessingEffect from "./postprocessingEffect.mjs";
import * as bloomSource from "../../assets/shaders/built-in/bloom.glsl.mjs";

export default class Bloom extends PostProcessingEffect {
  doesEffectNeedSplit = true;

  lensDirtIntensity = 25;
  lensDirtTexture = null;
  lensDirtTextureWidth = -1;
  lensDirtTextureHeight = -1;

  sampleScale = 1;
  threshold = 1;
  knee = 0.5;
  clamp = 100;
  intensity = 0.05;

  maxDownsamples = 7;

  downsampleFramebuffers = [];
  upsampleFramebuffers = [];

  initialize(renderer) {
    const vertex = bloomSource[`webgl${renderer.version}`].bloom.vertex;
    const fragment = bloomSource[`webgl${renderer.version}`].bloom.fragment;

    const program = renderer.createProgram(vertex, fragment);
    this.programContainer = new renderer.ProgramContainer(program);

    const vertices = new Float32Array([
      -1.0,  1.0,
      -1.0, -1.0,
      1.0,  1.0,
      1.0, -1.0,
    ]);
    this.vertexBuffer = renderer.createBuffer(vertices);

    this.resizeFramebuffers(renderer);
  }

  prepass(renderer, inputBuffer) {
    const gl = renderer.gl;

    gl.useProgram(this.programContainer.program);

    gl.uniform1f(this.programContainer.getUniformLocation("_SampleScale"), this.sampleScale);
    gl.uniform1f(this.programContainer.getUniformLocation("threshold"), this.threshold);
    gl.uniform1f(this.programContainer.getUniformLocation("knee"), this.knee);
    gl.uniform1f(this.programContainer.getUniformLocation("_Clamp"), this.clamp);

    gl.uniform1i(this.programContainer.getUniformLocation("mainTexture"), 0);
    gl.uniform1i(this.programContainer.getUniformLocation("secondTexture"), 1);

    const pl = this.programContainer.getAttribLocation("position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(pl);
    gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 8, 0);

    gl.activeTexture(gl.TEXTURE0);

    for (let i = 0; i < this.downsampleFramebuffers.length; i++) {
      const writeBuffer = this.downsampleFramebuffers[i];

      const readTexture = i === 0 ?
        inputBuffer.colorTexture :
        this.downsampleFramebuffers[i - 1].colorBuffer;

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeBuffer.framebuffer);
      gl.viewport(0, 0, writeBuffer.width, writeBuffer.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.bindTexture(gl.TEXTURE_2D, readTexture);

      if (this.programContainer.getUniformLocation("mainTextureSize")) {
        gl.uniform2fv(this.programContainer.getUniformLocation("mainTextureSize"), i < 1 ? [gl.canvas.width, gl.canvas.height] : [this.downsampleFramebuffers[i - 1].width, this.downsampleFramebuffers[i - 1].height]);
      }
      gl.uniform2f(this.programContainer.getUniformLocation("screenSize"), writeBuffer.width, writeBuffer.height);
      gl.uniform1i(this.programContainer.getUniformLocation("stage"), i == 0 ? 0 : 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.uniform1i(this.programContainer.getUniformLocation("stage"), 2);

    for (let i = 0; i < this.upsampleFramebuffers.length; i++) {
      const framebuffer = this.upsampleFramebuffers[i];

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
      gl.viewport(0, 0, framebuffer.width, framebuffer.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, i < 1 ? this.downsampleFramebuffers[this.downsampleFramebuffers.length - 1].colorBuffer : this.upsampleFramebuffers[i - 1].colorBuffer);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.downsampleFramebuffers[this.downsampleFramebuffers.length - 2 - i].colorBuffer);

      if (this.programContainer.getUniformLocation("mainTextureSize")) {
        const fbd = i < 1 ? this.downsampleFramebuffers[this.downsampleFramebuffers.length - 1] : this.upsampleFramebuffers[i - 1];
        gl.uniform2f(this.programContainer.getUniformLocation("mainTextureSize"), fbd.width, fbd.height);
      }
      gl.uniform2f(this.programContainer.getUniformLocation("screenSize"), framebuffer.width, framebuffer.height);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  setUniforms(programContainer, gl) {
    gl.uniform1f(programContainer.getUniformLocation("bloomIntensity"), this.intensity);
    gl.uniform1f(programContainer.getUniformLocation("lensDirtIntensity"), this.lensDirtIntensity);
    gl.uniform1f(programContainer.getUniformLocation("exposure"), this.exposure);

    // Bloom texture
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.upsampleFramebuffers[this.upsampleFramebuffers.length - 1].colorBuffer);
    gl.uniform1i(programContainer.getUniformLocation("newBloomTexture"), 5);

    // Lens dirt aspect ratio
    const lensDirtAspectRatio = this.lensDirtTextureWidth / this.lensDirtTextureHeight;
    gl.uniform1f(programContainer.getUniformLocation("lensDirtAspectRatio"), lensDirtAspectRatio);

    // Lens dirt texture
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.lensDirtTexture);
    gl.uniform1i(programContainer.getUniformLocation("lensDirtTexture"), 6);
  }

  getFragmentSource() {
    return `
      uniform sampler2D newBloomTexture;
      uniform float bloomIntensity;

      uniform sampler2D lensDirtTexture;
      uniform float lensDirtAspectRatio;
      uniform float lensDirtIntensity;

      vec4 mainImage(vec4 inColor, vec2 uv) {
        vec3 bloom = texture(newBloomTexture, uv).rgb;
        vec3 lensDirt = texture(lensDirtTexture, uv * vec2(aspectRatio / lensDirtAspectRatio, 1)).rgb;

        inColor.rgb += bloom.rgb * bloomIntensity * (1. + lensDirt * lensDirtIntensity);

        return inColor;
      }
    `;
  }

  resizeFramebuffers(renderer) {
    const gl = renderer.gl;

    for (let i = 0; i < this.downsampleFramebuffers.length; i++) {
      gl.deleteFramebuffer(this.downsampleFramebuffers[i].framebuffer);
    }
    for (let i = 0; i < this.upsampleFramebuffers.length; i++) {
      gl.deleteFramebuffer(this.upsampleFramebuffers[i].framebuffer);
    }

    this.downsampleFramebuffers = [];
    this.upsampleFramebuffers = [];

    const downsamples = this.getNrDownsamples(gl);

    for (let i = 0; i < downsamples; i++) {
      let scale = Math.pow(0.5, i + 1);
      this.downsampleFramebuffers.push(renderer.createFramebuffer(Math.floor(gl.canvas.width * scale), Math.floor(gl.canvas.height * scale)));
    }

    for (let i = 0; i < downsamples - 1; i++) {
      let scale = Math.pow(0.5, downsamples - 1 - i);
      this.upsampleFramebuffers.push(renderer.createFramebuffer(Math.floor(gl.canvas.width * scale), Math.floor(gl.canvas.height * scale)));
    }
  }

  getNrDownsamples(gl) {
    const minDim = Math.min(gl.canvas.width, gl.canvas.height);
    const sizeLimit = Math.floor(Math.log(minDim) / Math.log(2));
    const downsamples = Math.min(this.maxDownsamples, sizeLimit);
    return downsamples;
  }
}