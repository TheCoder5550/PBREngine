import { trimStrings } from "./lit.glsl.mjs";

var output = {
  webgl1: {
    particle: {
      vertex: `
      `,
      fragment: `
      `
    }
  },

  webgl2: {
    particle: {
      vertex: `
        #version 300 es

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
      `,
      fragment: `
        #version 300 es
        precision highp float;

        layout (location = 0) out vec4 fragColor;

        uniform sampler2D albedoTexture;
        uniform bool useTexture;
        uniform vec4 albedo;

        in vec3 vNormal;
        in vec3 vTangent;
        in vec4 vColor;
        in vec2 vUV;

        void main() {
          vec4 currentAlbedo = useTexture ? texture(albedoTexture, vUV) : vec4(1);
          currentAlbedo *= albedo;
          currentAlbedo *= vColor;

          fragColor = currentAlbedo;
        }
      `
    }
  }
};

trimStrings(output);

var webgl1 = output.webgl1;
var webgl2 = output.webgl2;

export {
  webgl1,
  webgl2
};