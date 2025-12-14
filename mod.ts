export * from "./jelly/rdf.ts";

// import * as jelly from "./jelly/rdf.ts";

// const kv = await Deno.openKv(":memory:");

if (import.meta.main) {
  // TODO: e2e Oxigraph example.
  // Insert RDF/JS Quads into RDF/JS Store.
  // Encode RDF/JS Store to Jelly.
  // Store Jelly in Kv.
  // Read Jelly from Kv.
  // Decode Jelly to RDF/JS Store.
  // Query RDF/JS Store.
}

// export async function parseJellyStream(stream: ReadableStream<Uint8Array>) {
//   const reader = stream.getReader();
//
//   while (true) {
//     const { done, value } = await reader.read();
//     if (done) break;
//
//     // value is a Uint8Array, which the generated code now accepts natively
//     const row = RdfStreamRow.decode(value);
//     console.log(row);
//   }
// }
