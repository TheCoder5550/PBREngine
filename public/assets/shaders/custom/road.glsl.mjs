import * as lit from "../built-in/lit.glsl.mjs";

var vertex = lit.webgl2.lit.vertex;

var fragment = `
${lit.shaderBase}

${lit.litAttributesAndUniforms}

${lit.litBase}

${lit.fogBase}

void main() {
  ${lit.motionBlurMain}

  vec4 currentAlbedo = texture(albedoTexture, vUV);
  vec3 _emission = vec3(0);
  // float _metallic = 0.;
  // float _roughness = 1.;
  float _ao = 1.;

  float _metallic = metallic;
  float _roughness = roughness;
  if (useMetallicRoughnessTexture) {
    vec3 ts = sampleTexture(metallicRoughnessTexture, vUV).rgb;
    _metallic *= ts.b;
    _roughness *= ts.g;
  }

  // float f = clamp((0.01 - abs(vUV.x - 0.5)) * 100. * smoothstep(0.685, 0.715, LayeredNoise(vUV * 20.)), 0., 1.);
  // currentAlbedo.rgb = mix(currentAlbedo.rgb, vec3(171, 123, 21) / 255., f);

  // currentAlbedo.rgb = vec3(LayeredNoise(vUV * 5.));

  // vec2 noiseUV = vUV * vec2(3, 1) * 15.;
  // if (noise(noiseUV) + noise(noiseUV * 1.6) * 0.5 > 20. - abs(0.5 - vUV.x) * 39.5) {
  //   discard;
  // }

  // if (abs(vUV.x - 0.5) < 0.005 + LayeredNoise(vUV * 10.) * 0.004/* && abs(mod(vUV.y, 0.25) - 0.125) > 0.05*/) {
  //   currentAlbedo.rgb = vec3(171, 123, 21) / 255.;
  //   _roughness = 0.5;
  // }

  vec3 _tangentNormal = texture(normalTexture, vUV).rgb * 2. - 1.;
  _tangentNormal = setNormalStrength(_tangentNormal, 2.);

  vec4 litColor = lit(currentAlbedo, 0.5, _emission, _tangentNormal, _metallic, _roughness, _ao);

  #ifdef USEFOG
    litColor = applyFog(litColor);
  #endif

  fragColor = litColor;
}
`;

var webgl2 = {
  vertex,
  fragment
};

export {
  webgl2
};