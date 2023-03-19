import { shadowBase } from "../built-in/base.mjs";
import * as lit from "../built-in/lit.glsl.mjs";

var vertex = lit.webgl2.lit.vertex;

var fragment = `
${lit.shaderBase}

layout (location = 0) out vec4 fragColor;

// Attributes
in vec3 vPosition;
in vec3 vNormal;
in vec4 vTangent;
in vec3 vColor;
in vec2 vUV;
in mat3 vTBN;
//#in

uniform sampler2D albedoTextures[2];
uniform sampler2D normalTextures[2];

uniform vec4 albedo;
uniform float metallic;
uniform float roughness;
uniform vec3 emissiveFactor;
float ao = 1.;
uniform bool opaque;
uniform float alphaCutoff;
uniform float normalStrength;
uniform bool doNoTiling;

// bruh make shared uniform into uniform block
// Light info
struct LightInfo {
  int type;
  vec3 position;
  vec3 direction;
  float angle;
  vec3 color;
};
const int maxLights = 16;
uniform LightInfo lights[maxLights];
uniform int nrLights;
uniform vec3 sunDirection;
uniform vec3 sunIntensity;

// Environment
uniform vec3 ambientColor;
uniform float environmentIntensity;
uniform samplerCube u_diffuseIBL;
uniform samplerCube u_specularIBL;
uniform sampler2D u_splitSum;

// Shadows
const int levels = 2;
in vec4 projectedTexcoords[levels];
// uniform float biases[levels];
uniform sampler2D projectedTextures[levels];

// uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

${lit.litBase}

float overlayBlend(float a, float b) {
  if (a < 0.5) {
    return a * b * 2.;
  }
  else {
    return 1. - 2. * (1. - a) * (1. - b);
  }
}

// float getHeight(vec2 uv) {
//   float mask = LayeredNoise(uv * 3.);
//   mask = smoothstep(0.685, 0.715, mask);
//   // mask = 1. - mask;
//   return mask * 5.;
// }

float getHeight(vec2 vUV) {
  vec4 brickAlbedo = texture(albedoTextures[1], vUV * 2.5);
  float mask = smoothstep(0.7, 1., LayeredNoise(vUV * 1.) * (-vUV.y + 2.3));
  mask = overlayBlend(mask, smoothstep(0.4, 0.5, (1.05 - brickAlbedo.r)));
  mask = smoothstep(0.45, 0.55, mask);
  return mask * 10.;
}

void main() {
  vec4 plasterAlbedo = texture(albedoTextures[0], vUV * 2.5);// * vec4(1.3, 0.9, 0.7, 1);
  vec4 brickAlbedo = texture(albedoTextures[1], vUV * 2.5);

  vec3 plasterNormal = texture(normalTextures[0], vUV * 2.5).rgb;
  vec3 brickNormal = texture(normalTextures[1], vUV * 2.5).rgb;

  float mask = clamp(getHeight(vUV) / 10., 0., 1.);
  // // float mask = clamp(-vUV.y + 1.5, 0., 1.);
  // float mask = smoothstep(0.7, 1., LayeredNoise(vUV * 3.));

  // mask = overlayBlend(mask, smoothstep(0.4, 0.5, (1.05 - brickAlbedo.r)));
  // // mask = overlayBlend(mask, LayeredNoise(vUV * 5.));
  // mask = smoothstep(0.45, 0.55, mask);

  // fragColor = vec4(vec3(mask), 1);
  // return;

  vec4 currentAlbedo = mix(brickAlbedo, plasterAlbedo, mask);
  vec3 _tangentNormal = mix(brickNormal, plasterNormal, mask);

  _tangentNormal = _tangentNormal * 2. - 1.;

  float stepSize = 0.0005;
  float size = 2.; //?
  float s01 = getHeight(vUV + vec2(-stepSize, 0));
  float s21 = getHeight(vUV + vec2(stepSize, 0));
  float s10 = getHeight(vUV + vec2(0, -stepSize));
  float s12 = getHeight(vUV + vec2(0, stepSize));
  vec3 va = normalize(vec3(size, 0, s21 - s01));
  vec3 vb = normalize(vec3(0, size, s12 - s10));
  // vec3 _tangentNormal = (texture(normalTextures[1], vUV).rgb - 0.5) * 2.;

  _tangentNormal = mix(cross(va, vb), _tangentNormal * 3., 0.5);
  
  vec3 _emission = vec3(0);
  float _metallic = 0.;
  float _roughness = 1.;
  float _ao = 1.;

  fragColor = lit(currentAlbedo, 0.5, _emission, _tangentNormal, _metallic, _roughness, _ao);
}
`;

var webgl2 = {
  vertex,
  fragment
};

lit.trimStrings(webgl2);

export {
  webgl2
};