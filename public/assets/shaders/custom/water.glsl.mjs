import * as lit from "../built-in/lit.glsl.mjs";

var vertex = `
${lit.shaderBase}

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;
//#in

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat3 vTBN;
//#out

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

out vec3 nearPoint;
out vec3 farPoint;

vec3 UnprojectPoint(float x, float y, float z, mat4 view, mat4 projection) {
  mat4 viewInv = inverse(view);
  mat4 projInv = inverse(projection);
  vec4 unprojectedPoint = viewInv * projInv * vec4(x, y, z, 1.0);
  return unprojectedPoint.xyz / unprojectedPoint.w;
}

void main() {
  //#main

  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  vec3 _T = normalize(vec3(modelMatrix * vec4(vTangent, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent), 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * vec4(vNormal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = vec4(position, 1.0);
  for (int i = 0; i < levels; i++) {
    projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  }

  vPosition = vec3(worldPosition);

  nearPoint = UnprojectPoint(position.x, position.y, 0.0, viewMatrix, projectionMatrix).xyz; // unprojecting on the near plane
  farPoint = UnprojectPoint(position.x, position.y, 1.0, viewMatrix, projectionMatrix).xyz; // unprojecting on the far plane
  
  gl_Position = vec4(position, 1.0);
  // gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

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

in vec3 nearPoint;
in vec3 farPoint;

uniform vec2 uvScale;
uniform float iTime;
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

vec4 getNormal( vec2 uv ) {
  vec2 uv0 = ( uv / 103.0 ) + vec2(iTime / 17.0, iTime / 29.0);
  vec2 uv1 = uv / 107.0-vec2( iTime / -19.0, iTime / 31.0 );
  vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( iTime / 101.0, iTime / 97.0 );
  vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( iTime / 109.0, iTime / -113.0 );
  vec4 noise = texture( normalTexture, uv0 ) +
    texture( normalTexture, uv1 ) +
    texture( normalTexture, uv2 ) +
    texture( normalTexture, uv3 );
  return noise * 0.5 - 1.0;
}

void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
  vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
  float direction = max( 0.0, dot( eyeDirection, reflection ) );
  specularColor += pow( direction, shiny ) * vec3(1, 1, 1) * spec;
  diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * vec3(1, 1, 1) * diffuse;
}

float getShadowAmountWater(vec2 offset) {
  vec3 proj = projectedTexcoords[0].xyz / projectedTexcoords[0].w;
  float currentDepth = proj.z + biases[0];
  float projectedDepth = texture(projectedTextures[0], proj.xy + offset).r;
  bool inside = inRange(proj);
  
  if (inside) {
    return (projectedDepth <= currentDepth ? shadowDarkness : 1.);
  }
  
  proj = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
  currentDepth = proj.z + biases[1];
  projectedDepth = texture(projectedTextures[1], proj.xy + offset).r;
  inside = inRange(proj);

  if (inside) {
    return fadeOutShadow(projectedDepth <= currentDepth ? shadowDarkness : 1., proj);
  }

  return 1.;
}

float computeDepth(vec3 pos) {
  vec4 clip_space_pos = projectionMatrix * viewMatrix * vec4(pos.xyz, 1.0);
  return (clip_space_pos.z / clip_space_pos.w);
}

void main() {
  float t = (-30. - nearPoint.y) / (farPoint.y - nearPoint.y);
  vec3 fragPos3D = nearPoint + t * (farPoint - nearPoint);
  if (t <= 0.) {
    discard;
  }
  gl_FragDepth = computeDepth(fragPos3D);

  float distortionScale = 1.;
  vec3 eye = vec3(inverseViewMatrix * vec4(0, 0, 0, 1));
  vec3 waterColor = vec3(0, 0.07, 0.05);

  vec4 noise = getNormal( fragPos3D.xz * 5. /*vUV * uvScale*/ );
  vec3 surfaceNormal = normalize( noise.xzy * vec3(0.5, 1, 0.5) );
  // surfaceNormal.xy = vec2(-1, 1) * surfaceNormal.yx;
  // surfaceNormal = normalize(vTBN * surfaceNormal);
  vec3 diffuseLight = vec3(0.0);
  vec3 specularLight = vec3(0.0);
  vec3 worldToEye = eye-fragPos3D;
  vec3 eyeDirection = normalize( worldToEye );
  sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );
  float distance = length(worldToEye);
  // vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
  vec3 reflectionSample = textureLod(u_specularIBL, reflect(-eyeDirection, surfaceNormal), 0.).rgb;//vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );
  float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
  float rf0 = 0.3;
  float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
  vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
  vec3 albedo = mix( ( vec3(1, 1, 1) * diffuseLight * 0.3 + scatter ) * getShadowAmountWater(noise.xy * 0.02), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);
  vec3 outgoingLight = albedo;
  fragColor = vec4( outgoingLight, 1.);

  // vec4 currentAlbedo = albedo;
  // vec3 _tangentNormal = getNormal(vUV * uvScale).rgb;
  
  // vec3 _emission = vec3(0);
  // float _metallic = 1.;
  // float _roughness = 0.1;
  // float _ao = 1.;

  // fragColor = lit(currentAlbedo, 0.5, _emission, _tangentNormal, _metallic, _roughness, _ao);
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