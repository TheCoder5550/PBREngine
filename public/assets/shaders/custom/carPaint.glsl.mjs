import * as lit from "../built-in/lit.glsl.mjs";

var vertex = lit.webgl2.lit.vertex;

var fragment = `
${lit.shaderBase}

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec2 motionVector;

// Attributes
in vec3 vPosition;
in vec3 vNormal;
in vec4 vTangent; //in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;
in mat3 vTBN;

// Motion blur
in vec4 clipSpace;
in vec4 prevClipSpace;
//#in

// Custom
uniform bool twoTone;
uniform vec3 color1;
uniform vec3 color2;
uniform bool useFlakes;
uniform sampler2D flakesNormalTexture;
uniform float flakeScale;
uniform float clearcoatFactor;
uniform float clearcoatRoughness;
//

uniform sampler2D albedoTexture;
uniform sampler2D normalTexture;

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

int shadowQuality = 2;
float shadowDarkness = 0.;
// vec2 shadowStepSize = 1. / vec2(1024) * 10.; // bruh
const float shadowKernalSize = 2.;
mat3 shadowKernel = mat3(
  1, 2, 1,
  2, 4, 2,
  1, 2, 1
);
// vec2 poissonDisk[16] = vec2[]( 
//    vec2( -0.94201624, -0.39906216 ), 
//    vec2( 0.94558609, -0.76890725 ), 
//    vec2( -0.094184101, -0.92938870 ), 
//    vec2( 0.34495938, 0.29387760 ), 
//    vec2( -0.91588581, 0.45771432 ), 
//    vec2( -0.81544232, -0.87912464 ), 
//    vec2( -0.38277543, 0.27676845 ), 
//    vec2( 0.97484398, 0.75648379 ), 
//    vec2( 0.44323325, -0.97511554 ), 
//    vec2( 0.53742981, -0.47373420 ), 
//    vec2( -0.26496911, -0.41893023 ), 
//    vec2( 0.79197514, 0.19090188 ), 
//    vec2( -0.24188840, 0.99706507 ), 
//    vec2( -0.81409955, 0.91437590 ), 
//    vec2( 0.19984126, 0.78641367 ), 
//    vec2( 0.14383161, -0.14100790 ) 
// );

// uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

${lit.litBase}

vec3 getN(vec3 tangentNormal) {
  vec3 N;
  if (vTangent.xyz != vec3(0)) {
    N = normalize(vTBN * tangentNormal);
  }
  else {
    N = normalize(mat3(modelMatrix) * vNormal);
  }

  if (!gl_FrontFacing) {
    N *= -1.;
  }

  return N;
}

void main() {
  ${lit.motionBlurMain}

  // vec4 baseAlbedo = vec4(0, 0, 1, 1);
  float baseAO = 1.;

  vec3 baseTangentNormal = vec3(0, 0, 1);
  if (useFlakes) {
    baseTangentNormal = textureNoTile(flakesNormalTexture, vUV * flakeScale, 1.).rgb * 2. - 1.;
  }

  float baseScalarF0 = 0.04;

  vec3 clearcoatTangentNormal = vec3(0, 0, 1);
  float clearcoatScalarF0 = 0.04;
  //

  float ccRough = clearcoatRoughness;
  ccRough = clamp(ccRough, 0.01, 0.99);
  float rough = roughness;
  rough = clamp(rough, 0.01, 0.99);

  // V, N, R
  vec3 V = normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);
  
  vec3 baseN = getN(baseTangentNormal);
  vec3 clearcoatN = getN(clearcoatTangentNormal);

  vec3 baseR = reflect(-V, baseN);
  vec3 clearcoatR = reflect(-V, clearcoatN);
  //

  vec4 baseAlbedo = vec4(color1, 1);
  if (twoTone) {
    float fresnelTerm = dot(V, baseN);
    fresnelTerm = clamp(1.0 - fresnelTerm, 0., 1.);

    baseAlbedo = vec4(mix(color1, color2, fresnelTerm), 1);
    // baseAlbedo = vec4(fresnelTerm * color1 + pow(fresnelTerm, 2.) * color2, 1);
  }

  // Clear coat
  // vec3 F0 = vec3(clearcoatScalarF0);
  // F0 = mix(F0, clearcoatAlbedo, /*clearcoatMetallic = */0.);
  // vec3 F = fresnelSchlickRoughness(max(dot(clearcoatN, V), 0.), F0, clearcoatRoughness);

  // vec3 kS = F;
  // vec3 kD = 1.0 - kS;
  // kD *= 1.0 - /*clearcoatMetallic = */0.;
    
  // vec3 irradiance = texture(u_diffuseIBL, clearcoatN).rgb;
  // vec3 diffuse  = irradiance * clearcoatAlbedo;
    
  // const float MAX_REFLECTION_LOD = 4.0;
  // vec3 prefilteredColor = textureLod(u_specularIBL, clearcoatR, clearcoatRoughness * MAX_REFLECTION_LOD).rgb;

  // vec2 uv = vec2(max(dot(clearcoatN, V), 0.), clearcoatRoughness);
  // uv.y = 1. - uv.y;
  // vec2 envBRDF = texture(u_splitSum, uv).rg;

  // vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);
    
  // vec3 clearcoatColor = (kD * diffuse * 0. + specular) * environmentIntensity;

  vec3 F0 = vec3(clearcoatScalarF0);
  vec3 F = fresnelSchlickRoughness(max(dot(clearcoatN, V), 0.), F0, ccRough);
    
  const float MAX_REFLECTION_LOD = 4.0;
  vec3 prefilteredColor = textureLod(u_specularIBL, clearcoatR, ccRough * MAX_REFLECTION_LOD).rgb;

  vec2 uv = vec2(max(dot(clearcoatN, V), 0.), ccRough);
  uv.y = 1. - uv.y;
  vec2 envBRDF = texture(u_splitSum, uv).rg;

  vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);
  vec3 clearcoatColor = specular * environmentIntensity;

  // Base
  vec3 baseIBL = IBL(baseN, V, baseR, baseAlbedo.rgb, metallic, rough, baseScalarF0) * baseAO;
  vec3 baseSun = DirectionalLight(vPosition, baseN, V, sunDirection.xyz, sunIntensity.xyz, baseAlbedo.rgb, metallic, rough, baseScalarF0) * baseAO * getShadowAmount(dot(sunDirection.xyz, baseN));
  vec3 baseColor = baseIBL + baseSun;

  // Final
  vec3 finalColor = baseColor * (1. - F * clearcoatFactor) + clearcoatColor * clearcoatFactor;
  fragColor = vec4(finalColor, 1);
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