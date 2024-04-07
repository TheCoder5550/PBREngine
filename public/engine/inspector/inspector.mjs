import Vector from "../vector.mjs";
import Quaternion from "../quaternion.mjs";
import { removeChildren, roundNearest } from "../helper.mjs";

function createInspector(renderer) {
  var win = window.open(renderer.path + "engine/inspector/inspector.html", "Inspector", "width=500, height=600");
  
  const intervals = [];
  const clearIntervals = () => {
    intervals.forEach(i => clearInterval(i));
    intervals.length = 0;
  };

  let lastInspected = null;
  const hierarchyExpanded = {};

  win.addEventListener("DOMContentLoaded", function() {
    var hierarchy = win.document.querySelector("#hierarchy");
    updateHierarchy();
    
    const inspector = win.document.querySelector("#inspector");
    const inspectorName = inspector.querySelector(".name");
    const inspectorVisible = inspector.querySelector(".visible");
    const inspectorCastShadows = inspector.querySelector(".castShadows");
    const inspectorReceiveShadows = inspector.querySelector(".receiveShadows");

    function updateHierarchy() {
      setInterval(function() {
        removeChildren(hierarchy);
        clearIntervals();

        const scene = renderer.getActiveScene();
        createTree(scene.root, hierarchy);

        if (lastInspected) {
          const path = lastInspected.path;
          let element = hierarchy;
          for (let i = 0; i < path.length; i++) {
            element = element.children[path[i]];
          }
          inspect(lastInspected.gameObject, element);
        }
      }, 500);
    }

    function createTree(obj, domParent) {
      // var list = domParent.appendChild(win.document.createElement("ul"));
      for (let child of obj.children) {
        // let item = list.appendChild(win.document.createElement("li"));
        const details = child.children.length === 0 ?
          domParent.appendChild(win.document.createElement("span")) :
          domParent.appendChild(win.document.createElement("details"));
        const path = getDOMPath(details);

        details.addEventListener("toggle", () => {
          hierarchyExpanded[path] = details.open;
        });

        details.open = hierarchyExpanded[path] || false;

        const summary = details.appendChild(win.document.createElement("summary"));
        const a = summary.appendChild(win.document.createElement("span"));
        a.classList.add("gameObjectLabel");
        a.textContent = child.name;
        a.addEventListener("click", () => {
          clearIntervals();
          inspect(child, a);
        });

        const content = details.appendChild(win.document.createElement("div"));
        content.style.paddingLeft = "1.5rem";
        createTree(child, content);
      }
    }

    function inspect(obj, dom) {
      if (lastInspected) {
        lastInspected.domElement.style.background = "";
      }

      lastInspected = {
        gameObject: obj,
        domElement: dom,
        path: getDOMPath(dom),
      };

      if (dom) {
        dom.style.background = "red";
      }

      inspectorName.innerText = obj.name;
      createTransformInput(obj);

      // Visible
      inspectorVisible.checked = obj.visible;
      inspectorVisible.oninput = () => {
        obj.visible = inspectorVisible.checked;
      };

      // Cast shadows
      inspectorCastShadows.checked = obj.castShadows;
      inspectorCastShadows.oninput = () => {
        obj.castShadows = inspectorCastShadows.checked;
      };

      // Receive shadows
      inspectorReceiveShadows.checked = obj.receiveShadows;
      inspectorReceiveShadows.oninput = () => {
        obj.receiveShadows = inspectorReceiveShadows.checked;
      };

      var inspectorComponentsList = inspector.querySelector(".gameObjectComponents");
      removeChildren(inspectorComponentsList);

      for (const comp of obj.getComponents()) {
        const item = inspectorComponentsList.appendChild(win.document.createElement("li"));
        item.innerText = comp.constructor.name;
      }

      if (obj.meshRenderer) {
        const item = inspectorComponentsList.appendChild(win.document.createElement("li"));
        const nestedList = item.appendChild(win.document.createElement("ul"));

        const name = nestedList.appendChild(win.document.createElement("span"));
        name.textContent = obj.meshRenderer.constructor.name;

        const aabb = obj.meshRenderer.getAABB();

        const center = nestedList.appendChild(win.document.createElement("li"));
        center.textContent = "Center: " + Vector.toString(aabb.getCenter());

        const size = nestedList.appendChild(win.document.createElement("li"));
        size.textContent = "Size: " + Vector.toString(aabb.getSize());
      }

      if (obj.animationController) {
        const item = inspectorComponentsList.appendChild(win.document.createElement("li"));
        item.innerText = obj.animationController.constructor.name;
      }
    }

    function createTransformInput(obj) {
      const vectors = [
        { name: "Position", size: 3, prop: "position", worldProp: "worldPosition", default: Vector.zero() },
        { name: "Rotation", size: 4, prop: "rotation", worldProp: "worldRotation", default: Quaternion.identity() },
        { name: "Scale", size: 3, prop: "scale", worldProp: "worldScale", default: Vector.one() }
      ];
      const comps = ["x", "y", "z", "w"];
      const displayPrecision = 1e-4;
      const refreshRate = 1 / 20;

      for (let vector of vectors) {
        for (let i = 0; i < vector.size; i++) {
          let inp = win.document.querySelector(`.transform.local .vector.${vector.prop} .${comps[i]}`);
          inp.oninput = function(e) {
            if (obj && !isNaN(e.target.value)) {
              obj.transform[vector.prop][comps[i]] = e.target.value;
            }
          };

          const interval = setInterval(() => {
            if (inp === win.document.activeElement) {
              return;
            }

            inp.value = roundNearest(obj.transform[vector.prop][comps[i]], displayPrecision);
          }, refreshRate);
          intervals.push(interval);
        }
      }

      for (let vector of vectors) {
        for (let i = 0; i < vector.size; i++) {
          let inp = win.document.querySelector(`.transform.world .vector.${vector.prop} .${comps[i]}`);
          inp.setAttribute("disabled", "");

          const interval = setInterval(() => {
            inp.value = roundNearest(obj.transform[vector.worldProp][comps[i]], displayPrecision);
          }, refreshRate);
          intervals.push(interval);
        }
      }
    }

    function getDOMPath(element) {
      if (!hierarchy.contains(element)) {
        return null;
      }

      const path = [];

      const recursiveSearch = (element) => {
        if (element === hierarchy) {
          return;
        }

        const siblingIndex = [...element.parentNode.children].indexOf(element);
        path.push(siblingIndex);

        recursiveSearch(element.parentNode);
      };
      recursiveSearch(element);
      path.reverse();

      return path;
    }
  });
}

export default createInspector;