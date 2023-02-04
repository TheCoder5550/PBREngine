import Vector from "../vector.mjs";
import Quaternion from "../quaternion.mjs";
import { removeChildren } from "../helper.mjs";

function createInspector(renderer) {
  var scene = renderer.getActiveScene();

  var win = window.open(renderer.path + "engine/inspector/inspector.html", "Inspector", "width=500, height=600");
  
  win.addEventListener("DOMContentLoaded", function() {
    var hierarchy = win.document.querySelector("#hierarchy");
    updateHierarchy();
    
    var inspector = win.document.querySelector("#inspector");
    var inspectorName = inspector.querySelector(".name");

    function updateHierarchy() {
      setInterval(function() {
        removeChildren(hierarchy);
        createTree(scene.root, hierarchy);
      }, 500);
    }

    function createTree(obj, domParent) {
      var list = domParent.appendChild(win.document.createElement("ul"));
      for (let child of obj.children) {
        let item = list.appendChild(win.document.createElement("li"));

        let a = item.appendChild(win.document.createElement("span"));
        a.classList.add("gameObjectLabel");
        a.textContent = child.name;
        a.addEventListener("click", () => inspect(child));

        createTree(child, item);
      }
    }

    function inspect(obj) {
      inspectorName.innerText = obj.name;
      createTransformInput(obj);

      var inspectorComponentsList = inspector.querySelector(".gameObjectComponents");
      removeChildren(inspectorComponentsList);

      for (var comp of obj.getComponents()) {
        var item = inspectorComponentsList.appendChild(win.document.createElement("li"));
        item.innerText = comp.constructor.name;
      }
    }

    function createTransformInput(obj) {
      var vectors = [
        { name: "Position", size: 3, prop: "position", default: Vector.zero() },
        { name: "Rotation", size: 4, prop: "rotation", default: Quaternion.identity() },
        { name: "Scale", size: 3, prop: "scale", default: Vector.one() }
      ];
      let comps = ["x", "y", "z", "w"];

      for (let vector of vectors) {
        for (let i = 0; i < vector.size; i++) {
          let inp = win.document.querySelector(`.vector.${vector.prop} .${comps[i]}`);
          inp.value = obj.transform[vector.prop][comps[i]];
          inp.oninput = function(e) {
            if (obj) {
              obj.transform[vector.prop][comps[i]] = isNaN(e.target.value) ? 0 : e.target.value;
            }
          };
        }
      }
    }
  });
}

export default createInspector;