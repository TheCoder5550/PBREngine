#version 300 es

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

out vec2 vUV;
out vec3 vEyePos;
out vec3 vEyeNormal;
out vec3 vEyeTangent;

void main() {
  vUV = uv;
  vEyePos = (viewMatrix * modelMatrix * vec4(position, 1.0)).xyz;
  vEyeNormal = mat3(viewMatrix * modelMatrix) * normal;
  vEyeTangent = mat3(viewMatrix * modelMatrix) * tangent;
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}