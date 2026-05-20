const { build } = require("./package.json")

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...build,
  win: {
    ...build.win,
    azureSignOptions: process.env.AZURE_PUBLISHER_NAME
      ? { ...build.win.azureSignOptions, publisherName: process.env.AZURE_PUBLISHER_NAME }
      : null,
  },
}
