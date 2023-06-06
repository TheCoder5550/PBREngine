let vertex = `
#version 300 es

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;
uniform mat4 modelMatrix;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat4 vModelMatrix;
out mat3 vTBN;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  // float biases[levels];
};

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;
  vModelMatrix = modelMatrix;

  vec3 center = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
  vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec4 worldPosition = vec4(center + (cameraRight * position.x + cameraUp * position.y) * 0.5, 1);

  vPosition = vec3(worldPosition); 
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

let fragment = `
#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec2 motionVector;

uniform sampler2D albedoTexture;

in vec2 vUV;

void main() {
  fragColor = texture(albedoTexture, vUV);
  motionVector = vec2(0.5);
}
`;

vertex = vertex.trim();
fragment = fragment.trim();

let webgl2 = {
  billboard: {
    vertex,
    fragment
  }
};

export {
  webgl2
};