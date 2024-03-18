import { calculateEqualContiguousWeightTuples } from "../autocorrelation/autocorrelation.js"
import { findNeighbors } from "../autocorrelation/neighbors.js"


self.onmessage = event => {
  console.log("[weightWorker] Calculating equal, contiguous weights")
  const data = event.data
  const weightTuples = calculateEqualContiguousWeightTuples(data.featureCollection, data.method)
  self.postMessage(weightTuples)
}

// self.onmessage = event => {
//   console.log("[weightWorker]", event)
//   self.postMessage("Done!")
// }