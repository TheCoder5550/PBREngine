// lit - vertex.glsl
attribute vec3 position;
attribute vec3 normal;
attribute vec3 tangent;
attribute vec3 color;
attribute vec2 uv;
attribute float alpha;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vColor;
varying vec2 vUV;
varying mat3 vTBN;
varying float vAlpha;

//Shadows
const int levels = 2;
uniform mat4 textureMatrices[levels];
// varying vec4 projectedTexcoords[levels];

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;
  vAlpha = alpha;

  vec3 _T = normalize(vec3(modelMatrix * vec4(vTangent, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent), 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * vec4(vNormal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  // for (int i = 0; i < levels; i++) {
  //   projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  // }

  vPosition = vec3(worldPosition);
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}