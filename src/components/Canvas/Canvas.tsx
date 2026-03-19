import { useState, useMemo, useCallback, useEffect } from "react";
import { ReactFlow, Background, applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import type { Node, Edge, NodeChange, EdgeChange, Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useSchemaStore } from "../../stores/schemaStore";
import { useThemeStore } from "../../stores/themeStore";
import { TableNode } from "../TableNode/TableNode";
import { RelationEdge } from "../RelationEdge/RelationEdge";
import { SidePanel } from "../SidePanel/SidePanel";
import { Toolbar } from "../Toolbar/Toolbar";
import { CanvasControls } from "../CanvasControls/CanvasControls";
import { ContextMenu } from "../ContextMenu/ContextMenu";
import { EmptyCanvas } from "../EmptyCanvas/EmptyCanvas";
import { listen } from "@tauri-apps/api/event";
import { genId } from "../../utils/id";
import { createTable, duplicateTable } from "../../utils/schemaActions";
import type { Table, Relation } from "../../types/schema";

const nodeTypes = { table: TableNode };
const edgeTypes = { relation: RelationEdge };
const PRO_OPTIONS = { hideAttribution: true };
const DELETE_KEY_CODE = ["Delete", "Backspace"];

function tablesToNodes(tables: Table[]) {
  return tables.map((table) => ({
    id: table.id,
    type: "table" as const,
    position: table.position,
    data: {
      label: table.name,
      columns: table.columns,
      color: table.color,
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

interface CanvasProps {
  onOpenAgentSetup: () => void;
}

export function Canvas({ onOpenAgentSetup }: CanvasProps) {
  const tables = useSchemaStore((s) => s.schema.tables);
  const relations = useSchemaStore((s) => s.schema.relations);
  const updateTable = useSchemaStore((s) => s.updateTable);
  const deleteTable = useSchemaStore((s) => s.deleteTable);
  const addRelation = useSchemaStore((s) => s.addRelation);
  const deleteRelation = useSchemaStore((s) => s.deleteRelation);
  const theme = useThemeStore((s) => s.theme);

  const gridColor = theme === "dark" ? "#333030" : "#E8E5E6";

  const [sidePanelOpen, setSidePanelOpen] = useState(true);

  useEffect(() => {
    const unlisten = listen("toggle-sidebar", () => {
      setSidePanelOpen((prev) => !prev);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [localNodes, setLocalNodes] = useState<Node[] | null>(null);
  const [localEdges, setLocalEdges] = useState<Edge[] | null>(null);
  const [lastStoreNodes, setLastStoreNodes] = useState<Node[]>([]);
  const [lastStoreEdges, setLastStoreEdges] = useState<Edge[]>([]);

  const storeNodes = useMemo(() => tablesToNodes(tables), [tables]);
  const storeEdges = useMemo(() => relationsToEdges(relations), [relations]);

  if (storeNodes !== lastStoreNodes) {
    setLastStoreNodes(storeNodes);
    if (localNodes !== null) {
      setLocalNodes(null);
    }
  }

  if (storeEdges !== lastStoreEdges) {
    setLastStoreEdges(storeEdges);
    if (localEdges !== null) {
      setLocalEdges(null);
    }
  }

  const nodes = localNodes ?? storeNodes;
  const baseEdges = localEdges ?? storeEdges;
  const edges = useMemo(
    () =>
      hoveredEdgeId
        ? baseEdges.map((e) => (e.id === hoveredEdgeId ? { ...e, zIndex: 999 } : e))
        : baseEdges,
    [baseEdges, hoveredEdgeId],
  );

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
      const removes = changes.filter((c) => c.type === "remove");
      if (removes.length > 0) {
        for (const r of removes) deleteRelation(r.id);
        setLocalEdges(null);
        return;
      }
      setLocalEdges((prev) => applyEdgeChanges(changes, prev ?? storeEdges));
    },
    [deleteRelation, storeEdges],
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

  const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    setHoveredEdgeId(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdgeId(null);
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({
      tableId: node.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (sidePanelOpen) {
        setOpenTableId(node.id);
      }
    },
    [sidePanelOpen],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleAddFirstTable = useCallback(() => {
    const newId = createTable();
    setOpenTableId(newId);
  }, []);

  return (
    <div className="flex flex-col w-screen h-screen bg-surface-canvas">
      <Toolbar
        isSidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen(!sidePanelOpen)}
        onOpenAgentSetup={onOpenAgentSetup}
      />

      <div className="relative flex flex-1">
        <SidePanel
          isOpen={sidePanelOpen}
          openTableId={openTableId}
          onOpenTable={setOpenTableId}
        />

        <div className="relative flex-1">
          {tables.length === 0 && (
            <EmptyCanvas
              onAddTable={handleAddFirstTable}
              isSidePanelOpen={sidePanelOpen}
            />
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseLeave={onEdgeMouseLeave}
            onPaneClick={handleCloseContextMenu}
            elevateEdgesOnSelect
            onInit={(instance) => instance.fitView({ padding: 0.2 })}
            minZoom={0.1}
            maxZoom={8}
            deleteKeyCode={DELETE_KEY_CODE}
            proOptions={PRO_OPTIONS}
          >
            <Background gap={20} size={1} color={gridColor} />
            <CanvasControls isSidePanelOpen={sidePanelOpen} />
          </ReactFlow>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={() => {
            setSidePanelOpen(true);
            setOpenTableId(contextMenu.tableId);
            setContextMenu(null);
          }}
          onDuplicate={() => {
            const newId = duplicateTable(contextMenu.tableId);
            if (newId) setOpenTableId(newId);
            setContextMenu(null);
          }}
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
