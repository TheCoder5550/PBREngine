const path = require("path");

module.exports = {
  entry: "./public/cardemo/main.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  mode: "production"
};