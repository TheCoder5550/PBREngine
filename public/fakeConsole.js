function FakeConsole(side = "right", size = 600) {
  var _size = size;
  var _side = side;
  
  createCSSClass("hidden", "display: none !important;");
  
  var consoleWindow = document.body.appendChild(document.createElement("div"));
  consoleWindow.classList.add("fakeConsole");
  
  var sizeHandle = document.createElement("div");
  sizeHandle.innerText = "||";
  sizeHandle.style = `
    background: #eee;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  consoleWindow.style = `
    position: fixed;
    background: white;
    border: 1px solid gray;
    font-family: monospace;
    overflow: hidden;
    display: flex;
    z-index: 10000000;
  `;
  
  var commandsList = document.createElement("div");
  commandsList.style = `
    width: 100%;
    height: 100%;
    overflow: auto;
  `;
  
  setSide(side);
  
  var inputDiv = commandsList.appendChild(document.createElement("div"));
  inputDiv.style = `
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
  `;
  
  var arrow = inputDiv.appendChild(document.createElement("div"));
  arrow.style = `
    color: rgb(70, 70, 255);
    font-weight: bold;
    padding: 0.5em;
    font-size: 1.1em;
  `;
  arrow.innerText = ">";
  
  var jsInput = inputDiv.appendChild(document.createElement("textarea"));
  jsInput.setAttribute("oninput", 'this.style.height = "";this.style.height = this.scrollHeight + 5 + "px"');
  jsInput.setAttribute("autocomplete", "off");
  jsInput.setAttribute("autocorrect", "off");
  jsInput.setAttribute("autocapitalize", "off");
  jsInput.setAttribute("spellcheck", "false");
  jsInput.setAttribute("placeholder", "Enter command...");
  jsInput.style = `
    flex: 1;
    resize: none;
    padding: 0.5em;
    box-sizing: border-box;
    border: none;
    outline: none;
  `;
  jsInput.addEventListener("keydown", commandInputEvent);
  consoleWindow.addEventListener("click", function(e) {
    if (e.target == commandsList || e.target == inputDiv) {
      jsInput.focus();
    }
  });
  
  var isHidden = false;
  var isDragging = false;
  
  var LOGTYPE = {
    LOG: 0,
    WARNING: 1,
    ERROR: 2
  }
  
  var commandHistoryLocation = "com.TC5550.FakeConsole.history";
  var commandHistory = getHistory(commandHistoryLocation);
  var currentHistoryItem = -1;
  
  var timers = {};
  
  sizeHandle.addEventListener("mousedown", e => {
    isDragging = true;
  });
  sizeHandle.addEventListener("touchstart", e => {
    isDragging = true;
  });
  document.addEventListener("mouseup", e => {
    isDragging = false;
  })
  document.addEventListener("touchend", e => {
    isDragging = false;
  })
  
  document.addEventListener("mousemove", e => {
    updateConsoleSize({x: e.clientX, y: e.clientY});
  });
  
  document.addEventListener("touchmove", e => {
    updateConsoleSize({x: e.touches[0].clientX, y: e.touches[0].clientY});
  });
  
  document.addEventListener("selectstart", e => {
    if (isDragging) {
      e.preventDefault();
    }
  });
  
  function updateConsoleSize(mousePos) {
    if (isDragging) {
      var s = 0;
      if (side == "right") s = window.innerWidth - mousePos.x;
      else if (side == "left") s = mousePos.x;
      else if (side == "bottom") s = window.innerHeight - mousePos.y;
      else if (side == "top") s = mousePos.y;
      size = Math.max(200, s);
      
      var prop = (side == "right" || side == "left") ? "width" : "height";
      consoleWindow.style[prop] = size + "px";
    }
  }
  
  this.setSide = setSide;
  function setSide(s) {
    side = s;
    
    if (consoleWindow.contains(sizeHandle)) consoleWindow.removeChild(sizeHandle);
    if (consoleWindow.contains(commandsList)) consoleWindow.removeChild(commandsList);
    
    if (side == "right" || side == "bottom") {
      consoleWindow.appendChild(sizeHandle);
      consoleWindow.appendChild(commandsList);
    }
    else {
      consoleWindow.appendChild(commandsList);
      consoleWindow.appendChild(sizeHandle);
    }
    
    if (side == "right" || side == "left") {
      consoleWindow.style.width = size + "px";
      consoleWindow.style.height = "";
      consoleWindow.style.maxWidth = "100%";
      consoleWindow.style.maxHeight = "";
      consoleWindow.style.top = "0";
      consoleWindow.style.bottom = "0";
      consoleWindow.style.left = "";
      consoleWindow.style.right = "";
      consoleWindow.style[side] = "0";
      consoleWindow.style.flexDirection = "row";

      sizeHandle.style.width = "15px";
      sizeHandle.style.height = "100%";
    }
    else if (side == "bottom" || side == "top") {
      consoleWindow.style.width = "";
      consoleWindow.style.height = size + "px";
      consoleWindow.style.maxWidth = "";
      consoleWindow.style.maxHeight = "100%";
      consoleWindow.style.top = "";
      consoleWindow.style.bottom = "";
      consoleWindow.style.left = "0";
      consoleWindow.style.right = "0";
      consoleWindow.style[side] = "0";
      consoleWindow.style.flexDirection = "column";

      sizeHandle.style.height = "15px";
      sizeHandle.style.width = "100%";
    }
    
    sizeHandle.style.border = "none";
    sizeHandle.style["border" + capitalizeFirstLetter(side)] = "1px solid gray";
  }
  
  this.open = function() {
    isHidden = false;
    setHiddenClass();
  }
  
  this.close = function() {
    isHidden = true;
    setHiddenClass();
  }
  
  this.toggle = function() {
    isHidden = !isHidden;
    setHiddenClass();
  }
  
  document.addEventListener("keydown", e => {
    if (e.target != jsInput && e.shiftKey && e.keyCode == 73) {
      this.toggle();
    }
  });
  
  function setHiddenClass() {
    if (isHidden) {
      consoleWindow.classList.add("hidden");
    }
    else {
      consoleWindow.classList.remove("hidden");
    }
  }
  
  function createCSSClass(className, styleContent) {
    var style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = `.${className}{${styleContent}}`;
    document.getElementsByTagName('head')[0].appendChild(style);
    return style;
  }
  
  this.deleteCommandHistory = function() {
    commandHistory = [];
    localStorage.removeItem(commandHistoryLocation);
  }
  
  function getHistory(location) {
    var stored = localStorage.getItem(location);
    if (typeof stored == "undefined" || stored == null) {
      return [];
    }
    
    var output = [];
    try {
      output = JSON.parse(stored);
    }
    catch(e) {
      console.warn("[FakeConsole] Can't load command history: JSON.parse failed");
    }
    
    return output;
  }
  
  function runCommand(cmd) {
    if (typeof cmd == "string") {
      currentHistoryItem = -1;
      
      if (cmd != commandHistory[0]) {
        commandHistory.unshift(cmd);
        if (commandHistory.length > 100) {
          commandHistory.pop();
        }
        localStorage.setItem(commandHistoryLocation, JSON.stringify(commandHistory));
      }

      console.log(eval(cmd));
    }
    else {
      throw new Error("[FakeConsole] Can't run command: Not a string");
    }
  }
  
  function commandInputEvent(e) {
    if (e.keyCode == 13 && !e.shiftKey) {
      e.preventDefault();
      
      if (jsInput.value.replace(/\s/g, '').length > 0) {
        var val = jsInput.value;
        jsInput.value = "";
        runCommand(val);
      }
    }
    
    if (e.ctrlKey) {
      if (e.keyCode == 38) {
        changeHistoryItem(e, 1);
      }
      if (e.keyCode == 40 && currentHistoryItem >= 0) {
        changeHistoryItem(e, -1);
      }
    }
  }
  
  function changeHistoryItem(e, delta) {
    if (commandHistory.length > 0) {
      currentHistoryItem += delta;
      
      if (currentHistoryItem == -1) {
        jsInput.value = "";
      }
      else {
        currentHistoryItem = clamp(currentHistoryItem, 0, commandHistory.length - 1);
        jsInput.value = commandHistory[currentHistoryItem];
      }
      
      jsInput.style.height = "";
      jsInput.style.height = jsInput.scrollHeight + 5 + "px";
    }
    e.preventDefault();
  }
  
  function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }
  
  function formatString(str) {
    return `<span style="color:green;">"${escapeHtml(str)}"</span>`;
  }
  
  function formatObject(obj, maxDepth = 5) {
    var cache = [];
    cache.push(obj);
    return _formatObject(obj);
    
    function _formatObject(obj, depth = 0) {
      function getPropStrings(props) {
        var propStrings = [];
        for (var prop of props) {
          var stringVal = `<span style="color:#ff00d4;font-weight:bold;">${prop}: </span>`;
          var val = null;
          try {
            val = obj[prop]?.catch?.(e => {}) ?? obj[prop];
          }
          catch(e) {
            stringVal += `[${e.toString()}]`;
            propStrings.push(stringVal);
            continue;
          }

          if (val != null && typeof val == "object") {
            if (!cache.includes(val)) {
              if (depth < maxDepth) {
                cache.push(val);
                stringVal = createDrawer(stringVal + `<i>${val.constructor.name}</i>`, _formatObject(val, depth + 1));
              }
              else {
                stringVal += `<i>${val?.constructor.name}</i> [MAX-DEPTH REACHED]`;
              }
            }
            else {
              stringVal += `<i>${val?.constructor.name}</i> [CIRCULAR]`;
            }
          }
          else {
            if (val == null && typeof val == "object") {
              stringVal += "null";
            }
            else if (typeof val == "undefined") {
              stringVal += "undefined";
            }
            else if (typeof val == "string") {
              stringVal += formatString(val);
            }
            else {
              try {
                stringVal += val?.toString();
              }
              catch(e) {
                stringVal += "[ERROR]";
              }
            }
          }

          propStrings.push(stringVal);
        }
        
        return propStrings;
      }
      
      var visibleProps = [];
      for (var prop in obj) {
        visibleProps.push(prop);
      }
      var allProps = getAllProperties(obj);
      var hiddenProps = allProps.filter((el) => !visibleProps.includes(el));
      
      var visiblePropStrings = getPropStrings(visibleProps);
      var hiddenPropStrings = createDrawer("Hidden properties", `    ` + getPropStrings(hiddenProps).join(",\n    "));
      
      return `{\n    ${visiblePropStrings.join(",\n    ")}` + (hiddenPropStrings.length > 0 ? (visiblePropStrings.length > 0 ? `\n\n    ` : "") + `${hiddenPropStrings}` : "") + `\n}`;
    }
  }
  
  function pre(content) {
    return "<pre style='vertical-align: text-top; margin: 0; white-space: pre-wrap;'>" + content + "</pre>";
  }
  
  function createDrawer(title, content) {
    return `<details style="display: inline-block;"><summary style="cursor: pointer;">${title}</summary>${pre(content)}</details>`;
  }
  
  function formatLogData(data) {
    if (data == null && typeof data == "object") {
      return pre("null");
    }
    else if (typeof data == "undefined") {
      return pre("undefined");
    }
    // else if (Array.isArray(data)) {
    //   var arr = data.toString().slice(0, 20) + (data.toString().length > 21 ? "..." : "");
    //   return createDrawer(`<i>${data.constructor.name}</i> [${arr}]`, JSON.safeStringify(data));
    // }
    else if (typeof data == "object" && data != null) {
      return pre(createDrawer(`<i>${data.constructor.name}</i>`, formatObject(data)));
    }
    // else if (typeof data == "string") {
    //   return pre(escapeHtml(data));
    // }
    
    return pre(data);
  }
  
  function padNumber(n, len) {
    var nLen = n.toString().split("").length;
    if (nLen < len) {
      return "0".repeat(len - nLen) + n;
    }
    
    return n.toString();
  }
  
  function getTime() {
    var date = new Date();
    var hours = padNumber(date.getHours(), 2);
    var minutes = padNumber(date.getMinutes(), 2);
    var seconds = padNumber(date.getSeconds(), 2);
    var millis = padNumber(date.getMilliseconds(), 3);
    return hours + ":" + minutes + ":" + seconds + "." + millis;
  }
  
  function log(data, type = LOGTYPE.LOG, place = getLine()) {
    var item = commandsList.insertBefore(document.createElement("div"), inputDiv);
    var timeDiv = item.appendChild(document.createElement("div"));
    var dataDiv = item.appendChild(document.createElement("div"));
    var lineA = dataDiv.appendChild(document.createElement("a"));
    var dataSpan = dataDiv.appendChild(document.createElement("span"));
    
    timeDiv.innerText = getTime();
    dataSpan.innerHTML = data;
    lineA.innerText = place;
    lineA.href = "#";
    
    var logColors = ["white", "#FFFBE5", "#FFF0F0"];
    var borderColors = ["lightgray", "#FFF5C2", "#FFD6D6"];
    var dataColors = ["black", "brown", "red"];
    
    item.style = `
      width: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: row;
      border-bottom: 1px solid ${borderColors[type]};
      background: ${logColors[type]};
    `;
    
    timeDiv.style = `
      padding: 0.5em;
      color: gray;
    `;
    
    dataDiv.style = `
      flex: 1;
      padding: 0.5em;
    
      overflow-wrap: break-word;
      word-break: break-all;
      hyphens: auto;
      white-space: normal;
      
      color: ${dataColors[type]};
    `;
    
    lineA.style = `
      color: gray;
      float: right;
    `;
  }
  
  function multiArgLog(logs, type, place) {
    var output = [];
    for (var i = 0; i < logs.length; i++) {
      output.push(formatLogData(logs[i]));
    }
    log(output.join(""), type, place);
  }
  
  function extendFunction(parent, func, extFunc) {
    var oldF = parent[func];
    parent[func] = extendF;
    function extendF() {
      oldF.call(parent, ...arguments);
      extFunc(...arguments);
    }
    
    return oldF;
  }
  
  JSON.safeStringify = (obj, indent = 2) => {
    let cache = [];
    const retVal = JSON.stringify(obj, (key, value) => typeof value === "object" && value !== null ? cache.includes(value) ? undefined : cache.push(value) && value : value, indent);
    cache = null;
    return retVal;
  };
  
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  
  function getAllProperties(obj) {
    var allProps = [];
    var curr = obj;
    do {
      var props = Object.getOwnPropertyNames(curr)
      props.forEach(function(prop){
        if (allProps.indexOf(prop) === -1)
          allProps.push(prop)
      })
    } while(curr = Object.getPrototypeOf(curr))
      return allProps
  }
  
  function getErrorObject() {
    try {
      throw Error('');
    }
    catch(err) {
      return err;
    }
  }
  
  function getLine() {
    var err = getErrorObject();
    var lines = err.stack.split("at");
    var line = lines[lines.length - 1];
    var split = line.split("/");
    return split[split.length - 1];
  }
  
  function capitalizeFirstLetter(string) {
    return string[0].toUpperCase() + string.slice(1);
  }
  
  console.logOld = extendFunction(console, "log", function() {
    multiArgLog([...arguments], LOGTYPE.LOG);
  });
  
  console.infoOld = extendFunction(console, "info", function() {
    multiArgLog([...arguments], LOGTYPE.LOG);
  });
  
  console.warnOld = extendFunction(console, "warn", function() {
    multiArgLog([...arguments], LOGTYPE.WARNING);
  });
  
  console.errorOld = extendFunction(console, "error", function() {
    multiArgLog([...arguments], LOGTYPE.ERROR);
  });
  
  console.assertOld = extendFunction(console, "assert", function(condition, ...data) {
    if (!condition) {
      multiArgLog(["Assertion failed", ...data], LOGTYPE.ERROR);
    }
  });
  
  console.timeOld = extendFunction(console, "time", function(label) {
    if (!timers.hasOwnProperty(label)) {
      timers[label] = performance.now();
    }
    else {
      log(`Timer '${label}' already exists`, LOGTYPE.WARNING);
    }
  });
  
  console.timeEndOld = extendFunction(console, "timeEnd", function(label) {
    var time = performance.now() - timers[label];
    if (timers.hasOwnProperty(label)) {
      log(`${label}: ${time} ms`, LOGTYPE.LOG);
      delete timers[label];
    }
    else {
      log(`Timer '${label}' does not exist`, LOGTYPE.WARNING);
    }
  });
  
  window.onerror = function(message, url, line, col, error) {
    multiArgLog([message, createDrawer("<i>" + error.constructor.name + "</i>", formatLogData(escapeHtml(error.stack.toString())))], LOGTYPE.ERROR, url + ":" + (line ?? -1));
  }
  
  window.onunhandledrejection = function(e) {
    multiArgLog([e.reason.toString(), e], LOGTYPE.ERROR);
  }

  this.checkScript = function(src) {
    fetch(src).then(response => response.text()).then((data) => {
      try {
        eval(data);
      }
      catch(e) {
        console.error("Error in script:", src, "<br>", e.message);
      }
    });
  }

  this.scanScripts = function() {
    for (var script of document.querySelectorAll("script")) {
      if (script.src) {
        fc.checkScript(script.src);
      }
    }
  }
}