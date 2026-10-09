import { ShaderMaterial, Vector3, type Texture } from 'three';

export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;
  void main() {
    vUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vPositionWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Keep the shared effective world-space direction by reference, including for specular light.
export function createEarthMaterial(
  day: Texture,
  night: Texture,
  specular: Texture,
  worldSun: Vector3,
) {
  return new ShaderMaterial({
    uniforms: {
      dayMap: { value: day },
      nightMap: { value: night },
      specularMap: { value: specular },
      sunDirection: { value: worldSun },
      nightEnabled: { value: 1 },
      clarity: { value: 0 },
    },
    vertexShader: earthVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform sampler2D specularMap;
      uniform vec3 sunDirection;
      uniform float nightEnabled;
      uniform float clarity;
      varying vec2 vUv;
      varying vec3 vNormalWorld;
      varying vec3 vPositionWorld;
      void main() {
        vec3 normal = normalize(vNormalWorld);
        vec3 view = normalize(cameraPosition - vPositionWorld);
        float sunlight = dot(normal, sunDirection);
        float dayBlend = smoothstep(-0.18, 0.25, sunlight);
        vec3 albedo = texture2D(dayMap, vUv).rgb;
        vec3 night = texture2D(nightMap, vUv).rgb;
        float ocean = texture2D(specularMap, vUv).r;
        // Natural imagery, diffuse solar light, and a small blue ambient floor.
        albedo = mix(albedo, vec3(0.008, 0.032, 0.095), ocean);
        albedo *= mix(vec3(1.0), vec3(0.55, 0.68, 0.82), ocean * 0.7);
        vec3 surface = albedo * (0.025 + max(sunlight, 0.0) * 1.35);
        surface += vec3(0.004, 0.012, 0.027) * ocean * dayBlend;
        float spec = pow(max(dot(normal, normalize(sunDirection + view)), 0.0), 65.0);
        surface += vec3(0.65, 0.74, 0.78) * spec * ocean * dayBlend * 0.35;
        float city = smoothstep(0.015, 0.6, max(night.r, max(night.g, night.b)));
        vec3 cityLight = night * vec3(1.5, 1.17, 0.78) * 1.4 + vec3(0.22, 0.10, 0.025) * city;
        surface += cityLight * (1.0 - smoothstep(-0.22, 0.1, sunlight)) * nightEnabled;
        float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.4);
        surface += vec3(0.12, 0.36, 0.75) * fresnel * dayBlend * 0.43;
        surface = mix(surface, albedo * 0.9, clarity);
        gl_FragColor = vec4(surface, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createCloudMaterial(clouds: Texture, worldSun: Vector3) {
  return new ShaderMaterial({
    uniforms: {
      cloudMap: { value: clouds },
      sunDirection: { value: worldSun },
      layerOpacity: { value: 1 },
    },
    vertexShader: earthVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D cloudMap;
      uniform float layerOpacity;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vNormalWorld;
      varying vec3 vPositionWorld;
      void main() {
        float cloud = texture2D(cloudMap, vUv).r;
        float sunlight = dot(normalize(vNormalWorld), sunDirection);
        float light = 0.035 + 1.3 * max(sunlight, 0.0);
        vec3 color = vec3(0.88, 0.94, 1.0) * light;
        gl_FragColor = vec4(color, pow(cloud, 1.6) * 0.48 * layerOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}
