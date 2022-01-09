attribute vec3 position;
attribute vec3 normal;
attribute vec3 color;
attribute vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUV;

void main() {
  vNormal = normal;
  vUV = uv;
  vColor = color;
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}