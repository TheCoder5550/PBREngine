#version 300 es

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;

uniform mat4 projectionMatrix;
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

  vec3 offset = mat3(inverse(viewMatrix)) * vec3((vUV - 0.5) * 2. * billboardSize, 0);
  vec4 worldPosition = modelMatrix * vec4(position + offset, 1.0);

  vPosition = vec3(worldPosition);
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}