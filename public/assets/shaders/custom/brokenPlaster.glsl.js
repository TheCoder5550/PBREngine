import * as lit from "../built-in/lit.glsl.js";

var vertex = lit.webgl2.lit.vertex;

var fragment = `
${lit.shaderBase}

layout (location = 0) out vec4 fragColor;

// Attributes
in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
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
uniform float environmentIntensity;
uniform samplerCube u_diffuseIBL;
uniform samplerCube u_specularIBL;
uniform sampler2D u_splitSum;

// Shadows
const int levels = 2;
in vec4 projectedTexcoords[levels];
// uniform float biases[levels];
uniform sampler2D projectedTextures[levels];

int shadowQuality = 2;
float shadowDarkness = 0.;
// vec2 shadowStepSize = 1. / vec2(1024) * 10.; // bruh
const float shadowKernalSize = 2.;
mat3 shadowKernel = mat3(
  1, 2, 1,
  2, 4, 2,
  1, 2, 1
);
vec2 poissonDisk[16] = vec2[]( 
   vec2( -0.94201624, -0.39906216 ), 
   vec2( 0.94558609, -0.76890725 ), 
   vec2( -0.094184101, -0.92938870 ), 
   vec2( 0.34495938, 0.29387760 ), 
   vec2( -0.91588581, 0.45771432 ), 
   vec2( -0.81544232, -0.87912464 ), 
   vec2( -0.38277543, 0.27676845 ), 
   vec2( 0.97484398, 0.75648379 ), 
   vec2( 0.44323325, -0.97511554 ), 
   vec2( 0.53742981, -0.47373420 ), 
   vec2( -0.26496911, -0.41893023 ), 
   vec2( 0.79197514, 0.19090188 ), 
   vec2( -0.24188840, 0.99706507 ), 
   vec2( -0.81409955, 0.91437590 ), 
   vec2( 0.19984126, 0.78641367 ), 
   vec2( 0.14383161, -0.14100790 ) 
);

// uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

${lit.litBase}

float getHeight(vec2 uv) {
  float mask = LayeredNoise(uv * 3.);
  mask = smoothstep(0.685, 0.715, mask);
  // mask = 1. - mask;
  return mask * 5.;
}

void main() {
  float mask = clamp(getHeight(vUV), 0., 1.);

  vec4 plasterAlbedo = texture(albedoTextures[0], vUV * 2.5);// * vec4(1.3, 0.9, 0.7, 1);
  vec4 brickAlbedo = texture(albedoTextures[1], vUV * 2.5);

  vec3 plasterNormal = texture(normalTextures[0], vUV * 2.5).rgb;
  vec3 brickNormal = texture(normalTextures[1], vUV * 2.5).rgb;

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

cleanupShaders(webgl2);

export {
  webgl2
};

function cleanupShaders(obj) {
  for (var key in obj) {
    if (typeof obj[key] == "string") {
      obj[key] = obj[key].trim();
    }
    else if (typeof obj[key] == "object") {
      cleanupShaders(obj[key]);
    }
  }
}