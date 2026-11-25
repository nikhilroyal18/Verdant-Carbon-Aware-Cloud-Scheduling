import { runExperiment } from './engine.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ result: runExperiment(data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
