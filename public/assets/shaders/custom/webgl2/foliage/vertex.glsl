#version 300 es

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;

uniform float iTime;
uniform mat4 projectionMatrix;
uniform mat4 inverseViewMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vColor;
out vec2 vUV;

float billboardSize = 0.5;

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  vec3 offset = mat3(inverseViewMatrix) * vec3((vUV - 0.5) * 2. * billboardSize, 0);
  vec3 wind = vec3(0.05 * sin(iTime * 0.9 + position.x * position.y * position.z * 1.5), 0, 0);
  vec4 worldPosition = modelMatrix * vec4(position + offset + wind, 1.0);

  vPosition = vec3(worldPosition);
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}