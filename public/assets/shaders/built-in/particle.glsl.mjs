var output = {
  webgl1: {
    particle: {
      vertex: `
        attribute vec3 position;
        attribute vec3 normal;
        attribute vec3 tangent;
        attribute vec4 color;
        attribute vec2 uv;
        attribute mat4 modelMatrix;

        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;

        varying vec3 vNormal;
        varying vec3 vTangent;
        varying vec4 vColor;
        varying vec2 vUV;

        void main() {
          vNormal = normal;
          vTangent = tangent;
          vUV = uv;
          vColor = color;
          
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        precision highp float;

        uniform sampler2D albedoTexture;
        uniform bool useTexture;
        uniform vec4 albedo;

        varying vec3 vNormal;
        varying vec3 vTangent;
        varying vec4 vColor;
        varying vec2 vUV;

        void main() {
          vec4 currentAlbedo = useTexture ? texture2D(albedoTexture, vUV) : vec4(1);
          currentAlbedo *= albedo;
          currentAlbedo *= vColor;

          gl_FragColor = currentAlbedo;
        }
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
        layout (location = 1) out vec2 motionVector;

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
          motionVector = vec2(0.5);
        }
      `
    }
  }
};

var webgl1 = output.webgl1;
var webgl2 = output.webgl2;

export {
  webgl1,
  webgl2
};