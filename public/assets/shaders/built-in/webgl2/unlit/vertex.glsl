#version 300 es

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec4 color;
in vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

out vec3 vNormal;
out vec3 vTangent;
out vec4 vColor;
out vec2 vUV;

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}