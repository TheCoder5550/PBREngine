import PostProcessingEffect from "./postprocessingEffect.mjs";

export default class AutoExposure extends PostProcessingEffect {
  exposure = 1;

  initialize(renderer) {
    const gl = renderer.gl;
    this.framebuffer = gl.createFramebuffer();

    this.pixels = new Float32Array(4);
  }

  prepass(renderer, inputBuffer) {
    const gl = renderer.gl;

    // Approximate average luminousity of scene

    gl.bindTexture(gl.TEXTURE_2D, inputBuffer.colorTexture);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    const level = Math.floor(Math.log2(Math.max(inputBuffer.width, inputBuffer.height)));
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, inputBuffer.colorTexture, level);

    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, this.pixels);

    const luminance = (
      0.2125 * this.pixels[0] + 
      0.7154 * this.pixels[1] + 
      0.0721 * this.pixels[2]
    );

    const q = 0.65; // Lens and vignetting attentuation
    const K = 12.5; // Reflected-light meter calibration constant
    const newExposure = 1 / (78 / q / K * luminance);

    this.exposure /= (this.exposure / newExposure) ** 0.02;
  }

  setUniforms(programContainer, gl) {
    gl.uniform1f(programContainer.getUniformLocation("exposure"), this.exposure);
  }

  getFragmentSource() {
    return `
      uniform float exposure;

      vec4 mainImage(vec4 inColor, vec2 uv) {
        inColor.rgb = inColor.rgb * exposure;
        // inColor.rgb = inColor.rgb * pow(2., exposure);

        return inColor;
      }
    `;
  }
}