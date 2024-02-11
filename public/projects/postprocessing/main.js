import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import FlyCamera from "../../engine/flyCamera.mjs";
import Vector from "../../engine/vector.mjs";
import Tonemapper from "../../engine/postprocessing-effects/tonemapper.mjs";
import Vignette from "../../engine/postprocessing-effects/vignette.mjs";
import Raindrops from "../../engine/postprocessing-effects/raindrops.mjs";
import FXAA from "../../engine/postprocessing-effects/fxaa.mjs";
import Motionblur from "../../engine/postprocessing-effects/motionBlur.mjs";
import Bloom from "../../engine/postprocessing-effects/bloom.mjs";
import ColorGrading from "../../engine/postprocessing-effects/colorGrading.mjs";
import Godrays from "../../engine/postprocessing-effects/godrays.mjs";
import AutoExposure from "../../engine/postprocessing-effects/autoExposure.mjs";

const renderer = new Renderer({
  renderpipeline: RENDERPIPELINE.FORWARD,
  path: "../../",

  shadowSizes: [16 * 2, 64 * 2],
  shadowBiases: [2, 2],
  shadowResolution: 1024,
});
const scene = window.scene = renderer.add(new Scene());
scene.sunDirection = Vector.normalize(new Vector(0, 1, 0.1));
scene.environmentIntensity = 0.5;
scene.sunIntensity = new Vector(25, 18, 15);
// await scene.loadEnvironment();
await scene.loadEnvironment({ hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const flyCamera = new FlyCamera(renderer, {
  fov: 20,
  near: 0.1,
  far: 50,
});
flyCamera.camera.transform.position.y = 3;
const camera = flyCamera.camera;

const pp = renderer.postprocessing;

const godrays = pp.addEffect(new Godrays());
godrays.samples = 100;
godrays.camera = camera;
godrays.scene = scene;

pp.addEffect(new Motionblur());
pp.addEffect(new Raindrops()).intensity = 0.3;

const bloom = pp.addEffect(new Bloom());
const lensDirtTexture = await renderer.loadTextureAsync(renderer.path + "assets/textures/lensDirt.webp");
bloom.lensDirtTexture = lensDirtTexture;
bloom.lensDirtIntensity = 10;

pp.addEffect(new AutoExposure());
pp.addEffect(new Tonemapper());
pp.addEffect(new FXAA());
pp.addEffect(new ColorGrading()).contrast = 0.2;
pp.addEffect(new Vignette()).amount = 0.5;

scene.add(await renderer.loadGLTF(renderer.path + "assets/models/sponza.glb"));

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});