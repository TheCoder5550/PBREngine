#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

uniform samplerCube cubemap;

in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;
in vec3 vPos;

void main() {
  fragColor = texture(cubemap, normalize(vPos));
}