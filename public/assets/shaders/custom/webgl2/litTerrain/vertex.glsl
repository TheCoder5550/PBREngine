#version 300 es
precision highp float;
precision mediump int;

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
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

  vec3 _T = normalize(vec3(modelMatrix * vec4(vTangent, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent), 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * vec4(vNormal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vNormal = normalize(vTBN * tangentNormal);

  _T = normalize(vec3(modelMatrix * vec4(vTangent, 0.0)));
  _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent), 0.0)));
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