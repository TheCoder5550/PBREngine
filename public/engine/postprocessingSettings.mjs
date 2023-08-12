function PostProcessingSettings(settings = {}) {
  this.exposure = settings.exposure ?? 0;
  this.gamma = settings.gamma ?? 2.2;
  this.tonemapping = settings.tonemapping ?? PostProcessingSettings.TONEMAPPING.ACES;
  this.motionBlurStrength = settings.motionBlurStrength ?? 0.2;
  this.saturation = settings.saturation ?? 0;
  this.contrast = settings.contrast ?? 0;
  this.vignette = settings.vignette ?? new VignetteSettings();
  this.whiteBalance = settings.whiteBalance ?? new WhiteBalanceSettings();
}
PostProcessingSettings.TONEMAPPING = { NONE: 0, ACES: 1, REINHARD: 2 };

function WhiteBalanceSettings(settings = {}) {
  this.temperature = settings.temperature ?? 0;
  this.tint = settings.tint ?? 0;
}

function VignetteSettings(settings = {}) {
  this.amount = settings.amount ?? 0.2;
  this.falloff = settings.falloff ?? 0.3;
}

export {
  PostProcessingSettings,
  VignetteSettings
};