import PostProcessingEffect from "./postprocessingEffect.mjs";

export default class ColorGrading extends PostProcessingEffect {
  saturation = 0;
  contrast = 0;
  temperature = 0;
  tint = 0;

  setUniforms(programContainer, gl) {
    gl.uniform1f(programContainer.getUniformLocation("saturation"), this.saturation);
    gl.uniform1f(programContainer.getUniformLocation("contrast"), this.contrast);
    gl.uniform1f(programContainer.getUniformLocation("temperature"), this.temperature);
    gl.uniform1f(programContainer.getUniformLocation("tint"), this.tint);
  }

  getFragmentSource() {
    return `
      uniform float saturation;
      uniform float contrast;
      uniform float temperature;
      uniform float tint;

      vec3 adjustSaturation(vec3 color, float value) {
        // https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
        const vec3 luminosityFactor = vec3(0.2126, 0.7152, 0.0722);
        vec3 grayscale = vec3(dot(color, luminosityFactor));
      
        return mix(grayscale, color, 1.0 + value);
      }

      vec3 adjustContrast(vec3 color, float value) {
        return 0.5 + value * (color - 0.5);
      }

      // White balance
      vec3 whiteBalance(vec3 In, float Temperature, float Tint)
      {
        // Range ~[-1.67;1.67] works best
        float t1 = Temperature * 10. / 6.;
        float t2 = Tint * 10. / 6.;

        // Get the CIE xy chromaticity of the reference white point.
        // Note: 0.31271 = x value on the D65 white point
        float x = 0.31271 - t1 * (t1 < 0. ? 0.1 : 0.05);
        float standardIlluminantY = 2.87 * x - 3. * x * x - 0.27509507;
        float y = standardIlluminantY + t2 * 0.05;

        // Calculate the coefficients in the LMS space.
        vec3 w1 = vec3(0.949237, 1.03542, 1.08728); // D65 white point

        // CIExyToLMS
        float Y = 1.;
        float X = Y * x / y;
        float Z = Y * (1. - x - y) / y;
        float L = 0.7328 * X + 0.4296 * Y - 0.1624 * Z;
        float M = -0.7036 * X + 1.6975 * Y + 0.0061 * Z;
        float S = 0.0030 * X + 0.0136 * Y + 0.9834 * Z;
        vec3 w2 = vec3(L, M, S);

        vec3 balance = vec3(w1.x / w2.x, w1.y / w2.y, w1.z / w2.z);

        mat3 LIN_2_LMS_MAT = mat3(
          3.90405e-1, 5.49941e-1, 8.92632e-3,
          7.08416e-2, 9.63172e-1, 1.35775e-3,
          2.31082e-2, 1.28021e-1, 9.36245e-1
        );

        mat3 LMS_2_LIN_MAT = mat3(
          2.85847e+0, -1.62879e+0, -2.48910e-2,
          -2.10182e-1,  1.15820e+0,  3.24281e-4,
          -4.18120e-2, -1.18169e-1,  1.06867e+0
        );

        vec3 lms = LIN_2_LMS_MAT * In;
        lms *= balance;
        vec3 Out = LMS_2_LIN_MAT * lms;

        return Out;
      }

      vec4 mainImage(vec4 inColor, vec2 uv) {
        // Saturation
        inColor.rgb = adjustSaturation(inColor.rgb, saturation);

        // Contrast
        inColor.rgb = adjustContrast(inColor.rgb, 1. + contrast);

        // White balance
        inColor.rgb = whiteBalance(inColor.rgb, temperature, tint);

        return inColor;
      }
    `;
  }
}