function BloomSettings(settings = {}) {
  this.sampleScale = settings.sampleScale ?? 1;
  this.threshold = settings.threshold ?? 1;
  this.knee = settings.knee ?? 0.5;
  this.clamp = settings.clamp ?? 100;
  this.intensity = settings.intensity ?? 0.05;
}

export {
  BloomSettings
};