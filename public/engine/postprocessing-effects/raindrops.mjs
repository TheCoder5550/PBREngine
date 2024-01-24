import PostProcessingEffect from "./postprocessingEffect.mjs";

export default class Raindrops extends PostProcessingEffect {
  intensity = 0.75;

  setUniforms(programContainer, gl) {
    gl.uniform1f(programContainer.getUniformLocation("raindropsIntensity"), this.intensity);
  }

  getFragmentSource() {
    return `
      uniform float raindropsIntensity;

      // #define DROP_DEBUG
      #define HIGH_QUALITY

      #define S(x, y, z) smoothstep(x, y, z)

      vec3 N31(float p) {
        //  3 out, 1 in... DAVE HOSKINS
        vec3 p3 = fract(vec3(p) * vec3(.1031,.11369,.13787));
        p3 += dot(p3, p3.yzx + 19.19);
        return fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
      }

      float SawTooth(float t) {
        return cos(t+cos(t))+sin(2.*t)*.2+sin(4.*t)*.02;
      }

      float DeltaSawTooth(float t) {
        return 0.4*cos(2.*t)+0.08*cos(4.*t) - (1.-sin(t))*sin(t+cos(t));
      }

      vec2 GetDrops(vec2 uv, float seed, float m) {
            
        float t = time + m * 30.;
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
        
        o *= raindropsIntensity;

        #ifdef DROP_DEBUG
        if(uv2.x<.02 || uv2.y<.01) o = vec2(1.);
        #endif
        
        return o;
      }

      vec2 rainEffect(vec2 uv) {
        // vec3 f = normalize(lookat-ro);
        // vec3 r = cross(vec3(0., 1., 0.), f);
        // vec3 u = cross(f, r);

        uv.x *= screenSize.x / screenSize.y;

        float m = 0.;
        float t = time;
        vec2 offs = vec2(0.);

        vec2 dropUv = uv;
        
        #ifdef HIGH_QUALITY
        // float x = (sin(t*.1)*.5+.5)*.5;
        // x = -x*x;
        const float x = 0.2;
        float s = sin(x);
        float c = cos(x);
        
        mat2 rot = mat2(c, -s, s, c);
      
        dropUv = uv*rot;
        // dropUv.x += -sin(t*.1)*.5;
        #endif
        
        offs = GetDrops(dropUv, 1., m);
        
        #ifndef DROP_DEBUG
        offs += GetDrops(dropUv*1.4, 10., m);
        #ifdef HIGH_QUALITY
        offs += GetDrops(dropUv*2.4, 25., m);
        // offs += GetDrops(dropUv*3.4, 11.);
        // offs += GetDrops(dropUv*3., 2.);
        #endif
        
        // float ripple = sin(t+uv.y*3.1415*30.+uv.x*124.)*.5+.5;
        // ripple *= .005;
        // offs += vec2(ripple*ripple, ripple);
        #endif

        uv -= offs;
        uv.x /= screenSize.x / screenSize.y;

        return uv;
      }

      vec4 mainImage(vec4 inColor, vec2 uv) {
        // float stepSize = 0.02;
        // float size = 2.; //?
        // float s01 = getHeight(uv + vec2(-stepSize, 0));
        // float s21 = getHeight(uv + vec2(stepSize, 0));
        // float s10 = getHeight(uv + vec2(0, -stepSize));
        // float s12 = getHeight(uv + vec2(0, stepSize));
        // vec3 va = normalize(vec3(size, 0, s21 - s01));
        // vec3 vb = normalize(vec3(0, size, s12 - s10));
        // vec3 normal = cross(va, vb);
  
        // vec3 normal = texture(rainTexture, uv * 3.).rgb * 2. - 1.;
        // float screenDistance = 0.07 * 0.5;
        // vec2 uvOffset = normal.xy * screenDistance;
        // uv += uvOffset;
  
        uv = rainEffect(uv);
        return texture(sceneTexture, uv);
      }
    `;
  }
}