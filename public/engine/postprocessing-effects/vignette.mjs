import PostProcessingEffect from "./postprocessingEffect.mjs";

export default class Vignette extends PostProcessingEffect {
  falloff = 0.3;
  amount = 0.2;

  setUniforms(programContainer, gl) {
    gl.uniform1f(programContainer.getUniformLocation("vignetteFalloff"), this.falloff);
    gl.uniform1f(programContainer.getUniformLocation("vignetteAmount"), this.amount);
  }

  getFragmentSource() {
    return `
      uniform float vignetteFalloff;
      uniform float vignetteAmount;

      vec4 mainImage(vec4 inColor, vec2 uv) {
        float dist = distance(uv, vec2(0.5, 0.5));
        inColor.rgb *= smoothstep(0.8, vignetteFalloff * 0.799, dist * (vignetteAmount + vignetteFalloff));

        return inColor;
      }
    `;
  }
}