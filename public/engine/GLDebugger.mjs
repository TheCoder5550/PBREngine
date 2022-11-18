import { GameObject, FindMaterials } from "./renderer.mjs";
import Matrix from "./matrix.mjs";
import Vector from "./vector.mjs";

function GLDebugger(scene) {
  var renderer = scene.renderer;

  var aabbVis;
  renderer.createProgramFromFile("./assets/shaders/custom/webgl2/solidColor").then(r => {
    var solidColorInstanceProgram = new renderer.ProgramContainer(r);
    aabbVis = scene.add(new GameObject("AABB", {
      meshRenderer: new renderer.MeshInstanceRenderer([new renderer.Material(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
      castShadows: false
    }));
  });

  var meshData = new renderer.MeshData(renderer.getCubeData());

  this.index = 0;
  this.cubes = [];
  for (var i = 0; i < 50; i++) {
    var c = scene.add(new GameObject("DebugCube" + i));
    c.visible = false;
    c.castShadows = false;

    var material = renderer.CreateLitMaterial();
    c.meshRenderer = new renderer.MeshRenderer(material, meshData);

    material.setUniform("albedo", [0, 0, 0, 1]);
    material.setUniform("emissiveFactor", [Math.random(), Math.random(), Math.random()]);

    this.cubes[i] = c;
  }

  renderer.on("renderloop", (frameTime) => {
    this.clear();
  });

  this.clear = function() {
    this.index = 0;
    for (var cube of this.cubes) {
      cube.visible = false;
    }

    if (aabbVis) {
      aabbVis.meshRenderer.removeAllInstances();
    }
  }

  this.Bounds = function(aabb) {
    if (aabbVis) {
      var position = aabb.getCenter();
      var size = aabb.getSize();

      aabbVis.meshRenderer.addInstance(Matrix.transform([
        ["translate", position],
        ["sx", size.x / 2],
        ["sy", size.y / 2],
        ["sz", size.z / 2]
      ]));
    }
  }

  this.Vector = function(p, normal, size = 1, color) {
    var c = this.cubes[this.index];
    c.transform.matrix = Matrix.lookAt(Vector.add(p, Vector.multiply(normal, 0.5 * size)), Vector.add(p, normal), new Vector(0.1, 0.9, 0));
    c.transform.scale = new Vector(0.01, 0.01, 0.5 * size);
    c.visible = true;

    if (color) {
      FindMaterials("", c)[0].setUniform("emissiveFactor", color);
    }

    this.index++;
    this.index = this.index % this.cubes.length;
  }

  this.Point = function(p, size = 0.2, color) {
    var c = this.cubes[this.index];
    c.transform.position = p;
    c.transform.scale = Vector.fill(size);
    c.visible = true;

    if (color) {
      FindMaterials("", c)[0].setUniform("emissiveFactor", color);
    }

    this.index++;
    this.index = this.index % this.cubes.length;
  }
}

export default GLDebugger;