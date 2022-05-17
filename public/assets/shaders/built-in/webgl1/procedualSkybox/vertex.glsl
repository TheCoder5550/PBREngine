attribute vec3 position;
attribute vec3 normal;
attribute vec3 tangent;
attribute vec3 color;
attribute vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vColor;
varying vec2 vUV;
varying vec3 vPos;

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;
  vPos = position;
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}