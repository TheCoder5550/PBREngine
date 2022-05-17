import { trimStrings } from "./lit.glsl.mjs";

var output = {
  webgl2: {
    postprocessing: {
      vertex: `
        attribute vec2 position;

        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `,
      fragment: `
        precision highp float;

        // uniform float iTime;
        uniform vec2 SIZE;
        uniform sampler2D mainTexture;
        uniform sampler2D bloomTexture;
        uniform sampler2D depthTexture;
        
        uniform float bloomIntensity;
        uniform float exposure;
        uniform float gamma;
        uniform int tonemapping;
        
        uniform bool enableGodrays;
        
        vec3 godrays(float density, float weight, float decay, float exposure, vec2 screenSpaceLightPos, vec2 uv);
        vec3 ACESFilm(vec3 x);
        float saturate(float x);
        float getHeight(vec2 uv);
        vec3 adjustSaturation(vec3 color, float value);
        
        void main() {
          vec2 uv = gl_FragCoord.xy / SIZE;
        
          // float stepSize = 0.02;
          // float size = 2.; //?
          // float s01 = getHeight(uv + vec2(-stepSize, 0));
          // float s21 = getHeight(uv + vec2(stepSize, 0));
          // float s10 = getHeight(uv + vec2(0, -stepSize));
          // float s12 = getHeight(uv + vec2(0, stepSize));
          // vec3 va = normalize(vec3(size, 0, s21 - s01));
          // vec3 vb = normalize(vec3(0, size, s12 - s10));
          // vec3 normal = cross(va, vb);
        
          // // gl_FragColor = vec4(normal, 1);
          // // return;
        
          // float screenDistance = 0.1;
          // vec2 uvOffset = normal.xy * screenDistance;
          // uv += uvOffset;
        
          vec3 col = vec3(0);
        
          // Scene
          vec4 samp = texture2D(mainTexture, uv);
          col += samp.rgb;
        
          // Bloom
          vec4 bloom = texture2D(bloomTexture, uv);
          col += bloom.rgb * bloomIntensity;
        
          // Godrays
          if (enableGodrays) {
            col += godrays(1., 0.01, 0.97, 0.6, vec2(0.5, 0.5), uv);
          }
        
          // Exposure correction
          col = col * pow(2., exposure);
        
          // Tonemapping
          if (tonemapping == 1) {
            col = ACESFilm(col);
          }
          else if (tonemapping == 2) {
            col = col / (col + vec3(1.0));
          }
        
          // Gamma correction
          col = pow(col, vec3(1. / gamma));
        
          // Saturation
          // col = adjustSaturation(col, 0.3);
        
          gl_FragColor = vec4(col, samp.a);
          return;
        }
        
        vec3 ACESFilm(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return clamp((x*(a*x+b))/(x*(c*x+d)+e), vec3(0.), vec3(1.));
        }
        
        vec3 godrays(float density, float weight, float decay, float exposure, vec2 screenSpaceLightPos, vec2 uv) {
          vec3 fragColor = vec3(0);
        
          vec2 deltaTextCoord = vec2(uv - screenSpaceLightPos.xy);
          vec2 textCoo = uv.xy;
          deltaTextCoord *= (1.0 /  float(100)) * density;
          float illuminationDecay = 1.0;
        
          for (int i = 0; i < 100; i++){
            textCoo -= deltaTextCoord;
            vec3 samp = clamp(texture2D(depthTexture, textCoo).xyz, vec3(0.3), vec3(10)) - vec3(0.3);
            samp *= illuminationDecay * weight;
            fragColor += samp;
            illuminationDecay *= decay;
          }
        
          fragColor *= exposure;

          return fragColor;
        }
        
        float saturate(float x) {
          return max(0., min(1., x));
        }
        
        float getHeight(vec2 uv) {
          float y = 0.5 + 0.2 * sin(uv.x * 12.);
          float d = abs(uv.y - y);
          float falloff = 40.;
          float thickness = 0.;
          float height = 1. - clamp(d * falloff - thickness, 0., 1.);
          return height;
        }
        
        vec3 adjustSaturation(vec3 color, float value) {
          // https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
          const vec3 luminosityFactor = vec3(0.2126, 0.7152, 0.0722);
          vec3 grayscale = vec3(dot(color, luminosityFactor));
        
          return mix(grayscale, color, 1.0 + value);
        }
      `
    }
  }
};

output.webgl1 = {
  postprocessing: {
    vertex: output.webgl2.postprocessing.vertex,
    fragment: output.webgl2.postprocessing.fragment
  }
};

trimStrings(output);

var webgl1 = output.webgl1;
var webgl2 = output.webgl2;

export {
  webgl1,
  webgl2
};