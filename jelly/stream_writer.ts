import {
  LogicalStreamType,
  PhysicalStreamType,
  RdfDatatypeEntry,
  RdfIri,
  RdfLiteral,
  RdfNameEntry,
  RdfPrefixEntry,
  RdfQuad,
  RdfStreamOptions,
  RdfStreamRow,
  RdfTriple,
} from "./rdf.ts";
import { Literal, NamedNode, Quad, Term } from "n3";

/**
 * A writer that consumes RDF/JS Quads and produces a Jelly stream (Uint8Array chunks).
 */
export class JellyStreamWriter {
  private prefixTable: Map<string, number> = new Map();
  private nameTable: Map<string, number> = new Map();
  private datatypeTable: Map<string, number> = new Map();

  private prefixCounter = 1;
  private nameCounter = 1;
  private datatypeCounter = 1;

  private optionsSent = false;
  private options: RdfStreamOptions;

  constructor(options?: Partial<RdfStreamOptions>) {
    this.options = {
      streamName: options?.streamName || "Jelly-TS Stream",
      physicalType: options?.physicalType ||
        PhysicalStreamType.PHYSICAL_STREAM_TYPE_QUADS,
      generalizedStatements: options?.generalizedStatements || false,
      rdfStar: options?.rdfStar || false,
      maxNameTableSize: options?.maxNameTableSize || 128,
      maxPrefixTableSize: options?.maxPrefixTableSize || 128,
      maxDatatypeTableSize: options?.maxDatatypeTableSize || 64,
      logicalType: options?.logicalType ||
        LogicalStreamType.LOGICAL_STREAM_TYPE_UNSPECIFIED,
      version: 1,
    };
  }

  /**
   * Encodes a single Quad into a Jelly RdfStreamRow byte array.
   * If this is the first call, it prepends the StreamOptions.
   * Note: This simple implementation might output multiple rows if lookups are added.
   * Returns an array of buffers (one for options/lookups, one for the row).
   */
  public write(quad: Quad): Uint8Array[] {
    const buffers: Uint8Array[] = [];

    // Send options if strictly first
    if (!this.optionsSent) {
      const row = { options: this.options };
      buffers.push(RdfStreamRow.encode(row).finish());
      this.optionsSent = true;
    }

    // Prepare lookup updates
    const lookupRows: RdfStreamRow[] = [];

    // Helper to ensure components are in tables
    const ensureIri = (term: NamedNode) => {
      // Split IRI into prefix and name? Simplified: Empty prefix, full name.
      // Or: just put whole string in name table for now.
      // Optimization: Heuristic splitting.
      const val = term.value;
      if (!this.nameTable.has(val)) {
        const id = this.nameCounter++;
        this.nameTable.set(val, id);
        lookupRows.push({ name: { id, value: val } });
      }
      return { prefixId: 0, nameId: this.nameTable.get(val)! };
    };

    const ensureDatatype = (val: string) => {
      if (!this.datatypeTable.has(val)) {
        const id = this.datatypeCounter++;
        this.datatypeTable.set(val, id);
        lookupRows.push({ datatype: { id, value: val } });
      }
      return this.datatypeTable.get(val)!;
    };

    // Convert terms
    // We need to capture the side-effects (lookup updates) before creating the Quad row.
    // ...
    // Actually, `ensureIri` pushes to `lookupRows`. So we can generate the Quad row structure,
    // and then prepend any lookup rows generated during the process.

    // We have to be careful about the 's', 'p', 'o', 'g' processing order if we use stateful compression (0 IDs).
    // Our `ensureIri` currently returns explicit IDs, so order doesn't matter for correctness of *this* row.

    // ... logic to build RdfQuad ...
    const rdfQuad: RdfQuad = {
      sIri: quad.subject.termType === "NamedNode"
        ? ensureIri(quad.subject as NamedNode)
        : undefined,
      sBnode: quad.subject.termType === "BlankNode"
        ? quad.subject.value
        : undefined,
      sLiteral: undefined, // Generalized RDF not supported in this basic block check
      sTripleTerm: undefined, // RDF-star todo

      pIri: quad.predicate.termType === "NamedNode"
        ? ensureIri(quad.predicate as NamedNode)
        : undefined,

      oIri: quad.object.termType === "NamedNode"
        ? ensureIri(quad.object as NamedNode)
        : undefined,
      oBnode: quad.object.termType === "BlankNode"
        ? quad.object.value
        : undefined,
      oLiteral: quad.object.termType === "Literal"
        ? this.convertLiteral(quad.object as Literal, ensureDatatype)
        : undefined,

      gIri: quad.graph.termType === "NamedNode"
        ? ensureIri(quad.graph as NamedNode)
        : undefined,
      gBnode: quad.graph.termType === "BlankNode"
        ? quad.graph.value
        : undefined,
      gDefaultGraph: (quad.graph.termType === "DefaultGraph") ? {} : undefined,
    };

    // Encode lookup rows
    for (const r of lookupRows) {
      buffers.push(RdfStreamRow.encode(r).finish());
    }

    // Encode quad row
    const quadRow: RdfStreamRow = { quad: rdfQuad };
    buffers.push(RdfStreamRow.encode(quadRow).finish());

    return buffers;
  }

  private convertLiteral(
    lit: Literal,
    ensureDatatype: (dt: string) => number,
  ): RdfLiteral {
    const res: RdfLiteral = { lex: lit.value };
    if (lit.language) {
      res.langtag = lit.language;
    } else if (
      lit.datatype &&
      lit.datatype.value !== "http://www.w3.org/2001/XMLSchema#string"
    ) {
      res.datatype = ensureDatatype(lit.datatype.value);
    }
    return res;
  }
}
