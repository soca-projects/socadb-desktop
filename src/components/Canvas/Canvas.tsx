import { useState, useMemo, useCallback } from "react";
import { ReactFlow, Background, Controls, applyNodeChanges } from "@xyflow/react";
import type { Node, NodeChange, EdgeChange, Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useSchemaStore } from "../../stores/schemaStore";
import { TableNode } from "../TableNode/TableNode";
import { RelationEdge } from "../RelationEdge/RelationEdge";
import { SidePanel } from "../SidePanel/SidePanel";
import { ContextMenu } from "../ContextMenu/ContextMenu";
import { genId } from "../../utils/id";
import type { Table, Relation } from "../../types/schema";

const nodeTypes = { table: TableNode };
const edgeTypes = { relation: RelationEdge };

const SIDE_PANEL_WIDTH = 280;

function tablesToNodes(tables: Table[]) {
  return tables.map((table) => ({
    id: table.id,
    type: "table" as const,
    position: table.position,
    data: {
      label: table.name,
      columns: table.columns,
    },
  }));
}

function relationsToEdges(relations: Relation[]) {
  return relations.map((rel) => ({
    id: rel.id,
    type: "relation" as const,
    source: rel.from.tableId,
    sourceHandle: `${rel.from.columnId}-source`,
    target: rel.to.tableId,
    targetHandle: `${rel.to.columnId}-target`,
    data: {
      relationType: rel.type,
    },
  }));
}

interface ContextMenuState {
  tableId: string;
  x: number;
  y: number;
}

export function Canvas() {
  const tables = useSchemaStore((s) => s.schema.tables);
  const relations = useSchemaStore((s) => s.schema.relations);
  const updateTable = useSchemaStore((s) => s.updateTable);
  const deleteTable = useSchemaStore((s) => s.deleteTable);
  const addRelation = useSchemaStore((s) => s.addRelation);
  const deleteRelation = useSchemaStore((s) => s.deleteRelation);

  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [localNodes, setLocalNodes] = useState<Node[] | null>(null);
  const [lastStoreNodes, setLastStoreNodes] = useState<Node[]>([]);

  const storeNodes = useMemo(() => tablesToNodes(tables), [tables]);
  const edges = useMemo(() => relationsToEdges(relations), [relations]);

  if (storeNodes !== lastStoreNodes) {
    setLastStoreNodes(storeNodes);
    if (localNodes !== null) {
      setLocalNodes(null);
    }
  }

  const nodes = localNodes ?? storeNodes;

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setLocalNodes((prev) => applyNodeChanges(changes, prev ?? storeNodes));
    },
    [storeNodes],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateTable(node.id, { position: node.position });
      setLocalNodes(null);
    },
    [updateTable],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "remove") {
          deleteRelation(change.id);
        }
      }
    },
    [deleteRelation],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle
      )
        return;

      const fromColumnId = connection.sourceHandle.replace(/-source$/, "");
      const toColumnId = connection.targetHandle.replace(/-target$/, "");

      addRelation({
        id: genId(),
        from: { tableId: connection.source, columnId: fromColumnId },
        to: { tableId: connection.target, columnId: toColumnId },
        type: "1:N",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    },
    [addRelation],
  );

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({
      tableId: node.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className="flex h-screen w-screen">
      <SidePanel
        isOpen={sidePanelOpen}
        onToggle={() => setSidePanelOpen(!sidePanelOpen)}
      />

      <div
        className="flex-1"
        style={{ marginLeft: sidePanelOpen ? SIDE_PANEL_WIDTH : 0 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={handleCloseContextMenu}
          fitView
          deleteKeyCode="Delete"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} color="#f1f5f9" />
          <Controls />
        </ReactFlow>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={() => {
            deleteTable(contextMenu.tableId);
            setContextMenu(null);
          }}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
}
