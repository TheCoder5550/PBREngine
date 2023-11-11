var output = {
  webgl1: {
    specularCubemap: {
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
        #extension GL_EXT_shader_texture_lod : enable
        precision highp float;

        #ifndef GL_EXT_shader_texture_lod
        vec4 textureCubeLodEXT(samplerCube t, vec3 n, float lod) {
          return textureCube(t, n);
        }
        #endif

        varying vec3 localPos;

        uniform samplerCube environmentMap;
        uniform float roughness;

        const float PI = 3.14159265359;

        float VanDerCorput(int n, int base);
        vec2 Hammersley(int i, int N);
        vec3 ImportanceSampleGGX(vec2 Xi, vec3 N, float roughness);
        float DistributionGGX(float NdotH, float roughness);
        float saturate(float x);
          
        void main()
        {		
            vec3 N = normalize(localPos);    
            vec3 R = N;
            vec3 V = R;

            const int SAMPLE_COUNT = 512;
            // const int SAMPLE_COUNT = 4096;

            float totalWeight = 0.0;
            vec3 prefilteredColor = vec3(0.0);

            float resolution = 1024.0; // resolution of source cubemap (per face)
            float saTexel  = 4.0 * PI / (6.0 * resolution * resolution);

            for(int i = 0; i < SAMPLE_COUNT; ++i)
            {
                vec2 Xi = Hammersley(i, SAMPLE_COUNT);
                vec3 H  = ImportanceSampleGGX(Xi, N, roughness);
                vec3 L  = normalize(2.0 * dot(V, H) * H - V);

                float NdotL = max(dot(N, L), 0.0);
                if(NdotL > 0.0)
                {
                    float NdotH = saturate(dot(N, H));
                    float HdotV = saturate(dot(H, V));

                    float D   = DistributionGGX(NdotH, roughness);
                    float pdf = (D * NdotH / (4.0 * HdotV)) + 0.0001; 
                    float saSample = 1.0 / (float(SAMPLE_COUNT) * pdf + 0.0001);
                    float mipLevel = roughness == 0.0 ? 0.0 : 0.5 * log2(saSample / saTexel); 

                    prefilteredColor += min(textureCubeLodEXT(environmentMap, L, mipLevel).rgb, vec3(100)) * NdotL;
                    totalWeight      += NdotL;
                }
            }
            prefilteredColor = prefilteredColor / totalWeight;

            gl_FragColor = vec4(prefilteredColor, 1.0);
        }

        float VanDerCorput(int n, int base)
        {
            float invBase = 1.0 / float(base);
            float denom   = 1.0;
            float result  = 0.0;

            for(int i = 0; i < 32; ++i)
            {
                if(n > 0)
                {
                    denom   = mod(float(n), 2.0);
                    result += denom * invBase;
                    invBase = invBase / 2.0;
                    n       = int(float(n) / 2.0);
                }
            }

            return result;
        }
        // ----------------------------------------------------------------------------
        vec2 Hammersley(int i, int N)
        {
            return vec2(float(i)/float(N), VanDerCorput(i, 2));
        }

        vec3 ImportanceSampleGGX(vec2 Xi, vec3 N, float roughness)
        {
            float a = roughness*roughness;
          
            float phi = 2.0 * PI * Xi.x;
            float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a*a - 1.0) * Xi.y));
            float sinTheta = sqrt(1.0 - cosTheta*cosTheta);
          
            // from spherical coordinates to cartesian coordinates
            vec3 H;
            H.x = cos(phi) * sinTheta;
            H.y = sin(phi) * sinTheta;
            H.z = cosTheta;
          
            // from tangent-space vector to world-space sample vector
            vec3 up        = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
            vec3 tangent   = normalize(cross(up, N));
            vec3 bitangent = cross(N, tangent);
          
            vec3 sampleVec = tangent * H.x + bitangent * H.y + N * H.z;
            return normalize(sampleVec);
        }

        float DistributionGGX(float NdotH, float roughness)
        {
            float a      = roughness*roughness;
            float a2     = a*a;
            float NdotH2 = NdotH*NdotH;
          
            float nom   = a2;
            float denom = (NdotH2 * (a2 - 1.0) + 1.0);
            denom = PI * denom * denom;
          
            return nom / denom;
        }

        float saturate(float x) {
            return max(0., min(1., x));
        }
      `
    }
  },

  webgl2: {
    specularCubemap: {
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

        uniform samplerCube environmentMap;
        uniform float roughness;

        const float PI = 3.14159265359;

        float RadicalInverse_VdC(uint bits);
        vec2 Hammersley(uint i, uint N);
        vec3 ImportanceSampleGGX(vec2 Xi, vec3 N, float roughness);
        float DistributionGGX(float NdotH, float roughness);
        float saturate(float x);

        // Settings
        const uint SAMPLE_COUNT = 1024u;//4096u * 4u;
        const vec3 maxBrightness = vec3(50);
        // --------
          
        void main()
        {		
            vec3 N = normalize(localPos);    
            vec3 R = N;
            vec3 V = R;

            float totalWeight = 0.0;
            vec3 prefilteredColor = vec3(0.0);

            float resolution = float(textureSize(environmentMap, 0).x);//1024.0; // resolution of source cubemap (per face)
            float saTexel  = 4.0 * PI / (6.0 * resolution * resolution);

            for(uint i = 0u; i < SAMPLE_COUNT; ++i)
            {
                vec2 Xi = Hammersley(i, SAMPLE_COUNT);
                vec3 H  = ImportanceSampleGGX(Xi, N, roughness);
                vec3 L  = normalize(2.0 * dot(V, H) * H - V);

                float NdotL = max(dot(N, L), 0.0);
                if(NdotL > 0.0)
                {
                    float NdotH = saturate(dot(N, H));
                    float HdotV = saturate(dot(H, V));

                    float D   = DistributionGGX(NdotH, roughness);
                    float pdf = (D * NdotH / (4.0 * HdotV)) + 0.0001; 
                    float saSample = 1.0 / (float(SAMPLE_COUNT) * pdf + 0.0001);
                    float mipLevel = roughness == 0.0 ? 0.0 : 0.5 * log2(saSample / saTexel); 

                    prefilteredColor += min(textureLod(environmentMap, L, mipLevel).rgb, maxBrightness) * NdotL;
                    totalWeight      += NdotL;
                }
            }
            prefilteredColor = prefilteredColor / totalWeight;

            FragColor = vec4(prefilteredColor, 1.0);
        }

        float RadicalInverse_VdC(uint bits) 
        {
            bits = (bits << 16u) | (bits >> 16u);
            bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
            bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
            bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
            bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
            return float(bits) * 2.3283064365386963e-10; // / 0x100000000
        }
        // ----------------------------------------------------------------------------
        vec2 Hammersley(uint i, uint N)
        {
            return vec2(float(i)/float(N), RadicalInverse_VdC(i));
        }

        vec3 ImportanceSampleGGX(vec2 Xi, vec3 N, float roughness)
        {
            float a = roughness*roughness;
          
            float phi = 2.0 * PI * Xi.x;
            float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a*a - 1.0) * Xi.y));
            float sinTheta = sqrt(1.0 - cosTheta*cosTheta);
          
            // from spherical coordinates to cartesian coordinates
            vec3 H;
            H.x = cos(phi) * sinTheta;
            H.y = sin(phi) * sinTheta;
            H.z = cosTheta;
          
            // from tangent-space vector to world-space sample vector
            vec3 up        = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
            vec3 tangent   = normalize(cross(up, N));
            vec3 bitangent = cross(N, tangent);
          
            vec3 sampleVec = tangent * H.x + bitangent * H.y + N * H.z;
            return normalize(sampleVec);
        }

        float DistributionGGX(float NdotH, float roughness)
        {
            float a      = roughness*roughness;
            float a2     = a*a;
            float NdotH2 = NdotH*NdotH;
          
            float nom   = a2;
            float denom = (NdotH2 * (a2 - 1.0) + 1.0);
            denom = PI * denom * denom;
          
            return nom / denom;
        }

        float saturate(float x) {
            return max(0., min(1., x));
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