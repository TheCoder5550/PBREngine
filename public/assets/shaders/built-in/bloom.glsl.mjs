import { trimStrings } from "./lit.glsl.mjs";

var output = {
  webgl1: {
    bloom: {
      vertex: `
        attribute vec2 position;

        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `,
      fragment: `
        precision highp float;

        uniform vec2 screenSize;
        uniform sampler2D mainTexture;
        uniform vec2 mainTextureSize;
        uniform sampler2D secondTexture;
        uniform int stage;

        #define EPSILON 1.0e-4

        uniform float _SampleScale;
        uniform float threshold;
        float knee = 0.5;
        float _Clamp = 10.;

        float Max3(float a, float b, float c)
        {
          return max(max(a, b), c);
        }

        vec4 QuadraticThreshold(vec4 color, float threshold, vec3 curve)
        {
            // Pixel brightness
            float br = Max3(color.r, color.g, color.b);

            // Under-threshold part: quadratic curve
            float rq = clamp(br - curve.x, 0.0, curve.y);
            rq = curve.z * rq * rq;

            // Combine and apply the brightness response curve.
            color *= max(rq, br - threshold) / max(br, EPSILON);

            return color;
        }

        vec4 DownsampleBox13Tap(sampler2D tex, vec2 uv, vec2 texelSize)
        {
            vec4 A = texture2D(tex, uv + texelSize * vec2(-1.0, -1.0));
            vec4 B = texture2D(tex, uv + texelSize * vec2( 0.0, -1.0));
            vec4 C = texture2D(tex, uv + texelSize * vec2( 1.0, -1.0));
            vec4 D = texture2D(tex, uv + texelSize * vec2(-0.5, -0.5));
            vec4 E = texture2D(tex, uv + texelSize * vec2( 0.5, -0.5));
            vec4 F = texture2D(tex, uv + texelSize * vec2(-1.0,  0.0));
            vec4 G = texture2D(tex, uv                               );
            vec4 H = texture2D(tex, uv + texelSize * vec2( 1.0,  0.0));
            vec4 I = texture2D(tex, uv + texelSize * vec2(-0.5,  0.5));
            vec4 J = texture2D(tex, uv + texelSize * vec2( 0.5,  0.5));
            vec4 K = texture2D(tex, uv + texelSize * vec2(-1.0,  1.0));
            vec4 L = texture2D(tex, uv + texelSize * vec2( 0.0,  1.0));
            vec4 M = texture2D(tex, uv + texelSize * vec2( 1.0,  1.0));

            vec2 div = (1.0 / 4.0) * vec2(0.5, 0.125);

            vec4 o = (D + E + I + J) * div.x;
            o += (A + B + G + F) * div.y;
            o += (B + C + H + G) * div.y;
            o += (F + G + L + K) * div.y;
            o += (G + H + M + L) * div.y;

            return o;
        }

        // Standard box filtering
        vec4 DownsampleBox4Tap(sampler2D tex, vec2 uv, vec2 texelSize)
        {
            vec4 d = texelSize.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);

            vec4 s;
            s =  (texture2D(tex, uv + d.xy));
            s += (texture2D(tex, uv + d.zy));
            s += (texture2D(tex, uv + d.xw));
            s += (texture2D(tex, uv + d.zw));

            return s * (1.0 / 4.0);
        }

        // 9-tap bilinear upsampler (tent filter)
        vec4 UpsampleTent(sampler2D tex, vec2 uv, vec2 texelSize, vec4 sampleScale)
        {
            vec4 d = texelSize.xyxy * vec4(1.0, 1.0, -1.0, 0.0) * sampleScale;

            vec4 s;
            s =  texture2D(tex, uv - d.xy);
            s += texture2D(tex, uv - d.wy) * 2.0;
            s += texture2D(tex, uv - d.zy);

            s += texture2D(tex, uv + d.zw) * 2.0;
            s += texture2D(tex, uv       ) * 4.0;
            s += texture2D(tex, uv + d.xw) * 2.0;

            s += texture2D(tex, uv + d.zy);
            s += texture2D(tex, uv + d.wy) * 2.0;
            s += texture2D(tex, uv + d.xy);

            return s * (1.0 / 16.0);
        }

        // Standard box filtering
        vec4 UpsampleBox(sampler2D tex, vec2 uv, vec2 texelSize, vec4 sampleScale)
        {
            vec4 d = texelSize.xyxy * vec4(-1.0, -1.0, 1.0, 1.0) * (sampleScale * 0.5);

            vec4 s;
            s =  (texture2D(tex, uv + d.xy));
            s += (texture2D(tex, uv + d.zy));
            s += (texture2D(tex, uv + d.xw));
            s += (texture2D(tex, uv + d.zw));

            return s * (1.0 / 4.0);
        }

        vec4 SafeHDR(vec4 color) {
          return color;
        }

        vec2 getTexelSize(sampler2D tex) {
          return vec2(1.) / mainTextureSize;
        }

        // ----------------------------------------------------------------------------------------
        // Prefilter

        vec4 Prefilter(vec4 color, vec2 uv)
        {
            vec4 _Threshold = vec4(threshold, threshold - knee, knee * 2., 0.25 / knee); // x: threshold value (linear), y: threshold - knee, z: knee * 2, w: 0.25 / knee

            color = min(vec4(_Clamp), color); // clamp to max
            color = QuadraticThreshold(color, _Threshold.x, _Threshold.yzw);
            return color;
        }

        vec4 FragPrefilter13(vec2 uv)
        {
            vec4 color = DownsampleBox13Tap(mainTexture, uv, getTexelSize(mainTexture));
            return Prefilter(SafeHDR(color), uv);
        }

        vec4 FragPrefilter4(vec2 uv)
        {
            vec4 color = DownsampleBox4Tap(mainTexture, uv, getTexelSize(mainTexture));
            return Prefilter(SafeHDR(color), uv);
        }

        // ----------------------------------------------------------------------------------------
        // Downsample

        vec4 FragDownsample13(vec2 uv)
        {
            vec4 color = DownsampleBox13Tap(mainTexture, uv, getTexelSize(mainTexture));
            return color;
        }

        vec4 FragDownsample4(vec2 uv)
        {
            vec4 color = DownsampleBox4Tap(mainTexture, uv, getTexelSize(mainTexture));
            return color;
        }

        // ----------------------------------------------------------------------------------------
        // Upsample & combine

        vec4 Combine(vec4 bloom, vec2 uv)
        {
            vec4 color = texture2D(secondTexture, uv);
            return bloom + color;
        }

        vec4 FragUpsampleTent(vec2 uv)
        {
            vec4 bloom = UpsampleTent(mainTexture, uv, getTexelSize(mainTexture), vec4(_SampleScale));
            return Combine(bloom, uv);
        }

        vec4 FragUpsampleBox(vec2 uv)
        {
            vec4 bloom = UpsampleBox(mainTexture, uv, getTexelSize(mainTexture), vec4(_SampleScale));
            return Combine(bloom, uv);
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / screenSize;
          vec3 col = texture2D(mainTexture, uv).rgb;
          vec4 outCol = vec4(1, 0, 1, 1);

          if (stage == 6) {
            gl_FragColor = vec4(col, 1);
            return;
          }

          if (stage == 0) {
            outCol = FragPrefilter13(uv);
          }
          else if (stage == 1) {
            outCol = FragDownsample13(uv);
          }
          else if (stage == 2) {
            outCol = FragUpsampleTent(uv);
          }

          gl_FragColor = vec4(outCol.xyz, 1);
        }
      `
    }
  },

  webgl2: {
    bloom: {
      vertex: `
        #version 300 es

        in vec2 position;

        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `,
      fragment: `
        #version 300 es
        precision highp float;

        layout (location = 0) out vec4 fragColor;

        uniform vec2 screenSize;
        uniform sampler2D mainTexture;
        uniform sampler2D secondTexture;
        uniform int stage;

        #define EPSILON 1.0e-4

        uniform float _SampleScale;
        uniform float threshold;
        float knee = 0.5;
        float _Clamp = 10.;

        float Max3(float a, float b, float c)
        {
          return max(max(a, b), c);
        }

        vec4 QuadraticThreshold(vec4 color, float threshold, vec3 curve)
        {
            // Pixel brightness
            float br = Max3(color.r, color.g, color.b);

            // Under-threshold part: quadratic curve
            float rq = clamp(br - curve.x, 0.0, curve.y);
            rq = curve.z * rq * rq;

            // Combine and apply the brightness response curve.
            color *= max(rq, br - threshold) / max(br, EPSILON);

            return color;
        }

        vec4 DownsampleBox13Tap(sampler2D tex, vec2 uv, vec2 texelSize)
        {
            vec4 A = texture(tex, uv + texelSize * vec2(-1.0, -1.0));
            vec4 B = texture(tex, uv + texelSize * vec2( 0.0, -1.0));
            vec4 C = texture(tex, uv + texelSize * vec2( 1.0, -1.0));
            vec4 D = texture(tex, uv + texelSize * vec2(-0.5, -0.5));
            vec4 E = texture(tex, uv + texelSize * vec2( 0.5, -0.5));
            vec4 F = texture(tex, uv + texelSize * vec2(-1.0,  0.0));
            vec4 G = texture(tex, uv                               );
            vec4 H = texture(tex, uv + texelSize * vec2( 1.0,  0.0));
            vec4 I = texture(tex, uv + texelSize * vec2(-0.5,  0.5));
            vec4 J = texture(tex, uv + texelSize * vec2( 0.5,  0.5));
            vec4 K = texture(tex, uv + texelSize * vec2(-1.0,  1.0));
            vec4 L = texture(tex, uv + texelSize * vec2( 0.0,  1.0));
            vec4 M = texture(tex, uv + texelSize * vec2( 1.0,  1.0));

            vec2 div = (1.0 / 4.0) * vec2(0.5, 0.125);

            vec4 o = (D + E + I + J) * div.x;
            o += (A + B + G + F) * div.y;
            o += (B + C + H + G) * div.y;
            o += (F + G + L + K) * div.y;
            o += (G + H + M + L) * div.y;

            return o;
        }

        // Standard box filtering
        vec4 DownsampleBox4Tap(sampler2D tex, vec2 uv, vec2 texelSize)
        {
            vec4 d = texelSize.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);

            vec4 s;
            s =  (texture(tex, uv + d.xy));
            s += (texture(tex, uv + d.zy));
            s += (texture(tex, uv + d.xw));
            s += (texture(tex, uv + d.zw));

            return s * (1.0 / 4.0);
        }

        // 9-tap bilinear upsampler (tent filter)
        vec4 UpsampleTent(sampler2D tex, vec2 uv, vec2 texelSize, vec4 sampleScale)
        {
            vec4 d = texelSize.xyxy * vec4(1.0, 1.0, -1.0, 0.0) * sampleScale;

            vec4 s;
            s =  texture(tex, uv - d.xy);
            s += texture(tex, uv - d.wy) * 2.0;
            s += texture(tex, uv - d.zy);

            s += texture(tex, uv + d.zw) * 2.0;
            s += texture(tex, uv       ) * 4.0;
            s += texture(tex, uv + d.xw) * 2.0;

            s += texture(tex, uv + d.zy);
            s += texture(tex, uv + d.wy) * 2.0;
            s += texture(tex, uv + d.xy);

            return s * (1.0 / 16.0);
        }

        // Standard box filtering
        vec4 UpsampleBox(sampler2D tex, vec2 uv, vec2 texelSize, vec4 sampleScale)
        {
            vec4 d = texelSize.xyxy * vec4(-1.0, -1.0, 1.0, 1.0) * (sampleScale * 0.5);

            vec4 s;
            s =  (texture(tex, uv + d.xy));
            s += (texture(tex, uv + d.zy));
            s += (texture(tex, uv + d.xw));
            s += (texture(tex, uv + d.zw));

            return s * (1.0 / 4.0);
        }

        vec4 SafeHDR(vec4 color) {
          return color;
        }

        vec2 getTexelSize(sampler2D tex) {
          return vec2(1.) / vec2(textureSize(tex, 0));
        }

        // ----------------------------------------------------------------------------------------
        // Prefilter

        vec4 Prefilter(vec4 color, vec2 uv)
        {
            vec4 _Threshold = vec4(threshold, threshold - knee, knee * 2., 0.25 / knee); // x: threshold value (linear), y: threshold - knee, z: knee * 2, w: 0.25 / knee

            color = min(vec4(_Clamp), color); // clamp to max
            color = QuadraticThreshold(color, _Threshold.x, _Threshold.yzw);
            return color;
        }

        vec4 FragPrefilter13(vec2 uv)
        {
            vec4 color = DownsampleBox13Tap(mainTexture, uv, getTexelSize(mainTexture));
            return Prefilter(SafeHDR(color), uv);
        }

        vec4 FragPrefilter4(vec2 uv)
        {
            vec4 color = DownsampleBox4Tap(mainTexture, uv, getTexelSize(mainTexture));
            return Prefilter(SafeHDR(color), uv);
        }

        // ----------------------------------------------------------------------------------------
        // Downsample

        vec4 FragDownsample13(vec2 uv)
        {
            vec4 color = DownsampleBox13Tap(mainTexture, uv, getTexelSize(mainTexture));
            return color;
        }

        vec4 FragDownsample4(vec2 uv)
        {
            vec4 color = DownsampleBox4Tap(mainTexture, uv, getTexelSize(mainTexture));
            return color;
        }

        // ----------------------------------------------------------------------------------------
        // Upsample & combine

        vec4 Combine(vec4 bloom, vec2 uv)
        {
            vec4 color = texture(secondTexture, uv);
            return bloom + color;
        }

        vec4 FragUpsampleTent(vec2 uv)
        {
            vec4 bloom = UpsampleTent(mainTexture, uv, getTexelSize(mainTexture), vec4(_SampleScale));
            return Combine(bloom, uv);
        }

        vec4 FragUpsampleBox(vec2 uv)
        {
            vec4 bloom = UpsampleBox(mainTexture, uv, getTexelSize(mainTexture), vec4(_SampleScale));
            return Combine(bloom, uv);
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / screenSize;
          vec3 col = texture(mainTexture, uv).rgb;
          vec4 outCol = vec4(1, 0, 1, 1);

          if (stage == 6) {
            fragColor = vec4(col, 1);
            return;
          }

          // if (stage == 0) {
          //   outCol = vec3(col.r, 0, 0);
          // }
          // else if (stage == 1) {
          //   outCol = vec3(0, col.g, 0);
          // }
          // else if (stage == 2) {
          //   outCol = vec3(0, 0, col.b);
          // }
          // else if (stage == 3) {
          //   outCol = vec3(0, 0, 0);
          // }

          if (stage == 0) {
            outCol = FragPrefilter13(uv);
          }
          // else if (stage == 1) {
          //   outCol = FragPrefilter4(uv);
          // }
          else if (stage == 1) {
            outCol = FragDownsample13(uv);
          }
          // else if (stage == 3) {
          //   outCol = FragDownsample4(uv);
          // }

          else if (stage == 2) {
            outCol = FragUpsampleTent(uv);
          }
          // else if (stage == 5) {
          //   outCol = FragUpsampleBox(uv);
          // }

          fragColor = vec4(outCol.xyz, 1);
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