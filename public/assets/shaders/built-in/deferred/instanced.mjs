import { shaderBase } from "../base.mjs";
import * as basic from "./basic.mjs";

var vertex = `
${shaderBase}

in vec3 position;
in vec3 normal;
in vec4 tangent;
in vec3 color;
in vec2 uv;
in mat4 modelMatrix;

out vec4 vPosition;
out vec3 vNormal;
out vec4 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat3 vTBN;
out mat4 vModelMatrix;

// const int levels = 2;

// uniform sharedPerScene {
//   mat4 projectionMatrix;
//   mat4 viewMatrix;
//   mat4 inverseViewMatrix;
//   float biases[levels];
// };

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

// //Shadows
// uniform mat4 textureMatrices[levels];
// out vec4 projectedTexcoords[levels];

void main() {
  vNormal = mat3(modelMatrix) * normal; // in world-space
  vTangent = tangent;
  vUV = uv;
  vColor = color;
  vModelMatrix = modelMatrix;

  vec3 _T = normalize(vec3(modelMatrix * vec4(vTangent.xyz, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent.xyz) * vTangent.w, 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * vec4(vNormal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  // for (int i = 0; i < levels; i++) {
  //   projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  // }

  vPosition = worldPosition;
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

var fragment = basic.fragment;
fragment = fragment.replace(/modelMatrix/g, "vModelMatrix");
fragment = fragment.replace(/uniform mat4 vModelMatrix/g, "in mat4 vModelMatrix");

vertex = vertex.trim();
fragment = fragment.trim();

export {
  vertex,
  fragment
};