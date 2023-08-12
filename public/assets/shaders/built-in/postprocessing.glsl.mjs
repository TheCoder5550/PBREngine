import { trimStrings } from "./lit.glsl.mjs";

var output = {
  webgl2: {
    postprocessing: {
      vertex: `
        #version 300 es

        in vec2 position;

        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `,
      fragment: `
        precision highp float;

        // #define DEBUG_COLOR
        
        out vec4 fragColor;

        // uniform float iTime;
        uniform vec2 SIZE;
        uniform sampler2D mainTexture;
        uniform sampler2D bloomTexture;
        uniform sampler2D depthTexture;
        uniform sampler2D motionBlurTexture;
        uniform sampler2D downscaledTexture;
        
        uniform float bloomIntensity;
        uniform float exposure;
        uniform float gamma;
        uniform float saturation;
        uniform float contrast;
        uniform float temperature;
        uniform float tint;
        uniform float vignetteFalloff;
        uniform float vignetteAmount;
        
        #ifdef ENABLE_MOTIONBLUR
        uniform float motionBlurStrength;
        #endif

        uniform sampler2D rainTexture;
        
        vec3 godrays(float density, float weight, float decay, float exposure, vec2 screenSpaceLightPos, vec2 uv);
        vec3 ACESFilm(vec3 x);
        float getHeight(vec2 uv);
        vec3 adjustSaturation(vec3 color, float value);
        vec3 adjustContrast(vec3 color, float value);

        // White balance
        vec3 whiteBalance(vec3 In, float Temperature, float Tint)
        {
          // Range ~[-1.67;1.67] works best
          float t1 = Temperature * 10. / 6.;
          float t2 = Tint * 10. / 6.;

          // Get the CIE xy chromaticity of the reference white point.
          // Note: 0.31271 = x value on the D65 white point
          float x = 0.31271 - t1 * (t1 < 0. ? 0.1 : 0.05);
          float standardIlluminantY = 2.87 * x - 3. * x * x - 0.27509507;
          float y = standardIlluminantY + t2 * 0.05;

          // Calculate the coefficients in the LMS space.
          vec3 w1 = vec3(0.949237, 1.03542, 1.08728); // D65 white point

          // CIExyToLMS
          float Y = 1.;
          float X = Y * x / y;
          float Z = Y * (1. - x - y) / y;
          float L = 0.7328 * X + 0.4296 * Y - 0.1624 * Z;
          float M = -0.7036 * X + 1.6975 * Y + 0.0061 * Z;
          float S = 0.0030 * X + 0.0136 * Y + 0.9834 * Z;
          vec3 w2 = vec3(L, M, S);

          vec3 balance = vec3(w1.x / w2.x, w1.y / w2.y, w1.z / w2.z);

          mat3 LIN_2_LMS_MAT = mat3(
            3.90405e-1, 5.49941e-1, 8.92632e-3,
            7.08416e-2, 9.63172e-1, 1.35775e-3,
            2.31082e-2, 1.28021e-1, 9.36245e-1
          );

          mat3 LMS_2_LIN_MAT = mat3(
            2.85847e+0, -1.62879e+0, -2.48910e-2,
            -2.10182e-1,  1.15820e+0,  3.24281e-4,
            -4.18120e-2, -1.18169e-1,  1.06867e+0
          );

          vec3 lms = LIN_2_LMS_MAT * In;
          lms *= balance;
          vec3 Out = LMS_2_LIN_MAT * lms;

          return Out;
        }

        // FXAA
        #ifndef FXAA_REDUCE_MIN
            #define FXAA_REDUCE_MIN   (1.0/ 128.0)
        #endif
        #ifndef FXAA_REDUCE_MUL
            #define FXAA_REDUCE_MUL   (1.0 / 8.0)
        #endif
        #ifndef FXAA_SPAN_MAX
            #define FXAA_SPAN_MAX     8.0
        #endif

        void texcoords(vec2 fragCoord, vec2 resolution,
                       out vec2 v_rgbNW, out vec2 v_rgbNE,
                       out vec2 v_rgbSW, out vec2 v_rgbSE,
                       out vec2 v_rgbM);

        vec4 fxaa(sampler2D tex, vec2 fragCoord, vec2 resolution,
                  vec2 v_rgbNW, vec2 v_rgbNE, 
                  vec2 v_rgbSW, vec2 v_rgbSE, 
                  vec2 v_rgbM);

        vec4 applyFXAA(sampler2D tex, vec2 fragCoord, vec2 resolution);

        // DoF
        #define MAX_BLUR 10.0

        uniform float uFocusDistance;
        uniform float uBlurCoefficient;
        uniform float uPPM;
        uniform vec2  uDepthRange;
        uniform vec2 uResolution;
        uniform vec2 uTexelOffset;
        uniform sampler2D uDepth;

        vec4 texture2D(sampler2D samp, vec2 uv) {
          return texture(samp, uv);
        }

        // Raindrops

        uniform float iTime;

        #define S(x, y, z) smoothstep(x, y, z)
        #define B(a, b, edge, t) S(a-edge, a+edge, t)*S(b+edge, b-edge, t)
        #define sat(x) clamp(x,0.,1.)

        #define streetLightCol vec3(1., .7, .3)
        #define headLightCol vec3(.8, .8, 1.)
        #define tailLightCol vec3(1., .1, .1)

        #define HIGH_QUALITY
        #define CAM_SHAKE 1.
        #define LANE_BIAS .5
        #define RAIN
        //#define DROP_DEBUG

        vec3 ro, rd;

        float N(float t) {
          return fract(sin(t*10234.324)*123423.23512);
        }
        vec3 N31(float p) {
            //  3 out, 1 in... DAVE HOSKINS
          vec3 p3 = fract(vec3(p) * vec3(.1031,.11369,.13787));
          p3 += dot(p3, p3.yzx + 19.19);
          return fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
        }
        float N2(vec2 p)
        {	// Dave Hoskins - https://www.shadertoy.com/view/4djSRW
          vec3 p3  = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
            p3 += dot(p3, p3.yzx + 19.19);
            return fract((p3.x + p3.y) * p3.z);
        }


        float DistLine(vec3 ro, vec3 rd, vec3 p) {
          return length(cross(p-ro, rd));
        }
        
        vec3 ClosestPoint(vec3 ro, vec3 rd, vec3 p) {
            // returns the closest point on ray r to point p
            return ro + max(0., dot(p-ro, rd))*rd;
        }

        float Remap(float a, float b, float c, float d, float t) {
          return ((t-a)/(b-a))*(d-c)+c;
        }

        float BokehMask(vec3 ro, vec3 rd, vec3 p, float size, float blur) {
          float d = DistLine(ro, rd, p);
            float m = S(size, size*(1.-blur), d);
            
            #ifdef HIGH_QUALITY
            m *= mix(.7, 1., S(.8*size, size, d));
            #endif
            
            return m;
        }



        float SawTooth(float t) {
            return cos(t+cos(t))+sin(2.*t)*.2+sin(4.*t)*.02;
        }

        float DeltaSawTooth(float t) {
            return 0.4*cos(2.*t)+0.08*cos(4.*t) - (1.-sin(t))*sin(t+cos(t));
        }  

        vec2 GetDrops(vec2 uv, float seed, float m) {
            
            float t = iTime+m*30.;
            vec2 o = vec2(0.);
            
            #ifndef DROP_DEBUG
            uv.y += t*.05;
            #endif
            
            uv *= vec2(10., 2.5)*2.;
            vec2 id = floor(uv);
            vec3 n = N31(id.x + (id.y+seed)*546.3524);
            vec2 bd = fract(uv);
            
            vec2 uv2 = bd;
            
            bd -= .5;
            
            bd.y*=4.;
            
            bd.x += (n.x-.5)*.6;
            
            t += n.z * 6.28;
            float slide = SawTooth(t);
            
            float ts = 1.5;
            vec2 trailPos = vec2(bd.x*ts, (fract(bd.y*ts*2.-t*2.)-.5)*.5);
            
            bd.y += slide*2.;								// make drops slide down
            
            #ifdef HIGH_QUALITY
            float dropShape = bd.x*bd.x;
            dropShape *= DeltaSawTooth(t);
            bd.y += dropShape;								// change shape of drop when it is falling
            #endif
            
            float d = length(bd);							// distance to main drop
            
            float trailMask = S(-.2, .2, bd.y);				// mask out drops that are below the main
            trailMask *= bd.y;								// fade dropsize
            float td = length(trailPos*max(.5, trailMask));	// distance to trail drops
            
            float mainDrop = S(.2, .1, d);
            float dropTrail = S(.1, .02, td);
            
            dropTrail *= trailMask;
            o = mix(bd*mainDrop, trailPos, dropTrail);		// mix main drop and drop trail
            
            #ifdef DROP_DEBUG
            if(uv2.x<.02 || uv2.y<.01) o = vec2(1.);
            #endif
            
            return o;
        }

        vec2 rainEffect(vec2 uv) {
          // vec3 f = normalize(lookat-ro);
          // vec3 r = cross(vec3(0., 1., 0.), f);
          // vec3 u = cross(f, r);

          uv.x *= SIZE.x / SIZE.y;

          float m = 0.;
          float t = iTime;
          vec2 offs = vec2(0.);

          #ifdef RAIN
          vec2 dropUv = uv;
          
          #ifdef HIGH_QUALITY
          // float x = (sin(t*.1)*.5+.5)*.5;
          // x = -x*x;
          const float x = 0.2;
          const float s = sin(x);
          const float c = cos(x);
          
          const mat2 rot = mat2(c, -s, s, c);
        
          dropUv = uv*rot;
          // dropUv.x += -sin(t*.1)*.5;
          #endif
          
          offs = GetDrops(dropUv, 1., m);
          
          #ifndef DROP_DEBUG
          offs += GetDrops(dropUv*1.4, 10., m);
          #ifdef HIGH_QUALITY
          // offs += GetDrops(dropUv*2.4, 25., m);
          //offs += GetDrops(dropUv*3.4, 11.);
          //offs += GetDrops(dropUv*3., 2.);
          #endif
          
          // float ripple = sin(t+uv.y*3.1415*30.+uv.x*124.)*.5+.5;
          // ripple *= .005;
          // offs += vec2(ripple*ripple, ripple);
          #endif
          #endif

          uv -= offs;
          uv.x /= SIZE.x / SIZE.y;

          return uv;
        }
        
        void main() {
          vec2 uv = gl_FragCoord.xy / SIZE;

          #ifdef DEBUG_COLOR
          fragColor = texture2D(mainTexture, uv);
          return;
          #endif
        
          // float stepSize = 0.02;
          // float size = 2.; //?
          // float s01 = getHeight(uv + vec2(-stepSize, 0));
          // float s21 = getHeight(uv + vec2(stepSize, 0));
          // float s10 = getHeight(uv + vec2(0, -stepSize));
          // float s12 = getHeight(uv + vec2(0, stepSize));
          // vec3 va = normalize(vec3(size, 0, s21 - s01));
          // vec3 vb = normalize(vec3(0, size, s12 - s10));
          // vec3 normal = cross(va, vb);
        
          // gl_FragColor = vec4(normal, 1);
          // return;
        
          // Rain drops
          // vec3 normal = texture(rainTexture, uv * 3.).rgb * 2. - 1.;
          // float screenDistance = 0.07 * 0.5;
          // vec2 uvOffset = normal.xy * screenDistance;
          // uv += uvOffset;

          // uv = rainEffect(uv);
        
          vec4 col = vec4(0);

          // // DoF
          // ivec2 fragCoord = ivec2(gl_FragCoord.xy);
          // ivec2 resolution = ivec2(uResolution) - 1;

          // // Convert to linear depth
          // float ndc = 2.0 * texelFetch(uDepth, fragCoord, 0).r - 1.0;
          // float depth = -(2.0 * uDepthRange.y * uDepthRange.x) / (ndc * (uDepthRange.y - uDepthRange.x) - uDepthRange.y - uDepthRange.x);
          // float deltaDepth = abs(uFocusDistance - depth);
          
          // // Blur more quickly in the foreground.
          // float xdd = depth < uFocusDistance ? abs(uFocusDistance - deltaDepth) : abs(uFocusDistance + deltaDepth);
          // float blurRadius = min(floor(uBlurCoefficient * (deltaDepth / xdd) * uPPM), MAX_BLUR);
          
          // if (blurRadius > 1.0) {
          //     float halfBlur = blurRadius * 0.5;

          //     float count = 0.0;

          //     // for (float i = 0.0; i <= MAX_BLUR; ++i) {
          //     //     if (i > blurRadius) {
          //     //         break;
          //     //     }

          //     //     // texelFetch outside texture gives vec4(0.0) (undefined in ES 3)
          //     //     ivec2 sampleCoord = clamp(fragCoord + ivec2(((i - halfBlur) * uTexelOffset)), ivec2(0), resolution);
          //     //     col += texelFetch(mainTexture, sampleCoord, 0);

          //     //     ++count;
          //     // }
          //     for (float i = 0.0; i <= MAX_BLUR; ++i) {
          //       if (i > blurRadius) {
          //         break;
          //       }

          //       for (float j = 0.0; j <= MAX_BLUR; ++j) {
          //         if (j > blurRadius) {
          //           break;
          //         }

          //         // texelFetch outside texture gives vec4(0.0) (undefined in ES 3)
          //         ivec2 sampleCoord = clamp(fragCoord + ivec2(i - halfBlur, j - halfBlur), ivec2(0), resolution);
          //         col += texelFetch(mainTexture, sampleCoord, 0);
          //         #ifdef ENABLE_BLOOM
          //           vec4 bloom = texture2D(bloomTexture, vec2(sampleCoord) / vec2(resolution));
          //           col.rgb += bloom.rgb * bloomIntensity;
          //         #endif

          //         ++count;
          //       }
          //     }

          //     col /= count;
          // } else {
          //     col = texelFetch(mainTexture, fragCoord, 0);
          // }

          #ifdef ENABLE_MOTIONBLUR
            const int nSamples = 32;
            vec2 blurVec = motionBlurStrength * (texture2D(motionBlurTexture, uv).xy * 2. - 1.);
            vec4 result = texture2D(mainTexture, uv);

            for (int i = 1; i < nSamples; ++i) {
              vec2 offset = blurVec * (float(i) / float(nSamples - 1) - 0.5);
              result += texture2D(mainTexture, uv + offset);
              // result += applyFXAA(mainTexture, (uv + offset) * SIZE, SIZE);
            }
            result /= float(nSamples);
            col += result;
          #else
            vec4 samp = texture2D(mainTexture, uv);
            // vec4 samp = applyFXAA(mainTexture, gl_FragCoord.xy, SIZE);
            col += samp;
          #endif

          // Downscaled texture
          vec4 downscaledCol = texture2D(downscaledTexture, uv);
          col.rgb += downscaledCol.rgb;
        
          // Bloom
          #ifdef ENABLE_BLOOM
            vec4 bloom = texture2D(bloomTexture, uv);
            col.rgb += bloom.rgb * bloomIntensity;
          #endif
        
          // Godrays
          #ifdef ENABLE_GODRAYS
            col.rgb += godrays(1., 0.01, 0.97, 0.6, vec2(0.5, 0.5), uv);
          #endif
        
          // Exposure correction
          col.rgb = col.rgb * pow(2., exposure);
        
          // Tonemapping (HDR to LDR)
          #ifdef TONEMAPPING
            #if TONEMAPPING == 1
              col.rgb = ACESFilm(col.rgb);
            #elif TONEMAPPING == 2
              col.rgb = col.rgb / (col.rgb + vec3(1.0));
            #endif
          #endif
        
          // // Gamma correction
          // col.rgb = pow(col.rgb, vec3(1. / gamma));
        
          // Saturation, contrast
          // #ifdef ENABLE_COLORGRADING
          col.rgb = adjustSaturation(col.rgb, saturation);
          col.rgb = adjustContrast(col.rgb, 1. + contrast);
          // #endif

          // White balance
          col.rgb = whiteBalance(col.rgb, temperature, tint);

          // Gamma correction
          col.rgb = pow(col.rgb, vec3(1. / gamma));

          // Vignette
          float dist = distance(uv, vec2(0.5, 0.5));
          col.rgb *= smoothstep(0.8, vignetteFalloff * 0.799, dist * (vignetteAmount + vignetteFalloff));
        
          fragColor = col;
        }

        vec4 applyFXAA(sampler2D tex, vec2 fragCoord, vec2 resolution) {
          mediump vec2 v_rgbNW;
          mediump vec2 v_rgbNE;
          mediump vec2 v_rgbSW;
          mediump vec2 v_rgbSE;
          mediump vec2 v_rgbM;

          //compute the texture coords
          texcoords(fragCoord, resolution, v_rgbNW, v_rgbNE, v_rgbSW, v_rgbSE, v_rgbM);
          
          //compute FXAA
          return fxaa(tex, fragCoord, resolution, v_rgbNW, v_rgbNE, v_rgbSW, v_rgbSE, v_rgbM);
        }

        vec4 fxaa(sampler2D tex, vec2 fragCoord, vec2 resolution,
                    vec2 v_rgbNW, vec2 v_rgbNE, 
                    vec2 v_rgbSW, vec2 v_rgbSE, 
                    vec2 v_rgbM) {
            vec4 color;
            mediump vec2 inverseVP = vec2(1.0 / resolution.x, 1.0 / resolution.y);
            vec3 rgbNW = texture2D(tex, v_rgbNW).xyz;
            vec3 rgbNE = texture2D(tex, v_rgbNE).xyz;
            vec3 rgbSW = texture2D(tex, v_rgbSW).xyz;
            vec3 rgbSE = texture2D(tex, v_rgbSE).xyz;
            vec4 texColor = texture2D(tex, v_rgbM);
            vec3 rgbM  = texColor.xyz;
            vec3 luma = vec3(0.299, 0.587, 0.114);
            float lumaNW = dot(rgbNW, luma);
            float lumaNE = dot(rgbNE, luma);
            float lumaSW = dot(rgbSW, luma);
            float lumaSE = dot(rgbSE, luma);
            float lumaM  = dot(rgbM,  luma);
            float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
            float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
            
            mediump vec2 dir;
            dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
            dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
            
            float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) *
                                  (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
            
            float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
            dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),
                      max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX),
                      dir * rcpDirMin)) * inverseVP;
            
            vec3 rgbA = 0.5 * (
                texture2D(tex, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz +
                texture2D(tex, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz);
            vec3 rgbB = rgbA * 0.5 + 0.25 * (
                texture2D(tex, fragCoord * inverseVP + dir * -0.5).xyz +
                texture2D(tex, fragCoord * inverseVP + dir * 0.5).xyz);

            float lumaB = dot(rgbB, luma);
            if ((lumaB < lumaMin) || (lumaB > lumaMax))
                color = vec4(rgbA, texColor.a);
            else
                color = vec4(rgbB, texColor.a);
            return color;
        }

        void texcoords(vec2 fragCoord, vec2 resolution,
              out vec2 v_rgbNW, out vec2 v_rgbNE,
              out vec2 v_rgbSW, out vec2 v_rgbSE,
              out vec2 v_rgbM) {
          vec2 inverseVP = 1.0 / resolution.xy;
          v_rgbNW = (fragCoord + vec2(-1.0, -1.0)) * inverseVP;
          v_rgbNE = (fragCoord + vec2(1.0, -1.0)) * inverseVP;
          v_rgbSW = (fragCoord + vec2(-1.0, 1.0)) * inverseVP;
          v_rgbSE = (fragCoord + vec2(1.0, 1.0)) * inverseVP;
          v_rgbM = vec2(fragCoord * inverseVP);
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
        
        float getHeight(vec2 uv) {
          float y = 0.5 + 0.2 * sin(uv.x * 12.);
          float d = abs(uv.y - y);
          float falloff = 40.;
          float thickness = 0.;
          float height = 1. - clamp(d * falloff - thickness, 0., 1.);
          return height;
        }

        vec4 sharpen(in sampler2D tex, in vec2 coords, in vec2 renderSize) {
          float dx = 1.0 / renderSize.x;
          float dy = 1.0 / renderSize.y;
          vec4 sum = vec4(0.0);
          sum += -1. * texture2D(tex, coords + vec2( -1.0 * dx , 0.0 * dy));
          sum += -1. * texture2D(tex, coords + vec2( 0.0 * dx , -1.0 * dy));
          sum += 5. * texture2D(tex, coords + vec2( 0.0 * dx , 0.0 * dy));
          sum += -1. * texture2D(tex, coords + vec2( 0.0 * dx , 1.0 * dy));
          sum += -1. * texture2D(tex, coords + vec2( 1.0 * dx , 0.0 * dy));
          return sum;
        }
        
        vec3 adjustSaturation(vec3 color, float value) {
          // https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
          const vec3 luminosityFactor = vec3(0.2126, 0.7152, 0.0722);
          vec3 grayscale = vec3(dot(color, luminosityFactor));
        
          return mix(grayscale, color, 1.0 + value);
        }

        vec3 adjustContrast(vec3 color, float value) {
          return 0.5 + value * (color - 0.5);
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