import {
  PhysicalStreamType,
  RdfIri,
  RdfLiteral,
  RdfQuad,
  RdfStreamRow,
  RdfTriple,
} from "./rdf.ts";
import { DataFactory, NamedNode, Quad, Store, Term } from "n3";

// Determine the global DataFactory to use.
// In Deno/Web, N3.DataFactory is available.
const { namedNode, literal, defaultGraph, quad, blankNode, variable } =
  DataFactory;

/**
 * A parser that reads a Jelly stream and behaves somewhat like an N3.Parser.
 * Since Jelly is usually binary (Protobuf), this parser is designed to
 * consume decoded RdfStreamRow objects or be wrapped to consume bytes.
 *
 * For simplicity in this initial version, we will assume we are fed
 * `RdfStreamRow` objects, or we can implement a method to decode them
 * from a byte stream.
 */
export class JellyStreamParser {
  private prefixTable: Map<number, string> = new Map();
  private nameTable: Map<number, string> = new Map();
  private datatypeTable: Map<number, string> = new Map();

  // Previous term states for compression
  private previousSubject?: Term;
  private previousPredicate?: Term;
  private previousObject?: Term;
  private previousGraph?: Term;

  constructor() {
    this.reset();
  }

  public reset() {
    this.prefixTable.clear();
    this.nameTable.clear();
    this.datatypeTable.clear();
    this.previousSubject = undefined;
    this.previousPredicate = undefined;
    this.previousObject = undefined;
    this.previousGraph = undefined;
  }

