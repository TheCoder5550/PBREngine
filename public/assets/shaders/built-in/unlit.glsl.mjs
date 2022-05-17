/*

  Shader bases

*/

import * as lit from "./lit.glsl.mjs";

/*

  Webgl 2

*/

var webgl2Vertex = lit.webgl2.lit.vertex;
var webgl2Fragment = `
${lit.shaderBase}

layout (location = 0) out vec4 fragColor;

uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform vec4 albedo;

float alphaCutoff = 0.5;

in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;

void main() {
  vec4 currentAlbedo = useTexture ? texture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo.xyz *= vec3(1) - vColor.xyz;

  if (currentAlbedo.a < alphaCutoff) {
    discard;
  }

  fragColor = currentAlbedo;
}
`;

var webgl2VertexInstanced = `
${lit.shaderBase}

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec4 color;
in vec2 uv;
in mat4 modelMatrix;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out vec3 vNormal;
out vec3 vTangent;
out vec4 vColor;
out vec2 vUV;

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

var webgl2FragmentInstanced = `
${lit.shaderBase}

layout (location = 0) out vec4 fragColor;

uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform vec4 albedo;

float alphaCutoff = 0.5;

in vec3 vNormal;
in vec3 vTangent;
in vec4 vColor;
in vec2 vUV;

void main() {
  vec4 currentAlbedo = useTexture ? texture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo.xyz *= vec3(1) - vColor.xyz;

  if (currentAlbedo.a < alphaCutoff) {
    discard;
  }

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