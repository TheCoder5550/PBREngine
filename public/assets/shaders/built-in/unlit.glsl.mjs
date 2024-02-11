/*

  Shader bases

*/

import { fragmentLogDepth, fragmentLogDepthMain, sharedUniforms, vertexLogDepth, vertexLogDepthMain } from "./base.mjs";
import * as lit from "./lit.glsl.mjs";

/*

  Webgl 2

*/

var webgl2Vertex = lit.webgl2.lit.vertex;
var webgl2Fragment = `
${lit.shaderBase}

${sharedUniforms}

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec2 motionVector;

uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform vec4 albedo;

uniform float alphaCutoff; // uniform alphaCutoff = 0.5;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;

const int levels = 2;
uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

${lit.fogBase}

${fragmentLogDepth}

void main() {
  ${fragmentLogDepthMain}
  motionVector = vec2(0.5);

  vec4 currentAlbedo = useTexture ? texture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo.xyz *= vec3(1) - vColor.xyz;

  if (currentAlbedo.a < alphaCutoff) {
    discard;
  }

  #ifdef USEFOG
    currentAlbedo = applyFog(currentAlbedo);
  #endif

  fragColor = currentAlbedo;
}
`;

var webgl2VertexInstanced = `
${lit.shaderBase}

${sharedUniforms}

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec4 color;
in vec2 uv;
in mat4 modelMatrix;
in float ditherAmount;

// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;

const int levels = 2;
uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec4 vColor;
out vec2 vUV;
out float vDitherAmount;

${vertexLogDepth}

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = 1. - color;
  vDitherAmount = ditherAmount;
  vPosition = vec3(modelMatrix * vec4(position, 1.0));
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  ${vertexLogDepthMain}
}
`;

var webgl2FragmentInstanced = `
${lit.shaderBase}

${sharedUniforms}

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec2 motionVector;

uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform vec4 albedo;

uniform float alphaCutoff; // uniform alphaCutoff = 0.5;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec4 vColor;
in vec2 vUV;

in float vDitherAmount;
uniform sampler2D ditherTexture;

const int levels = 2;
uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

${lit.fogBase}

${fragmentLogDepth}

void main() {
  ${fragmentLogDepthMain}
  motionVector = vec2(0.5);

  // Dither
  float dither = texture(ditherTexture, gl_FragCoord.xy / 8.).r;
  float d = 1. - vDitherAmount;
  if (d + (d < 0. ? dither : -dither) < 0.) {
    discard;
  }
  
  vec4 currentAlbedo = useTexture ? texture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo.xyz *= vec3(1) - vColor.xyz;

  if (currentAlbedo.a < alphaCutoff) {
    discard;
  }

  #ifdef USEFOG
    currentAlbedo = applyFog(currentAlbedo);
  #endif

  fragColor = currentAlbedo;
}
`;

/*

  Webgl 1

*/

var webglVertex = `
`;

var webglFragment = `
`;

/*

  Export

*/

webgl2Vertex = webgl2Vertex.trim();
webgl2Fragment = webgl2Fragment.trim();

webgl2VertexInstanced = webgl2VertexInstanced.trim();
webgl2FragmentInstanced = webgl2FragmentInstanced.trim();

webglVertex = webglVertex.trim();
webglFragment = webglFragment.trim();

var webgl1 = {
  vertex: webglVertex,
  fragment: webglFragment
};
var webgl2 = {
  unlit: {
    vertex: webgl2Vertex,
    fragment: webgl2Fragment
  },
  unlitInstanced: {
    vertex: webgl2VertexInstanced,
    fragment: webgl2FragmentInstanced
  },
};

export {
  webgl1,
  webgl2
};