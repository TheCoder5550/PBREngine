function AnimationData(name = "Unnamed animation", data = [], len) {
  this.name = name;
  this.data = data;
  this.speed = 1;

  if (len == undefined) {
    if (this.data.length > 0) {
      var longestTime = 0;
      for (var channel of this.data) {
        var currentMaxTime = channel.inputBuffer[channel.inputBuffer.length - 1];
        if (currentMaxTime > longestTime) {
          longestTime = currentMaxTime;
        }
      }

      this.length = longestTime;
    }
    else {
      this.length = 4;
    }
  }
  else {
    this.length = len;
  }

  this.copy = function() {
    var newData = [];
    for (var d of this.data) {
      newData.push({...d});
    }

    var newAnim = new AnimationData(this.name + " (Copy)", newData, this.length);
    newAnim.speed = this.speed;
    return newAnim;
  };

  this.transfer = function(oldParent, newParent) {
    for (var d of this.data) {
      d.target = newParent.getChild(d.target.name, true);

      // var path = d.target.getHierarchyPath(oldParent);
      // d.target = newParent.getChildFromHierarchyPath(path);
    }
  };
}

export {
  AnimationData
};