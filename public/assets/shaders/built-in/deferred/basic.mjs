import { shaderBase } from "../base.mjs";

var vertex = `
${shaderBase}

in vec3 position;
in vec3 normal;
in vec4 tangent;
in vec3 color;
in vec2 uv;

out vec4 vPosition;
out vec3 vNormal;
out vec4 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat3 vTBN;

// const int levels = 2;

// uniform sharedPerScene {
//   mat4 projectionMatrix;
//   mat4 viewMatrix;
//   mat4 inverseViewMatrix;
//   float biases[levels];
// };

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

// //Shadows
// uniform mat4 textureMatrices[levels];
// out vec4 projectedTexcoords[levels];

void main() {
  vNormal = mat3(modelMatrix) * normal; // in world-space
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  vec3 _T = normalize(vec3(modelMatrix * vec4(vTangent.xyz, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(normal, vTangent.xyz) * vTangent.w, 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * vec4(normal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  // for (int i = 0; i < levels; i++) {
  //   projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  // }

  vPosition = worldPosition;
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

var fragment = `
${shaderBase}

layout (location = 0) out vec4 gPosition;
layout (location = 1) out vec3 gNormal;
layout (location = 2) out vec3 gAlbedo;
layout (location = 3) out vec4 gProperties;
layout (location = 4) out vec4 gPositionViewSpace;

in vec4 vPosition;
in vec3 vNormal;
in vec4 vTangent;
in vec3 vColor;
in vec2 vUV;
in mat3 vTBN;

// Material properties
uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform sampler2D normalTexture;
uniform bool useNormalTexture;
uniform sampler2D metallicRoughnessTexture;
uniform bool useMetallicRoughnessTexture;
uniform sampler2D emissiveTexture;
uniform bool useEmissiveTexture;
uniform sampler2D occlusionTexture;
uniform bool useOcclusionTexture;

uniform vec4 albedo;
uniform float metallic;
uniform float roughness;
uniform vec3 emissiveFactor;
float ao = 1.;

uniform float alphaCutoff;
uniform float normalStrength;

uniform mat4 viewMatrix;

vec3 setNormalStrength(vec3 normal, float strength) {
  return vec3(normal.xy * strength, mix(1., normal.z, clamp(strength, 0., 1.)));
}

void main() {
  vec4 _albedo = albedo * (useTexture ? texture(albedoTexture, vUV) : vec4(1));
  if (_albedo.a < alphaCutoff) {
    discard;
  }

  gPosition = vec4(vPosition.xyz, 1);
  gPositionViewSpace = viewMatrix * vPosition;

  if (useNormalTexture) {
    vec3 _tangentNormal = texture(normalTexture, vUV).rgb;
    _tangentNormal = _tangentNormal * 2. - 1.;
    _tangentNormal = setNormalStrength(_tangentNormal, normalStrength);
    gNormal = normalize(vTBN * _tangentNormal);
  }
  else {
    gNormal = normalize(vNormal);
  }

  if (!gl_FrontFacing) {
    gNormal *= -1.;
  }

  gAlbedo = _albedo.rgb + emissiveFactor;

  float _metallic = metallic;
  float _roughness = roughness;
  if (useMetallicRoughnessTexture) {
    vec3 ts = texture(metallicRoughnessTexture, vUV).rgb;
    _metallic *= ts.b;
    _roughness *= ts.g;
  }
  gProperties = vec4(_roughness, _metallic, 0, 1);
}
`;

vertex = vertex.trim();
fragment = fragment.trim();

export {
  vertex,
  fragment
};