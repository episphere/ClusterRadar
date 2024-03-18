import { spatialAutocorrelation } from "../autocorrelation/autocorrelation.js"

self.onmessage = event => {
  const data = event.data
  let clusterResults
  data.options.method = data.method
  //console.log(`[clusterWorker] JOB ${data.jobIndex} > Calculating for ${data.method}`)
  clusterResults = spatialAutocorrelation(data.spatialData, data.valueField, data.options)
  //console.log(`[clusterWorker] JOB ${data.jobIndex} < Finished for ${data.method}`)
  self.postMessage({jobIndex: data.jobIndex, clusterResults})
}