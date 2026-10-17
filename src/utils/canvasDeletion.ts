import type { Edge, Node } from "@xyflow/react";

interface Removal<N extends Node, E extends Edge> {
  nodes: N[];
  edges: E[];
}

// Tables are deleted from their menu only. React Flow's delete key would take
// a selected table with every relation attached to it, and a box selection
// marks those relations selected too: none of them goes with the key.
export function removableByKey<N extends Node, E extends Edge>({
  nodes,
  edges,
}: Removal<N, E>): Removal<N, E> {
  const selectedTables = new Set(nodes.map((node) => node.id));
  return {
    nodes: [],
    edges: edges.filter(
      (edge) =>
        edge.selected === true &&
        !selectedTables.has(edge.source) &&
        !selectedTables.has(edge.target),
    ),
  };
}
