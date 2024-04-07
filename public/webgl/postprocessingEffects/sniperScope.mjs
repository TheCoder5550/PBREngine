import PostProcessingEffect from "../../engine/postprocessing-effects/postprocessingEffect.mjs";

export default class SniperScopeEffect extends PostProcessingEffect {
  distortionAmount = 1;
  distortionPower = 0.3;
  scopeRadius = 0.9;

  setUniforms(programContainer, gl) {
    gl.uniform1f(programContainer.getUniformLocation("distortion"), this.distortionAmount);
    gl.uniform1f(programContainer.getUniformLocation("distortionPower"), this.distortionPower);
    gl.uniform1f(programContainer.getUniformLocation("radius"), this.scopeRadius);
  }

  getFragmentSource() {
    return `
      // uniform float vignetteFalloff;
      // uniform float vignetteAmount;

      uniform float distortion;
      uniform float distortionPower;
      uniform float radius;

      vec2 distort(vec2 p)
      {
        float d = length(p);

        // float a = 4.5;
        // float z = d <= 1. - 1. / a ? 1. : sqrt(1. - pow(a * (d - 1.) + 1., 2.));

        float z = sqrt(distortion + d * d * -distortion);
        z = pow(z, distortionPower);

        float r = atan(d, z) / 3.1415926535;
        float phi = atan(p.y, p.x);
        return vec2(r * cos(phi) * (1.0 / aspectRatio), r * sin(phi)) / radius + 0.5;
      }

      vec4 mainImage(vec4 inColor, vec2 uv) {
        vec2 xy = (uv * 2.0 - 1.0) / radius; // move origin of UV coordinates to center of screen
        xy = vec2(xy.x * aspectRatio, xy.y); // adjust aspect ratio
        
        float vignette = 1. - smoothstep(0.95, 1.0, length(xy));
        
        xy = distort(xy);
        vec4 sceneColor = texture(sceneTexture, xy);

        return sceneColor * vignette;
      }
    `;
  }
}