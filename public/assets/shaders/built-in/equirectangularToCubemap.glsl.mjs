import { trimStrings } from "./lit.glsl.mjs";

var output = {
  webgl1: {
    equirectangularToCubemap: {
      vertex: `
        attribute vec3 position;

        varying vec3 localPos;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;

        void main() {
            localPos = position;
            gl_Position = projectionMatrix * viewMatrix * vec4(localPos, 1.0);
        }
      `,
      fragment: `
        precision highp float;

        varying vec3 localPos;

        uniform sampler2D equirectangularMap;

        const vec2 invAtan = vec2(0.1591, 0.3183);
        vec2 SampleSphericalMap(vec3 v) {
            vec2 uv = vec2(atan(v.z, v.x), asin(v.y));
            uv *= invAtan;
            uv += 0.5;
            return uv;
        }

        void main() {
            vec2 uv = SampleSphericalMap(normalize(localPos)); // make sure to normalize localPos
            vec3 color = texture2D(equirectangularMap, uv).rgb;
            
            gl_FragColor = vec4(color, 1.0);
        }
      `
    }
  },

  webgl2: {
    equirectangularToCubemap: {
      vertex: `
        #version 300 es
        layout (location = 0) in vec3 position;

        out vec3 localPos;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;

        void main()
        {
            localPos = position;
            gl_Position = projectionMatrix * viewMatrix * vec4(localPos, 1.0);
        }
      `,
      fragment: `
        #version 300 es
        precision highp float;

        out vec4 FragColor;
        in vec3 localPos;

        uniform sampler2D equirectangularMap;

        const vec2 invAtan = vec2(0.1591, 0.3183);
        vec2 SampleSphericalMap(vec3 v)
        {
            vec2 uv = vec2(atan(v.z, v.x), asin(v.y));
            uv *= invAtan;
            uv += 0.5;
            return uv;
        }

        void main()
        {
            vec2 uv = SampleSphericalMap(normalize(localPos)); // make sure to normalize localPos
            vec3 color = texture(equirectangularMap, uv).rgb;
            
            FragColor = vec4(color, 1.0);
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