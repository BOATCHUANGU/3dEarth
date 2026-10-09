import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Filmic light from orbit, original photographic/cartographic colors near land. */
export class EarthOutputPass extends OutputPass {
  constructor() {
    super();
    this.uniforms.nativeColorMix = { value: 0 };
    this.material.uniforms.nativeColorMix = this.uniforms.nativeColorMix;
    this.material.fragmentShader = this.material.fragmentShader
      .replace(
        'uniform sampler2D tDiffuse;',
        'uniform sampler2D tDiffuse; uniform float nativeColorMix;',
      )
      .replace(
        'gl_FragColor = texture2D( tDiffuse, vUv );',
        'gl_FragColor = texture2D( tDiffuse, vUv ); vec3 nativeColor = gl_FragColor.rgb;',
      )
      .replace(
        '// color space',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, nativeColor, nativeColorMix);\n // color space',
      );
  }

  set clarity(value: number) {
    this.uniforms.nativeColorMix.value = value;
  }
}
