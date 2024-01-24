import PostProcessingEffect from "./postprocessingEffect.mjs";

export const TonemapperModes = {
  NONE: 0,
  ACES: 1,
  REINHARD: 2,
};

export default class Tonemapper extends PostProcessingEffect {
  exposure = 0;
  gamma = 2.2;
  mode = TonemapperModes.ACES;

  setUniforms(programContainer, gl) {
    gl.uniform1f(programContainer.getUniformLocation("tonemapper_exposure"), this.exposure);
    gl.uniform1f(programContainer.getUniformLocation("tonemapper_gamma"), this.gamma);
    gl.uniform1i(programContainer.getUniformLocation("tonemapper_mode"), this.mode);
  }

  getFragmentSource() {
    return `
      uniform float tonemapper_exposure;
      uniform float tonemapper_gamma;
      uniform int tonemapper_mode;

      vec3 ACESFilm(vec3 x) {
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((x*(a*x+b))/(x*(c*x+d)+e), vec3(0.), vec3(1.));
      }

      vec4 mainImage(vec4 inColor, vec2 uv) {
        vec4 outColor = inColor;

        // Exposure correction
        outColor.rgb = outColor.rgb * pow(2., tonemapper_exposure);

        // Tonemapping (HDR to LDR)
        // ACES
        if (tonemapper_mode == 1) {
          outColor.rgb = ACESFilm(outColor.rgb);
        }
        // Reinhard
        else if (tonemapper_mode == 2) {
          outColor.rgb = outColor.rgb / (outColor.rgb + vec3(1.0));
        }

        // Gamma correction
        outColor.rgb = pow(outColor.rgb, vec3(1. / tonemapper_gamma));

        return outColor;
      }
    `;
  }
}