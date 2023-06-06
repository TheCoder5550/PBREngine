#version 300 es

in vec3 position;
in vec3 normal;
in vec3 color;
in vec2 uv;
in mat4 modelMatrix;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

void main() {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}