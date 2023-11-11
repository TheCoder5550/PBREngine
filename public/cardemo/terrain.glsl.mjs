import * as lit from "../assets/shaders/built-in/lit.glsl.mjs";

var vertex = lit.webgl2.lit.vertex;

var fragment = `
${lit.shaderBase}

${lit.litAttributesAndUniforms}

const int nrTextures = 2;
uniform sampler2D albedoTextures[nrTextures];
uniform sampler2D normalTextures[nrTextures];
uniform sampler2D metallicRoughnessTextures[nrTextures];

${lit.litBase}

${lit.fogBase}

void main() {
  ${lit.motionBlurMain}

  vec4 grassAlbedo = vec4(textureNoTile(albedoTextures[0], vUV, 1.), 1);
  vec4 stoneAlbedo = vec4(textureNoTile(albedoTextures[1], vUV, 1.), 1);

  vec3 grassNormal = textureNoTile(normalTextures[0], vUV, 1.) * 2. - 1.;
  vec3 stoneNormal = textureNoTile(normalTextures[1], vUV, 1.) * 2. - 1.;

  float mixFactor = clamp(noise(vUV / 40.), 0., 1.);

  vec4 currentAlbedo = mix(grassAlbedo, stoneAlbedo, mixFactor);
  currentAlbedo *= albedo;
  currentAlbedo.rgb *= mix(vec3(0.3, 0.5, 0.1), vec3(0.5, 0.5, 0.3), mixFactor);
  // currentAlbedo.rgb *= 0.7;

  // vec4 currentAlbedo = vec4(textureNoTile(albedoTextures[0], vUV, 1.), 1);
  // currentAlbedo *= albedo;
  // currentAlbedo.rgb *= mix(vec3(1.0), vec3(0.5, 0.5, 0.6), clamp(LayeredNoise(vUV / 40.), 0., 1.));

  vec3 _emission = vec3(0);
  float _metallic = 0.;
  float _roughness = 1.;
  float _ao = 1.;

  vec3 _tangentNormal = normalize(mix(grassNormal, stoneNormal, mixFactor));
  _tangentNormal = setNormalStrength(_tangentNormal, 3.);

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