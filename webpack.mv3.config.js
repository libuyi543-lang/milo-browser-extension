const neutrino = require('neutrino')

const createNeutrinoConfig = require('./scripts/create-neutrino-config')
module.exports = neutrino(
  createNeutrinoConfig({
    manifestVersion: 3,
    browsers: ['chrome'],
    output: 'build/.tmp-mv3'
  })
).webpack()
