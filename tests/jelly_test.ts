import { assert } from "jsr:@std/assert";
import { DataFactory } from "npm:n3";
import { JellyStreamWriter } from "../jelly/stream_writer.ts";
import { JellyStreamParser } from "../jelly/stream_parser.ts";

const { quad, namedNode, literal, defaultGraph } = DataFactory;

Deno.test("Jelly Writer -> Parser Roundtrip", async () => {
  const writer = new JellyStreamWriter();
  const q1 = quad(
    namedNode("http://ex.org/s"),
    namedNode("http://ex.org/p"),
    literal("Hello Jelly"),
    defaultGraph(),
  );
  const q2 = quad(
    namedNode("http://ex.org/s"),
    namedNode("http://ex.org/p2"),
    literal("Another Value"),
    namedNode("http://ex.org/g"),
  );

  const chunks = [...writer.write(q1), ...writer.write(q2)];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const parser = new JellyStreamParser();
  const results = [];
  for await (const q of parser.parse(stream)) {
    results.push(q);
  }

  assert(results.length === 2);
  assert(results[0].subject.value === "http://ex.org/s");
  assert(results[0].object.value === "Hello Jelly");
  assert(results[1].graph.value === "http://ex.org/g");
});
