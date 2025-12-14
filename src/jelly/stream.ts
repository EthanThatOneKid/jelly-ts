import { RdfStreamRow } from "./rdf";

export async function parseJellyStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // value is a Uint8Array, which the generated code now accepts natively
    const row = RdfStreamRow.decode(value);
    console.log(row);
  }
}
