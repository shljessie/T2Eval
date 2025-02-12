import { useEffect, useRef } from "react";

export const useWorker = () => {
  const workerRef = useRef();

  useEffect(() => {
    // Initialize the worker when the component mounts
    workerRef.current = new Worker('./worker.js'); // Adjust the path to your `worker.js`

    workerRef.current.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'ready') {
        console.log("[Worker] Ready to process requests.");
      } else if (type === 'segment_result') {
        console.log("[Worker] Segment result:", data);
      } else if (type === 'decode_result') {
        console.log("[Worker] Decode result:", data);
      }
    };

    workerRef.current.onerror = (error) => {
      console.error("[Worker] Error:", error.message);
    };

    return () => {
      // Terminate the worker when the component unmounts
      workerRef.current.terminate();
    };
  }, []);

  // Send a message to the worker
  const postMessage = (message) => {
    if (workerRef.current) {
      workerRef.current.postMessage(message);
    }
  };

  return postMessage;
};
