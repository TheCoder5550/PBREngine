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
<<<<<<< HEAD
            gl_FragColor = fogColor;
          #else
            gl_FragColor = vec4(col, 1);
=======
            fragColor = fogColor;
          #else
            fragColor = vec4(col, 1);
>>>>>>> e92af2fb97450cc0620a24e05f9c5061080434f7
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
        layout (location = 1) out vec2 motionVector;
        
        in vec4 vPosition;
        
        uniform float environmentIntensity;
        uniform samplerCube skybox;
        uniform mat4 viewDirectionProjectionInverse;

        // #define USEFOG
        const vec4 fogColor = vec4(0.23, 0.24, 0.26, 1);
        
        void main() {
          motionVector = vec2(0.5);

          vec4 t = viewDirectionProjectionInverse * vPosition;
          vec3 lookDir = normalize(t.xyz / t.w);
          vec3 col = texture(skybox, lookDir).rgb * environmentIntensity;
        
          #ifdef USEFOG
<<<<<<< HEAD
            col = mix(fogColor.rgb, col, clamp(lookDir.y * 10., 0., 1.));
          #endif
          
          fragColor = vec4(col, 1);
=======
            fragColor = fogColor;
          #else
            fragColor = vec4(col, 1);
          #endif
>>>>>>> e92af2fb97450cc0620a24e05f9c5061080434f7
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