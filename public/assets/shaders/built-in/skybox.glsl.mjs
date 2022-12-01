import { trimStrings } from "./lit.glsl.mjs";

var output = {
  webgl1: {
    skybox: {
      vertex: `
        attribute vec4 position;

        varying vec4 vPosition;
        
        void main() {
          vPosition = position;
        
          gl_Position = position;
          gl_Position.z = 1.;
        }
      `,
      fragment: `
        precision mediump float;

        varying vec4 vPosition;
        
        uniform samplerCube skybox;
        uniform mat4 viewDirectionProjectionInverse;

        // #define USEFOG
        const vec4 fogColor = vec4(0.23, 0.24, 0.26, 1);
        
        void main() {
          vec4 t = viewDirectionProjectionInverse * vPosition;
          vec3 col = textureCube(skybox, normalize(t.xyz / t.w)).rgb;
        
          #ifdef USEFOG
            fragColor = fogColor;
          #else
            fragColor = vec4(col, 1);
          #endif
        }
      `
    }
  },

  webgl2: {
    skybox: {
      vertex: `
        #version 300 es
        in vec4 position;
        
        out vec4 vPosition;
        
        void main() {
          vPosition = position;
        
          gl_Position = position;
          gl_Position.z = 1.;
        }
      `,
      fragment: `
        #version 300 es
        precision mediump float;
        
        layout (location = 0) out vec4 fragColor;
        
        in vec4 vPosition;
        
        uniform float environmentIntensity;
        uniform samplerCube skybox;
        uniform mat4 viewDirectionProjectionInverse;

        // #define USEFOG
        const vec4 fogColor = vec4(0.23, 0.24, 0.26, 1);
        
        void main() {
          vec4 t = viewDirectionProjectionInverse * vPosition;
          vec3 col = texture(skybox, normalize(t.xyz / t.w)).rgb * environmentIntensity;
        
          #ifdef USEFOG
            fragColor = fogColor;
          #else
            fragColor = vec4(col, 1);
          #endif
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