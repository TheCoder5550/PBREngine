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
  vec3 normal = normalize(vPos);
  vec3 sunDirection = normalize(vec3(1, 0.2, 1));
  vec3 sun = max(0., dot(sunDirection, normal) - 0.995) * vec3(50000);

  vec3 col = max(0., normal.y) * vec3(173, 210, 255) / 256. * 2. + sun;
  fragColor = vec4(col, 1);
}