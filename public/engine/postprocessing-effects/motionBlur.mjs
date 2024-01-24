import PostProcessingEffect from "./postprocessingEffect.mjs";

export default class Motionblur extends PostProcessingEffect {
  strength = 0.2;

  setUniforms(programContainer, gl) {
    gl.uniform1f(programContainer.getUniformLocation("motionBlurStrength"), this.strength);
  }

  getFragmentSource() {
    return `
      const int MAX_SAMPLES = 32;

      uniform float motionBlurStrength;

      float getLinearDepth(float depth) {
        return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - depth * (cameraFar - cameraNear));
      }

      vec4 mainImage(vec4 inColor, vec2 uv) {
        vec2 texelSize = 1.0 / vec2(textureSize(sceneVelocityTexture, 0));
        vec2 velocity = texture(sceneVelocityTexture, uv).xy * 2. - 1.;
        velocity *= motionBlurStrength;
        velocity *= currentFPS / 60.;
  
        float speed = length(velocity / texelSize);
        int nSamples = clamp(int(speed), 1, MAX_SAMPLES);
  
        vec4 result = texture(sceneTexture, uv);
        
        float targetDepth = getLinearDepth(texture(sceneDepthTexture, uv).r);
        float weights = 1.;
  
        for (int i = 1; i < nSamples; ++i) {
          vec2 offset = velocity * (float(i) / float(nSamples - 1) - 0.5);
  
          float currentDepth = texture(sceneDepthTexture, uv + offset).r;
          currentDepth = getLinearDepth(currentDepth);
  
          // Samples with different depth should not be used in blur
          float weight = 1. - clamp(abs(targetDepth - currentDepth), 0., 1.);
  
          result += texture(sceneTexture, uv + offset) * weight;
          weights += weight;
        }
        result /= weights;
        
        return result;
      }
    `;
  }
}