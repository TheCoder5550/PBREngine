import { shaderBase, sharedUniforms } from "./base.mjs";

const output = {
  webgl1: {
    shadow: {
      vertex: `
        ${sharedUniforms}

        attribute vec3 position;
        attribute vec2 uv;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 modelMatrix;

        varying vec2 vUV;

        void main() {
          vUV = uv;
          
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        precision highp float;

        ${sharedUniforms}

        varying vec2 vUV;

        uniform sampler2D albedoTexture;
        uniform bool useTexture;
        uniform float alphaCutoff;

        uniform float ditherAmount;
        uniform sampler2D ditherTexture;

        void main() {
          // Dither
          float dither = texture2D(ditherTexture, gl_FragCoord.xy / 8.).r;
          float d = 1. - ditherAmount;
          if (d + (d < 0. ? dither : -dither) < 0.) {
            discard;
          }

          if (useTexture && texture2D(albedoTexture, vUV).a < alphaCutoff) {
            discard;
          }

          gl_FragColor = vec4(1, 0, 0, 1);
        }
      `
    },
    shadowInstanced: {
      vertex: `
        ${sharedUniforms}

        attribute vec3 position;
        attribute vec2 uv;
        attribute mat4 modelMatrix;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;

        varying vec2 vUV;

        attribute float ditherAmount;
        varying float vDitherAmount;

        void main() {
          vUV = uv;
          vDitherAmount = ditherAmount;
          
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        precision highp float;

        ${sharedUniforms}

        varying vec2 vUV;

        uniform sampler2D albedoTexture;
        uniform bool useTexture;
        uniform float alphaCutoff;

        varying float vDitherAmount;
        uniform sampler2D ditherTexture;

        void main() {
          // Dither
          float dither = texture2D(ditherTexture, gl_FragCoord.xy / 8.).r;
          float d = 1. - vDitherAmount;
          if (d + (d < 0. ? dither : -dither) < 0.) {
            discard;
          }

          if (useTexture && texture2D(albedoTexture, vUV).a < alphaCutoff) {
            discard;
          }

          gl_FragColor = vec4(1, 0, 0, 1);
        }
      `
    },
    shadowSkinned: {
      vertex: `
        ${sharedUniforms}

        attribute vec3 position;
        attribute vec2 uv;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 modelMatrix;

        varying vec2 vUV;

        //Skinning
        attribute vec4 weights;
        attribute vec4 joints;

        uniform sampler2D u_jointTexture;
        uniform float u_numJoints;

        // these offsets assume the texture is 4 pixels across
        #define ROW0_U ((0.5 + 0.0) / 4.)
        #define ROW1_U ((0.5 + 1.0) / 4.)
        #define ROW2_U ((0.5 + 2.0) / 4.)
        #define ROW3_U ((0.5 + 3.0) / 4.)
        
        mat4 getBoneMatrix(float jointNdx) {
          float v = (jointNdx + 0.5) / u_numJoints;
          return mat4(
            texture2D(u_jointTexture, vec2(ROW0_U, v)),
            texture2D(u_jointTexture, vec2(ROW1_U, v)),
            texture2D(u_jointTexture, vec2(ROW2_U, v)),
            texture2D(u_jointTexture, vec2(ROW3_U, v))
          );
        }

        void main() {
          vUV = uv;

          mat4 skinMatrix = getBoneMatrix(joints[0]) * weights[0] +
                            getBoneMatrix(joints[1]) * weights[1] +
                            getBoneMatrix(joints[2]) * weights[2] +
                            getBoneMatrix(joints[3]) * weights[3];
          
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * skinMatrix * vec4(position, 1.0);
        }
      `,
      fragment: null
    }
  },
  webgl2: {
    shadow: {
      vertex: `
        ${shaderBase}
        ${sharedUniforms}

        in vec3 position;
        in vec2 uv;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 modelMatrix;

        out vec2 vUV;

        void main() {
          vUV = uv;
          
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        ${shaderBase}
        ${sharedUniforms}

        out vec4 fragColor;

        in vec2 vUV;

        uniform sampler2D albedoTexture;
        uniform bool useTexture;
        uniform float alphaCutoff;

        uniform float ditherAmount;
        uniform sampler2D ditherTexture;

        void main() {
          // Dither
          float dither = texture(ditherTexture, gl_FragCoord.xy / 8.).r;
          float d = 1. - ditherAmount;
          if (d + (d < 0. ? dither : -dither) < 0.) {
            discard;
          }

          if (useTexture && texture(albedoTexture, vUV).a < alphaCutoff) {
            discard;
          }

          fragColor = vec4(1, 0, 0, 1);
        }
      `
    },
    shadowInstanced: {
      vertex: `
        ${shaderBase}
        ${sharedUniforms}

        in vec3 position;
        in vec2 uv;
        in mat4 modelMatrix;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;

        out vec2 vUV;

        in float ditherAmount;
        out float vDitherAmount;

        void main() {
          vUV = uv;
          vDitherAmount = ditherAmount;
          
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        ${shaderBase}
        ${sharedUniforms}

        out vec4 fragColor;

        in vec2 vUV;

        uniform sampler2D albedoTexture;
        uniform bool useTexture;
        uniform float alphaCutoff;

        in float vDitherAmount;
        uniform sampler2D ditherTexture;

        void main() {
          // Dither
          float dither = texture(ditherTexture, gl_FragCoord.xy / 8.).r;
          float d = 1. - vDitherAmount;
          if (d + (d < 0. ? dither : -dither) < 0.) {
            discard;
          }

          if (useTexture && texture(albedoTexture, vUV).a < alphaCutoff) {
            discard;
          }

          fragColor = vec4(1, 0, 0, 1);
        }
      `
    },
    shadowSkinned: {
      vertex: `
        ${shaderBase}
        ${sharedUniforms}

        in vec3 position;
        in vec2 uv;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 modelMatrix;

        out vec2 vUV;

        //Skinning
        in vec4 weights;
        in vec4 joints;

        uniform sampler2D u_jointTexture;
        uniform float u_numJoints;

        // these offsets assume the texture is 4 pixels across
        #define ROW0_U ((0.5 + 0.0) / 4.)
        #define ROW1_U ((0.5 + 1.0) / 4.)
        #define ROW2_U ((0.5 + 2.0) / 4.)
        #define ROW3_U ((0.5 + 3.0) / 4.)
        
        mat4 getBoneMatrix(float jointNdx) {
          float v = (jointNdx + 0.5) / u_numJoints;
          return mat4(
            texture(u_jointTexture, vec2(ROW0_U, v)),
            texture(u_jointTexture, vec2(ROW1_U, v)),
            texture(u_jointTexture, vec2(ROW2_U, v)),
            texture(u_jointTexture, vec2(ROW3_U, v))
          );
        }

        void main() {
          vUV = uv;

          mat4 skinMatrix = getBoneMatrix(joints[0]) * weights[0] +
                            getBoneMatrix(joints[1]) * weights[1] +
                            getBoneMatrix(joints[2]) * weights[2] +
                            getBoneMatrix(joints[3]) * weights[3];
          
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * skinMatrix * vec4(position, 1.0);
        }
      `,
      fragment: null
    }
  }
};

// output.webgl2.shadowInstanced.fragment = output.webgl2.shadow.fragment;
output.webgl1.shadowSkinned.fragment = output.webgl1.shadow.fragment;
output.webgl2.shadowSkinned.fragment = output.webgl2.shadow.fragment;

// // WebGL 1
// output.webgl1.shadow.vertex = output.webgl2.shadow.vertex;
// output.webgl1.shadow.fragment = output.webgl2.shadow.fragment;

// output.webgl1.shadowInstanced.vertex = output.webgl2.shadowInstanced.vertex;
// output.webgl1.shadowInstanced.fragment = output.webgl2.shadowInstanced.fragment;

// output.webgl1.shadowSkinned.vertex = output.webgl2.shadowSkinned.vertex;
// output.webgl1.shadowSkinned.fragment = output.webgl2.shadowSkinned.fragment;

const webgl1 = output.webgl1;
const webgl2 = output.webgl2;

export {
  webgl1,
  webgl2
};