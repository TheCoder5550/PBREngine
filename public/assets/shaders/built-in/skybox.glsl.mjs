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
            gl_FragColor = fogColor;
          #else
            gl_FragColor = vec4(col, 1);
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

        uniform vec4 fogColor;
        uniform float fogIntensity;

        uniform float _SkyboxSpeed;
        uniform vec3 _SkyboxDirection;
        uniform float iTime;

        vec4 flowUVW(vec3 dir, vec3 curl, float t, bool flowB) {
          float phaseOffset = flowB ? 0.5f : 0.0f;
          float progress = t + phaseOffset - floor(t + phaseOffset);
          vec3 offset = curl * progress;

          vec4 uvw = vec4(dir, 0.0f);
          uvw.xz -= offset.xy;
          uvw.w = 1. - abs(1.0f - 2.0f * progress);

          return uvw;
        }
        
        void main() {
          motionVector = vec2(0.5);

          vec4 proj = viewDirectionProjectionInverse * vPosition;
          vec3 viewDir = normalize(proj.xyz / proj.w);

          // vec3 col = texture(skybox, viewDir).rgb * environmentIntensity;

          vec3 curl = normalize(_SkyboxDirection);
          float t = iTime * _SkyboxSpeed;
          vec4 uvw1 = flowUVW(viewDir, curl, t, false);
          vec4 uvw2 = flowUVW(viewDir, curl, t, true);

          vec3 sky = texture(skybox, uvw1.xyz).rgb * uvw1.w;
          vec3 sky2 = texture(skybox, uvw2.xyz).rgb * uvw2.w;
          vec3 col = (sky + sky2) * environmentIntensity;

          // Fog
          col = mix(col, fogColor.rgb, fogIntensity * clamp(1. - viewDir.y * 10., 0., 1.));

          fragColor = vec4(col, 1);
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