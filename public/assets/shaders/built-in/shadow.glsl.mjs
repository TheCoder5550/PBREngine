import { trimStrings } from "./lit.glsl.mjs";

var output = {
  webgl2: {
    shadow: {
      vertex: `
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

        varying vec2 vUV;

        uniform sampler2D albedoTexture;
        uniform bool useTexture;
        uniform float alphaCutoff;

        void main() {
          if (useTexture && texture2D(albedoTexture, vUV).a < alphaCutoff) {
            discard;
          }

          gl_FragColor = vec4(1, 0, 0, 1);
        }
      `
    }
  }
};

output.webgl1 = {
  shadow: {
    vertex: output.webgl2.shadow.vertex,
    fragment: output.webgl2.shadow.fragment
  }
};

trimStrings(output);

var webgl1 = output.webgl1;
var webgl2 = output.webgl2;

export {
  webgl1,
  webgl2
};