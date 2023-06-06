// Math

function smoothstep(x, edge0, edge1) {
  if (x < edge0) return 0;
  if (x >= edge1) return 1;

  x = (x - edge0) / (edge1 - edge0);
  return x * x * (3 - 2 * x);
}

function wrap(x, m) {
  return (x % m + m) % m;
}

function getAngleBetween(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function getDistanceBetween(ax, ay, bx, by) {
  var x = ax - bx;
  var y = ay - by;
  return Math.sqrt(x * x + y * y);
}

function xor(a, b) {
  return (a && !b) || (!a && b);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function saturate(t) {
  return clamp(t, 0, 1);
}

function lerp(x, y, a) {
  return x * (1 - a) + y * a;
}

function inverseLerp(a, b, t) {
  if (Math.abs(a - b) < 1e-6) {
    return 0;
  }
  return (t - a) / (b - a);
}

function roundNearest(value, nearest)  {
  return Math.round(value / nearest) * nearest;
}

function roundToPlaces(value, decimalPlaces) {
  var tenExp = Math.pow(10, decimalPlaces);
  var m = Number((Math.abs(value) * tenExp).toPrecision(15));
  return Math.round(m) / tenExp * Math.sign(value);
}

function mapValue(x, in_min, in_max, out_min, out_max) {
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

function isPowerOf2(value) {
  return (value & (value - 1)) == 0;
}

// Other

function randomFromArray(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function Float32ToFloat16(arr) {
  var newArr = new Uint16Array(arr.length);
  for (var i = 0; i < newArr.length; i++) {
    newArr[i] = toHalf(arr[i]);
  }
  return newArr;
}

var toHalf = (function() {

  var floatView = new Float32Array(1);
  var int32View = new Int32Array(floatView.buffer);

  /* This method is faster than the OpenEXR implementation (very often
   * used, eg. in Ogre), with the additional benefit of rounding, inspired
   * by James Tursa?s half-precision code. */
  return function toHalf(val) {

    floatView[0] = val;
    var x = int32View[0];

    var bits = (x >> 16) & 0x8000; /* Get the sign */
    var m = (x >> 12) & 0x07ff; /* Keep one extra bit for rounding */
    var e = (x >> 23) & 0xff; /* Using int is faster here */

    /* If zero, or denormal, or exponent underflows too much for a denormal
     * half, return signed zero. */
    if (e < 103) {
      return bits;
    }

    /* If NaN, return NaN. If Inf or exponent overflow, return Inf. */
    if (e > 142) {
      bits |= 0x7c00;
      /* If exponent was 0xff and one mantissa bit was set, it means NaN,
           * not Inf, so make sure we set one mantissa bit too. */
      bits |= ((e == 255) ? 0 : 1) && (x & 0x007fffff);
      return bits;
    }

    /* If exponent underflows but not too much, return a denormal */
    if (e < 113) {
      m |= 0x0800;
      /* Extra rounding may overflow and set mantissa to 0 and exponent
       * to 1, which is OK. */
      bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
      return bits;
    }

    bits |= ((e - 112) << 10) | (m >> 1);
    /* Extra rounding. An overflow will set mantissa to 0 and increment
     * the exponent, which is OK. */
    bits += m & 1;
    return bits;
  };

}());

function Uint8ToUint32(num) {
  return new DataView(Uint8Array.from(num).buffer).getInt32(0, true);
}

function Float32Concat(first, second) {
  var firstLength = first.length;
  var result = new Float32Array(firstLength + second.length);

  result.set(first);
  result.set(second, firstLength);

  return result;
}

function watchGlobal(name, handler = () => {}) {
  var _prop;
  Object.defineProperty(window, "kills", {
    get: function() {
      return _prop;
    },
    set: function(value) {
      _prop = value;
      handler();
    },
    enumerable: true,
    configurable: true
  });
}

function isMobile() {
  let check = false;
  (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
  return check;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function objectIsEmpty(obj) {
  return !obj || Object.keys(obj).length === 0;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.addEventListener('load', e => resolve(img));
    img.addEventListener('error', () => {
      reject(new Error(`Failed to load image's URL: ${url}`));
    });
    img.src = url;
  });
}

function getImagePixelData(image, width, height) {
  var canvas = document.createElement("canvas");
  canvas.width = width ?? image.width;
  canvas.height = height ?? image.height;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

// HTML helper

function removeChildren(parent) {
  while (parent.firstChild) {
    parent.firstChild.remove()
  }
}

function fadeOutElement(element) {
  element.classList.remove("fadeOut");
  element.classList.add("fadeOut");

  setTimeout(function() {
    element.classList.remove("fadeOut");
    hideElement(element);
  }, 400);
}

function hideElement(element) {
  element.classList.add("hidden");
}

function showElement(element) {
  element.classList.remove("hidden");
}

function resetAnimations(element) {
  element.style.animation = 'none';
  element.offsetHeight; /* trigger reflow */
  element.style.animation = null; 
}

function cloneTemplate(template) {
  return template.content.cloneNode(true);
}

function cloneCanvas(canvas, top = 0, left = 0) {
  var cc = document.body.appendChild(document.createElement("canvas"));
  cc.style = `
    position: fixed;
    top: ${top}px;
    left: ${left}px;
    z-index: 10000;
  `;
  cc.width = canvas.width;
  cc.height = canvas.height;
  var ctx = cc.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
}

function saveCanvasAsImage(canvas, name = "download") {
  var link = document.createElement('a');
  link.download = name + ".png";
  link.href = canvas.toDataURL()
  link.click();
}

function downloadURL(url, name = "download") {
  var link = document.createElement('a');
  link.download = name + ".png";
  link.href = url;
  link.click();
}

export {
  smoothstep,
  wrap,
  getAngleBetween,
  getDistanceBetween,
  xor,
  mod,
  clamp,
  saturate,
  lerp,
  inverseLerp,
  roundNearest,
  roundToPlaces,
  mapValue,
  isPowerOf2,
  randomFromArray,
  Float32ToFloat16,
  Uint8ToUint32,
  Float32Concat,
  watchGlobal,
  isMobile,
  sleep,
  objectIsEmpty,
  loadImage,
  getImagePixelData,
  removeChildren,
  fadeOutElement,
  hideElement,
  showElement,
  resetAnimations,
  cloneTemplate,
  cloneCanvas,
  saveCanvasAsImage,
  downloadURL
};