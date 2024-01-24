import * as lit from "../built-in/lit.glsl.mjs";

export const vertex = `
#version 300 es
precision highp float;
precision mediump int;

in vec3 position;
in vec3 normal;
in vec4 tangent;
in vec3 color;
in vec2 uv;

out vec3 vPosition;
out vec3 vNormal;
out vec4 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat3 vTBN;

const int levels = 2;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

//Shadows
uniform mat4 textureMatrices[levels];
out vec4 projectedTexcoords[levels];

// Deformation
uniform sampler2D heightmap;
uniform float maxHeight;
uniform float cameraSize;

// Motion blur
out vec4 clipSpace;
out vec4 prevClipSpace;
uniform mat4 prevViewMatrix;
uniform mat4 prevModelMatrix;

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);

  vec2 heightUV = worldPosition.xz / (cameraSize * 2.);
  heightUV.y *= -1.;
  heightUV += 0.5;

  float a = textureOffset(heightmap, heightUV, ivec2(-1, -1)).x;
  float b = textureOffset(heightmap, heightUV, ivec2(0, -1)).x;
  float c = textureOffset(heightmap, heightUV, ivec2(1, -1)).x;
  float d = textureOffset(heightmap, heightUV, ivec2(-1, 0)).x;
  float e = textureOffset(heightmap, heightUV, ivec2(0, 0)).x;
  float f = textureOffset(heightmap, heightUV, ivec2(1, 0)).x;
  float g = textureOffset(heightmap, heightUV, ivec2(-1, 1)).x;
  float h = textureOffset(heightmap, heightUV, ivec2(0, 1)).x;
  float i = textureOffset(heightmap, heightUV, ivec2(1, 1)).x;
  float height = (a + 2. * b + c + 2. * d + 4. * e + 2. * f + g + 2. * h + i) / 16.; //texture(heightmap, heightUV).r;

  worldPosition.xyz += vec3(0, (1. - height) * maxHeight, 0);

  float normalStrength = 2.;
  const vec2 size = vec2(2.0,0.0);
  const ivec3 off = ivec3(-1,0,1);
  float s01 = textureOffset(heightmap, heightUV, off.xy).x * normalStrength;
  float s21 = textureOffset(heightmap, heightUV, off.zy).x * normalStrength;
  float s10 = textureOffset(heightmap, heightUV, off.yx).x * normalStrength;
  float s12 = textureOffset(heightmap, heightUV, off.yz).x * normalStrength;
  vec3 va = normalize(vec3(size.xy,s21-s01));
  vec3 vb = normalize(vec3(size.yx,s12-s10));
  vec3 tangentNormal = cross(va,vb);
  // tangentNormal.xyz = tangentNormal.xyz * vec3(1, -1, 1);
  tangentNormal.xyz = tangentNormal.yxz;
  // vNormal.xyz = vNormal.xzy;

  vec3 _T = normalize(vec3(modelMatrix * vec4(vTangent.xyz, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent.xyz) * vTangent.w, 0.0))); // bruh According to comment on stackoverflow (https://blender.stackexchange.com/questions/220756/why-does-blender-output-vec4-tangents-for-gltf), tangents are vec4 and .w is used for bitangent sign (who could have known... :(
  vec3 _N = normalize(vec3(modelMatrix * vec4(vNormal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vNormal = normalize(vTBN * tangentNormal);

  _T = normalize(vec3(modelMatrix * vec4(vTangent.xyz, 0.0)));
  _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent.xyz) * vTangent.w, 0.0))); // bruh According to comment on stackoverflow (https://blender.stackexchange.com/questions/220756/why-does-blender-output-vec4-tangents-for-gltf), tangents are vec4 and .w is used for bitangent sign (who could have known... :(
  _N = normalize(vec3(modelMatrix * vec4(vNormal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  for (int i = 0; i < levels; i++) {
    projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  }

  vPosition = vec3(worldPosition);
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;

  // Motion blur , bruh prev model matrix does not work!
  vec4 prevCs = projectionMatrix * prevViewMatrix * modelMatrix * vec4(position, 1.0);
  prevClipSpace = prevCs;
  clipSpace = gl_Position;
}
`;