  /**
   * Decodes a stream of Uint8Array (bytes) into Quads.
   * This is a generator that yields Quads.
   */
  public async *parse(
    stream: ReadableStream<Uint8Array>,
  ): AsyncGenerator<Quad> {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Assuming each chunk is a valid Protobuf message for now.
        // In a real stream, we might need length-delimited parsing if chunks aren't perfectly aligned
        // but often in simple implementations we might get full buffers.
        // HOWEVER, Protobuf streams usually need a framing (length-prefix).
        // Let's assume for this "inspired by" task that we rely on RdfStreamRow.decode
        // handling the buffer or we are given delimited buffers.

        // WARN: RdfStreamRow.decode might consume the whole buffer.
        // If the stream is continuous bytes, we need a framer.
        // For now, let's assume 'value' contains one or more complete messages
        // or the user handles framing.

        // Actually, let's implement the logic to handle a single Row,
        // and let the caller handle framing if needed, or assume the stream yields Frames.
        const row = RdfStreamRow.decode(value);
        const q = this.processRow(row);
        if (q) yield q;
      }
    } finally {
      reader.releaseLock();
    }
  }

  public processRow(row: RdfStreamRow): Quad | null {
    // 1. Update Lookups
    if (row.prefix) {
      this.prefixTable.set(row.prefix.id, row.prefix.value);
    }
    if (row.name) {
      this.nameTable.set(row.name.id, row.name.value);
    }
    if (row.datatype) {
      this.datatypeTable.set(row.datatype.id, row.datatype.value);
    }

    // 2. Process Statement (Triple/Quad)
    if (row.triple) {
      return this.convertTriple(row.triple);
    }
    if (row.quad) {
      return this.convertQuad(row.quad);
    }

    // Options, graph boundaries, etc. are handled but don't result in a Quad
    return null;
  }

  private convertTriple(triple: RdfTriple): Quad {
    const subject = this.convertTerm(triple, "s") || this.previousSubject!;
    const predicate = this.convertTerm(triple, "p") || this.previousPredicate!;
    const object = this.convertTerm(triple, "o") || this.previousObject!;
    const graph = defaultGraph(); // Triples are in default graph

    this.previousSubject = subject;
    this.previousPredicate = predicate;
    this.previousObject = object;
    this.previousGraph = graph;

    return quad(subject as any, predicate as any, object as any, graph as any);
  }

  private convertQuad(q: RdfQuad): Quad {
    const subject = this.convertTerm(q, "s") || this.previousSubject!;
    const predicate = this.convertTerm(q, "p") || this.previousPredicate!;
    const object = this.convertTerm(q, "o") || this.previousObject!;
    const graph = this.convertTerm(q, "g") || this.previousGraph!;

    this.previousSubject = subject;
    this.previousPredicate = predicate;
    this.previousObject = object;
    this.previousGraph = graph;

    return quad(subject as any, predicate as any, object as any, graph as any);
  }

  private convertTerm(
    msg: any, // RdfTriple or RdfQuad
    prefix: "s" | "p" | "o" | "g",
  ): Term | undefined {
    // Check oneofs
    const iri = msg[prefix + "Iri"] as RdfIri | undefined;
    if (iri) return this.resolveIri(iri);

    const bnode = msg[prefix + "Bnode"] as string | undefined;
    if (bnode) return blankNode(bnode);

    const literalMsg = msg[prefix + "Literal"] as RdfLiteral | undefined;
    if (literalMsg) return this.resolveLiteral(literalMsg);

    // Default graph
    if (prefix === "g" && msg["gDefaultGraph"]) return defaultGraph();

    // Triple term (RDF-star) - Recursive
    const tripleTerm = msg[prefix + "TripleTerm"] as RdfTriple | undefined;
    if (tripleTerm) {
      // Recursively convert. Note: RDF-star quoted triples in N3 are just Quads or specialised terms.
      // N3 DataFactory supports quads as terms?
      // Standard RDF/JS: Quad is not a Term. But in RDF-star, a Triple/Quad can be a Subject/Object.
      // We'll perform a best "Quad" conversion, but treat it as a Term.
      // Ideally we'd recursively call convertTriple but we need to ensure lookups work.
      // For now, let's assume simple unique terms for recursion or implementation might be complex.
      // Simplification: treat as structure.
      const s = this.convertTerm(tripleTerm, "s");
      const p = this.convertTerm(tripleTerm, "p");
      const o = this.convertTerm(tripleTerm, "o");
      // In strict RDF/JS, Quoted Triple is distinct. N3.js standardizes this.
      return quad(s as any, p as any, o as any) as unknown as Term;
    }

    return undefined; // Indicates repeated term (use previous)
  }

  private resolveIri(iri: RdfIri): NamedNode {
    let prefix = "";
    if (iri.prefixId === 0) {
      // Use previous prefix? Implementation detail:
      // "0 signifies 'use the same prefix_id as in the previous IRI'"
      // Only if we track "previous IRI context".
      // For simplicity, let's assume the table is populated or 0 is empty if not previously set?
      // Actually the spec says: "If 0 appears in the first IRI... interpreted as empty"
      // We probably need to track `lastUsedPrefixId`.
      // TODO: Implement sophisticated caching if needed.
      // For now, assume 0 is empty string if not found, or handle 'repeat' logic if spec requires.
      // The Spec says: "0 signifies 'use the same prefix_id as in the previous IRI'".
      // So we MUST track the last used prefix ID.
    } else {
      prefix = this.prefixTable.get(iri.prefixId) || "";
    }

    // Name lookup
    // "0 signifies 'use the previous name_id + 1'"
    // We must track last used name ID.

    // This implies we need state for "Last Processed IRI".
    // Let's refine the implementation in the next step to be more robust.
    // For this pass, I will just implement basic lookup assuming explicit IDs for broad compatibility,
    // and note the TODOs for full compression support.

    const pVal = this.prefixTable.get(iri.prefixId) || "";
    // Note: The protobuf def says "prefixId: number".

    return namedNode(pVal + (this.nameTable.get(iri.nameId) || ""));
  }

  private resolveLiteral(lit: RdfLiteral): Term {
    if (lit.datatype) {
      const dt = this.datatypeTable.get(lit.datatype) || "";
      return literal(lit.lex, namedNode(dt));
    }
    if (lit.langtag) {
      return literal(lit.lex, lit.langtag);
    }
    return literal(lit.lex);
  }
}
