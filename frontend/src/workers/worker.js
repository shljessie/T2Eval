/* eslint-disable no-restricted-globals */
import { AutoProcessor, RawImage, SamModel, Tensor, env } from "@xenova/transformers";

env.allowLocalModels = false;

class SegmentAnythingSingleton {
  static model_id = "Xenova/slimsam-77-uniform";
  static model;
  static processor;
  static quantized = true;

  static async getInstance() {
    if (!this.model) {
      console.log("[SAM] Loading model...");
      this.model = await SamModel.from_pretrained(this.model_id, {
        quantized: this.quantized,
      });
      console.log("[SAM] Model loaded!");
    }
    if (!this.processor) {
      console.log("[SAM] Loading processor...");
      this.processor = await AutoProcessor.from_pretrained(this.model_id);
      console.log("[SAM] Processor loaded!");
    }
    return [this.model, this.processor];
  }
}

// State variables
let image_embeddings = null;
let image_inputs = null;
let ready = false;

self.onmessage = async (e) => {
  try {
    const [model, processor] = await SegmentAnythingSingleton.getInstance();
    const { type, data } = e.data;

    if (type === "startWorker") {
      if (!ready) {
        // Indicate that we are ready to accept requests
        ready = true;
        self.postMessage({
          type: "ready",
        });
      }
    } else if (type === "reset") {
      image_inputs = null;
      image_embeddings = null;
    } else if (type === "segment") {
      console.log("Received Segmenting image signal from Image Upload...");
      self.postMessage({
        type: "segment_result",
        data: "start",
      });

      // Read the image and compute embeddings
      console.log("Reading image...", e.data.preview);
      const image = await RawImage.read(e.data.preview);
      image_inputs = await processor(image);
      image_embeddings = await model.get_image_embeddings(image_inputs);

      console.log("Image embeddings:", image_embeddings);

      // Check embeddings
      if (
        !image_embeddings ||
        !image_embeddings.image_embeddings ||
        !image_embeddings.image_positional_embeddings
      ) {
        throw new Error("Image embeddings or positional embeddings are missing or invalid.");
      }

      self.postMessage({
        type: "segment_result",
        data: "done",
      });
    } else if (type === "decode") {
      console.log("Received Decoding signal from Image Upload...");

      if (!image_embeddings) {
        throw new Error("Image embeddings are not ready. Please segment the image first.");
      }

      // Validate inputs
      if (!image_embeddings.image_embeddings || !image_embeddings.image_positional_embeddings) {
        throw new Error("Invalid image embeddings or positional embeddings.");
      }

      const reshaped = image_inputs.reshaped_input_sizes[0]; // Get reshaped input sizes

      // Extract points and labels
      const embeddingData = Array.from(image_embeddings.image_embeddings.data); // Convert tensor data to array
      const maxPoints = 1000; // Cap the number of points
      const points = embeddingData.map((x, idx) => {
        if (idx % 2 === 0) {
          return [x * reshaped[1], embeddingData[idx + 1] * reshaped[0]];
        }
        return null;
      }).filter(Boolean).slice(0, maxPoints);

      // eslint-disable-next-line no-undef
      const labels = new Array(points.length).fill(BigInt(1)); // Default label for decoding

      // Create input tensors
      const input_points = new Tensor(
        "float32",
        points.flat(),
        [1, 1, points.length, 2]
      );

      const input_labels = new Tensor(
        "int64",
        labels,
        [1, 1, labels.length]
      );

      console.log("[Decode] Input points:", input_points);
      console.log("[Decode] Input labels:", input_labels);

      console.log(
        "Input Points Shape:",
        input_points.dims || input_points.shape || "Unknown"
      );
      console.log(
        "Input Labels Shape:",
        input_labels.dims || input_labels.shape || "Unknown"
      );
      console.log(
        "Image Embeddings Shape:",
        image_embeddings.image_embeddings.dims || image_embeddings.image_embeddings.shape || "Unknown"
      );
      console.log(
        "Image Positional Embeddings Shape:",
        image_embeddings.image_positional_embeddings.dims || image_embeddings.image_positional_embeddings.shape || "Unknown"
      );

      // Generate the mask
      const outputs = await model({
        ...image_embeddings,
        input_points,
        input_labels,
      });

      console.log("[Decode] Model outputs:", outputs);

      // Post-process the mask
      const masks = await processor.post_process_masks(
        outputs.pred_masks,
        image_inputs.original_sizes,
        image_inputs.reshaped_input_sizes
      );

      console.log("[Decode] Post processed masks:", masks);

      // Send the result back to the main thread
      self.postMessage({
        type: "decode_result",
        data: {
          mask: RawImage.fromTensor(masks[0][0]),
          scores: outputs.iou_scores.data,
        },
      });
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error("Error in worker:", error);
    self.postMessage({
      type: "error",
      message: error.message,
    });
  }
};
