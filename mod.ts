export * from "./jelly/rdf.ts";
export * from "./jelly/stream_parser.ts";
export * from "./jelly/stream_writer.ts";

import { JellyStreamWriter } from "./jelly/stream_writer.ts";
import { JellyStreamParser } from "./jelly/stream_parser.ts";
import { DataFactory } from "n3";

const { quad, namedNode, literal, defaultGraph } = DataFactory;

if (import.meta.main) {
  // Example Flow
  console.log("Running Jelly-TS Example...");

  const writer = new JellyStreamWriter();
  const q1 = quad(
    namedNode("http://ex.org/s"),
    namedNode("http://ex.org/p"),
    literal("Hello Jelly"),
    defaultGraph(),
  );

  const chunks = writer.write(q1);
  console.log(`Encoded ${chunks.length} chunks.`);

  // Pipe to parser
  // Simulate stream
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const parser = new JellyStreamParser();
  console.log("Decoding...");
  for await (const q of parser.parse(stream)) {
    console.log(
      "Decoded Quad:",
      q.subject.value,
      q.predicate.value,
      q.object.value,
    );
  }
}