export const fragment = `
${lit.shaderBase}

${lit.litAttributesAndUniforms.replace("uniform bool doNoTiling;", "const bool doNoTiling = false;")}

${lit.litBase}

${lit.fogBase}

const int nrTextures = 3;
uniform sampler2D albedoTextures[nrTextures];
uniform sampler2D normalTextures[nrTextures];
uniform sampler2D metallicRoughnessTextures[nrTextures];

uniform vec4 albedos[nrTextures];

uniform sampler2D heightmap;

void main() {
  ${lit.motionBlurMain}

  vec3 up = vec3(0, 1, 0);
  vec4 currentAlbedo = vec4(1);

  vec2 currentUVs = vPosition.xz * 0.2;//vUV;

  // Normals
  vec3 grassNormal = sampleTexture(normalTextures[0], currentUVs).rgb * 2. - 1.;
  vec3 stoneNormal = sampleTexture(normalTextures[1], currentUVs).rgb * 2. - 1.;
  vec3 snowNormal = sampleTexture(normalTextures[2], currentUVs).rgb * 2. - 1.;

  grassNormal = setNormalStrength(grassNormal, 0.4);

  vec3 currentNormal = normalize(mix(stoneNormal, grassNormal, smoothstep(0.4, 0.75, pow(dot(up, vNormal), 100.))));
  currentNormal = normalize(mix(currentNormal, snowNormal, smoothstep(80., 100., vPosition.y + LayeredNoise(currentUVs / 20.) * 30.)));
  currentNormal = grassNormal;

  // Colors
  vec3 grassAlbedo = sampleTexture(albedoTextures[0], currentUVs).rgb * albedos[0].rgb;
  vec3 stoneAlbedo = sampleTexture(albedoTextures[1], currentUVs).rgb * albedos[1].rgb;
  vec3 snowAlbedo = sampleTexture(albedoTextures[2], currentUVs).rgb * albedos[2].rgb;

  // Large scale detail (grass color variation)
  grassAlbedo *= mix(vec3(1.0), vec3(0.4, 0.7, 0.4), clamp(LayeredNoise(currentUVs / 40.), 0., 1.));

  currentAlbedo.rgb = grassAlbedo;

  // // Steep terrain is rocky
  // currentAlbedo.rgb = mix(stoneAlbedo, grassAlbedo, smoothstep(0.4, 0.75, pow(dot(up, vNormal), 100.)));

  // // Top of mountains are snowy
  // currentAlbedo.rgb = mix(currentAlbedo.rgb, snowAlbedo, smoothstep(80., 100., vPosition.y + LayeredNoise(vUV / 20.) * 30.));

  // vec3 steepness = normalize(mix(stoneNormal, grassAlbedo, smoothstep(0.8, 1., dot(up, vNormal))));
  // vec3 newNormal = normalize(mix(steepness, snowNormal, smoothstep(20., 35., vPosition.y)));

  // fragColor = vec4(grassAlbedo, 1.0);
  // return;

  // fragColor = vec4(vNormal, 1);
  // return;

  vec3 tangentNormal = currentNormal;
  // vec3 tangentNormal = vec3(0, 0, 1);
  tangentNormal = setNormalStrength(tangentNormal, 3.);

  vec4 litColor = lit(currentAlbedo, 0.5, vec3(0), tangentNormal, 0., 0.95, 1.);
  
  #ifdef USEFOG
    litColor = applyFog(litColor);
  #endif
  
  fragColor = litColor;
  return;

  // vec3 up = vec3(0, 1, 0);

  // // grassAlbedo = mix(grassAlbedo * vec3(1, 1, 0.3), grassAlbedo, noise(currentUVs / 50.));
  // // grassAlbedo = mix(vec3(1), vec3(0), noise(currentUVs / 5.));
  // grassAlbedo *= mix(vec3(1.0), vec3(0.4, 0.7, 0.4), clamp(LayeredNoise(currentUVs / 40.), 0., 1.));

  // vec3 steepness = mix(stoneAlbedo, grassAlbedo, smoothstep(0.7, 0.75, dot(up, vNormal)));
  // currentAlbedo.xyz = mix(steepness, snowAlbedo, smoothstep(80., 100., vPosition.y + LayeredNoise(currentUVs / 20.) * 30.));

  // steepness = normalize(mix(stoneNormal, grassAlbedo, smoothstep(0.8, 1., dot(up, vNormal))));
  // vec3 newNormal = normalize(mix(steepness, snowNormal, smoothstep(20., 35., vPosition.y)));

  // // vec3 _tangentNormal = grassNormal * 2. - 1.;//newNormal * 2. - 1.;
  // vec3 _tangentNormal = grassNormal;
  // // _tangentNormal.g *= -1.;

  // // fragColor = vec4(currentAlbedo.rgb * clamp(dot(sunDirection, vNormal), 0., 1.), currentAlbedo.a);
  // // return;

  // // if (doNoTiling) {
  // //   currentAlbedo.rgb = mix(currentAlbedo.rgb * vec3(1, 1, 0.3), currentAlbedo.rgb, noise(currentUVs / 50.));
  // // }

  // vec3 _emission = vec3(0);//emissiveFactor;
  // // if (useEmissiveTexture) {
  // //   _emission *= sampleTexture(emissiveTexture, currentUVs).rgb;
  // // }

  // float _ao = 1.;//ao;
  // // if (useOcclusionTexture) {
  // //   _ao *= sampleTexture(occlusionTexture, currentUVs).r;
  // // }

  // float _metallic = 0.;//metallic;
  // float _roughness = 0.95;//roughness;
  // // if (useMetallicRoughnessTexture) {
  // //   vec3 ts = sampleTexture(metallicRoughnessTexture, currentUVs).rgb;
  // //   _metallic *= ts.b;
  // //   _roughness *= ts.g;
  // // }

  // _roughness = clamp(_roughness, 0.01, 0.99);

  // float alphaCutoff = 0.5;

  // fragColor = lit(currentAlbedo, alphaCutoff, _emission, _tangentNormal, _metallic, _roughness, _ao);
}

`;