import * as lit from "../../assets/shaders/built-in/lit.glsl.mjs";

export const vertex = `
${lit.shaderBase}

in vec3 position;
in vec3 normal;
in vec2 uv;

out vec3 vNormal;
out vec2 vUV;
out vec4 worldPosition;
out vec3 tint;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
};

in mat4 modelMatrix;

uniform float iTime;
uniform sampler2D noiseTexture;
uniform vec3 tipColor;
uniform vec3 dryColor;

void main() {
  vNormal = normal;
  vUV = uv;
  
  worldPosition = modelMatrix * vec4(position, 1.0);
  vec3 offset = vec3(pow(uv.y, 2.) * 0.7 * (texture(noiseTexture, worldPosition.xz * 0.05 + iTime * 0.05).r - 0.5), 0, 0);

  tint = mix(tipColor, dryColor, texture(noiseTexture, worldPosition.xz * 0.03).r);

  gl_Position = projectionMatrix * viewMatrix * (worldPosition + vec4(offset, 0));
}
`;

export const fragment = `
${lit.shaderBase}

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec2 motionVector;

in vec4 worldPosition;
in vec2 vUV;
in vec3 tint;

uniform vec3 baseColor;

void main() {
  motionVector = vec2(0.5);

  vec3 color = mix(baseColor, tint, vUV.y);

  fragColor = vec4(color, 1);
}
`;