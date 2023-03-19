function CreateHDR(data, width = 1024, height = 512, name = "new") {
  var enc = new TextEncoder();
  var header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
  var encodedHeader = enc.encode(header);

  var rgbeData = [];
  for (var i = 0; i < data.length; i += 4) {
    var r = data[i];
    var g = data[i + 1];
    var b = data[i + 2];
    rgbeData.push(...float2rgbe(r, g, b));
  }

  var output = new Uint8Array(encodedHeader.length + rgbeData.length);
  output.set(encodedHeader, 0);
  output.set(rgbeData, encodedHeader.length);

  downloadBlob(output, name + ".hdr", 'application/octet-stream');
}

function downloadBlob(data, fileName, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = window.URL.createObjectURL(blob);

  downloadURL(url, fileName);

  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function downloadURL(data, fileName) {
  const a = document.createElement('a')
  a.href = data
  a.download = fileName
  document.body.appendChild(a)
  a.style.display = 'none'
  a.click()
  a.remove()
}

function float2rgbe(red, green, blue) {
  var v = Math.max(red, green, blue);
  if (v < 1e-32) {
    return [0, 0, 0, 0];
  }
  else {
    var [frRet, e] = frexp(v);
    v = frRet * 256 / v;

    return [
      parseInt(red * v),
      parseInt(green * v),
      parseInt(blue * v),
      parseInt(e + 128)
    ];
  }
}

function frexp (arg) {
  //  discuss at: https://locutus.io/c/frexp/
  // original by: Oskar Larsson Högfeldt (https://oskar-lh.name/)

  arg = Number(arg)
  const result = [arg, 0]
  if (arg !== 0 && Number.isFinite(arg)) {
    const absArg = Math.abs(arg)
    // Math.log2 was introduced in ES2015, use it when available
    const log2 = Math.log2 || function log2 (n) { return Math.log(n) * Math.LOG2E }
    let exp = Math.max(-1023, Math.floor(log2(absArg)) + 1)
    let x = absArg * Math.pow(2, -exp)
    // These while loops compensate for rounding errors that sometimes occur because of ECMAScript's Math.log2's undefined precision
    // and also works around the issue of Math.pow(2, -exp) === Infinity when exp <= -1024
    while (x < 0.5) {
      x *= 2
      exp--
    }
    while (x >= 1) {
      x *= 0.5
      exp++
    }
    if (arg < 0) {
      x = -x
    }
    result[0] = x
    result[1] = exp
  }
  return result
}

async function LoadHDR(path, exposure = 1, gamma = 1) {
  return new Promise((resolve, reject) => {
    var oReq = new XMLHttpRequest();
    oReq.open("GET", path, true);
    oReq.responseType = "arraybuffer";

    oReq.onload = function (oEvent) {
      if (oReq.readyState != 4 || oReq.status != 200) {
        reject("[HDRReader]: " + oReq.status + " " + oReq.statusText);
        return;
      }

      // resolve({
      //   data: [],
      //   width: 100,
      //   height: 100
      // });
      // return;

      console.time("Load hdr");

      var arrayBuffer = oReq.response;
      if (arrayBuffer) {
        var pos = 0;
        var d8 = new Uint8Array(oReq.response);

        // read header.
        var header = '';
        while (!header.match(/\n\n[^\n]+\n/g)) header += String.fromCharCode(d8[pos++]);

        // check format. 
        var format = header.match(/FORMAT=(.*)$/m)[1];
        if (format != '32-bit_rle_rgbe') {
          this.onerror();
          return console.warn('unknown format : ' + format);
        }
        
        // parse resolution
        var rez = header.split(/\n/).reverse()[1].split(' ');
        var width = parseInt(rez[3]);
        var height = parseInt(rez[1]);
        
        // Create image.
        var img = new Uint8Array(width * height * 4); 
        var ipos = 0;
        
        // Read all scanlines
        for (var j = 0; j < height; j++) {
          var rgbe = d8.slice(pos, pos += 4);
          // var scanline = [];
          var scanline = new Array(width * 4);

          if (rgbe[0] != 2 || (rgbe[1] != 2) || (rgbe[2] & 0x80)) {
            var len = width;
            var rs = 0;
            pos -= 4;

            while (len > 0) {
              img.set(d8.slice(pos, pos += 4), ipos);

              if (img[ipos] == 1 && img[ipos + 1] == 1 && img[ipos + 2] == 1) {
                for (img[ipos + 3] << rs; i > 0; i--) {
                  img.set(img.slice(ipos - 4, ipos), ipos);
                  ipos += 4;
                  len--;
                }
                rs += 8;
              }
              else {
                len--;
                ipos += 4;
                rs = 0;
              }
            }
          }
          else {
            if ((rgbe[2] << 8) + rgbe[3] != width) {
              console.warn('HDR line mismatch ..')
              return;
            }

            for (var i = 0; i < 4; i++) {
              var ptr = i * width;
              var ptr_end = (i+1) * width;
              var count;

              while (ptr < ptr_end) {
                let buf0 = d8[pos];
                let buf1 = d8[pos + 1];
                pos += 2;

                if (buf0 > 128) {
                  count = buf0 - 128;
                  // while (count-- > 0) {
                  //   scanline[ptr++] = buf1;
                  // }
                  scanline.fill(buf1, ptr, ptr + count);
                  ptr += count;
                } 
                else {
                  count = buf0-1;
                  scanline[ptr++] = buf1;
                  while(count-- > 0) {
                    scanline[ptr++] = d8[pos++];
                  }
                }
              }
            }

            for (var i = 0; i < width; i++) {
              img[ipos++] = scanline[i];
              img[ipos++] = scanline[i + width];
              img[ipos++] = scanline[i + 2 * width];
              img[ipos++] = scanline[i + 3 * width];
            }
          }
        }

        console.timeEnd("Load hdr");

        resolve({
          data: img,
          width,
          height
        });

        // var pixelData = new Float32Array(width * height * 3);

        // var buffer = img;
        // var one_over_gamma = 1 / gamma;

        // // var highestBrightness = 0;
        // // var highestPixel;

        // for (var i = 0; i < width * height; i++) {
        //   var s = exposure * Math.pow(2,buffer[i*4+3]-(128+8));

        //   if (gamma !== 1) {
        //     pixelData[i*3]   = Math.pow(buffer[i*4]*s, one_over_gamma);
        //     pixelData[i*3+1] = Math.pow(buffer[i*4+1]*s, one_over_gamma);
        //     pixelData[i*3+2] = Math.pow(buffer[i*4+2]*s, one_over_gamma);
        //   }
        //   else {
        //     pixelData[i*3]   = buffer[i*4]*s
        //     pixelData[i*3+1] = buffer[i*4+1]*s
        //     pixelData[i*3+2] = buffer[i*4+2]*s
        //   }

        //   // var brightness = (pixelData[i*3] + pixelData[i*3+1] + pixelData[i*3+2]) / 3;
        //   // if (brightness > highestBrightness) {
        //   //   highestBrightness = brightness;
        //   //   highestPixel = [pixelData[i*3], pixelData[i*3 + 1], pixelData[i*3 + 2]];
        //   // }
        // }
        
        // console.timeEnd("Load hdr");

        // console.log("HDR loaded!", highestBrightness, highestPixel);

        // resolve({
        //   data: pixelData,
        //   width,
        //   height
        // });


      // resolve({
      //   data: img,
      //   width, height
      // });

      // var canvas = document.createElement("canvas");
      // canvas.width = width;
      // canvas.height = height;
      // canvas.style = `
      //   position: fixed;
      //   top: 0;
      //   left: 0;
      //   z-index: 10000;
      // `;
      // var ctx = canvas.getContext("2d");
      // var pixelData = new Float32Array();
      
      // var exposure = 1.5;
      // var gamma = 2.2;

      // var buffer = img;
      // var one_over_gamma = 1 / gamma;

      // for (var i = 0; i < width * height; i++) {
      //   var s = exposure * Math.pow(2,buffer[i*4+3]-(128+8));
      //   pixelData.data[i*4]  =255*Math.pow(buffer[i*4]*s,one_over_gamma);
      //   pixelData.data[i*4+1]=255*Math.pow(buffer[i*4+1]*s,one_over_gamma);
      //   pixelData.data[i*4+2]=255*Math.pow(buffer[i*4+2]*s,one_over_gamma);
      //   pixelData.data[i*4+3]=255;
      // }

      // ctx.putImageData(pixelData, 0, 0);

      // resolve(canvas.toDataURL());



        // var utf8decoder = new TextDecoder();
        // var byteArray = new Uint8Array(arrayBuffer);

        // var text = utf8decoder.decode(byteArray);

        // var width;
        // var height;

        // var startByte = null;

        // var i = 0;
        // while (i < byteArray.byteLength) {
        //   var last = i;

        //   var char = text.charAt(i);
        //   while (char != "\n") {
        //     i++;
        //     char = text.charAt(i);
        //   }

        //   var line = text.slice(last, i);
        //   var match = line.match(/\-Y ([0-9]*) \+X ([0-9]*)/);
        //   if (match != null) {
        //     width = parseInt(match[2]);
        //     height = parseInt(match[1]);
        //     startByte = i;
        //     break;
        //   }

        //   i++;
        // }

        // if (startByte != null) {
        //   console.log(width, height);

        //   console.log(byteArray.slice(startByte, byteArray.byteLength - 3));
        //   console.log(new Float32Array(byteArray.slice(startByte, byteArray.byteLength - 3).buffer));

        //   var canvas = document.body.appendChild(document.createElement("canvas"));
        //   canvas.width = width;
        //   canvas.height = height;
        //   canvas.style = `
        //     position: fixed;
        //     top: 0;
        //     left: 0;
        //     z-index: 10000;
        //   `;
        //   var ctx = canvas.getContext("2d");
        //   var pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
        //   var pi = 0;
        //   i = startByte - 1;
        //   while (i < byteArray.length) {
        //     var exponent = Math.pow(2, byteArray[i + 3]);
        //     pixelData.data[pi + 0] = (byteArray[i + 0] * exponent) / 1000;
        //     pixelData.data[pi + 1] = (byteArray[i + 1] * exponent) / 1000;
        //     pixelData.data[pi + 2] = (byteArray[i + 2] * exponent) / 1000;
        //     pixelData.data[pi + 3] = 255;

        //     pi += 4;
        //     i += 4;
        //   }

        //   ctx.putImageData(pixelData, 0, 0);
        // }
        // else {
        //   console.log("No start byte found!");
        // }
      }
    }

    oReq.send(null);
  });
}

export {
  CreateHDR,
  LoadHDR
};