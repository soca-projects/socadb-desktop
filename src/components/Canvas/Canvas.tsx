import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
} from "@xyflow/react";
import type { Node, Edge, NodeChange, EdgeChange, Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useSchemaStore } from "../../stores/schemaStore";
import { useThemeStore } from "../../stores/themeStore";
import { useFocusStore } from "../../stores/focusStore";
import { TableNode } from "../TableNode/TableNode";
import { RelationEdge } from "../RelationEdge/RelationEdge";
import { SidePanel } from "../SidePanel/SidePanel";
import { Toolbar } from "../Toolbar/Toolbar";
import { CanvasControls } from "../CanvasControls/CanvasControls";
import { ContextMenu } from "../ContextMenu/ContextMenu";
import { EmptyCanvas } from "../EmptyCanvas/EmptyCanvas";
import { ExportModal } from "../ExportModal/ExportModal";
import { ImportModal } from "../ImportModal/ImportModal";
import { listen } from "@tauri-apps/api/event";
import { genId } from "../../utils/id";
import { createTable, duplicateTable } from "../../utils/schemaActions";
import type { Table, Relation } from "../../types/schema";

const nodeTypes = { table: TableNode };
const edgeTypes = { relation: RelationEdge };
const PRO_OPTIONS = { hideAttribution: true };
const DELETE_KEY_CODE = ["Delete", "Backspace"];
const SIDE_PANEL_PX = 280;

function ViewportCompensator({ isSidePanelOpen }: { isSidePanelOpen: boolean }) {
  const { getViewport, setViewport } = useReactFlow();
  const prevOpen = useRef(isSidePanelOpen);

  useEffect(() => {
    if (prevOpen.current === isSidePanelOpen) return;
    prevOpen.current = isSidePanelOpen;
    const { x, y, zoom } = getViewport();
    const offset = isSidePanelOpen ? -SIDE_PANEL_PX : SIDE_PANEL_PX;
    setViewport({ x: x + offset, y, zoom });
  }, [isSidePanelOpen, getViewport, setViewport]);

  return null;
}

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

  const gridColor = theme === "dark" ? "#3A3737" : "#DBD8D9";

  const focusMode = useFocusStore((s) => s.focusMode);
  const toggleFocusMode = useFocusStore((s) => s.toggleFocusMode);

  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    const unlistenSidebar = listen("toggle-sidebar", () => {
      setSidePanelOpen((prev) => !prev);
    });
    const unlistenFocus = listen("toggle-focus-mode", () => {
      toggleFocusMode();
    });
    const unlistenExport = listen("open-export", () => {
      setExportModalOpen(true);
    });
    const unlistenImport = listen("open-import", () => {
      setImportModalOpen(true);
    });
    return () => {
      void unlistenSidebar.then((fn) => fn());
      void unlistenFocus.then((fn) => fn());
      void unlistenExport.then((fn) => fn());
      void unlistenImport.then((fn) => fn());
    };
  }, [toggleFocusMode]);
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
      {!focusMode && (
        <Toolbar
          isSidePanelOpen={sidePanelOpen}
          onToggleSidePanel={() => setSidePanelOpen(!sidePanelOpen)}
          onToggleFocusMode={toggleFocusMode}
          onOpenAgentSetup={onOpenAgentSetup}
        />
      )}

      <div className="relative flex flex-1">
        {!focusMode && (
          <SidePanel
            isOpen={sidePanelOpen}
            openTableId={openTableId}
            onOpenTable={setOpenTableId}
          />
        )}

        <div className="relative flex-1">
          {tables.length === 0 && !focusMode && (
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
            maxZoom={2}
            deleteKeyCode={DELETE_KEY_CODE}
            proOptions={PRO_OPTIONS}
          >
            <Background gap={12} size={2} color={gridColor} />
            <ViewportCompensator isSidePanelOpen={sidePanelOpen} />
            {!focusMode && <CanvasControls />}
          </ReactFlow>
          {focusMode && (
            <button
              onClick={toggleFocusMode}
              className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-tertiary shadow-soft transition-colors hover:bg-surface-muted hover:text-secondary"
            >
              Press{" "}
              <kbd className="mx-0.5 rounded border border-border-light bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
                {"\u2318\u21E7"}F
              </kbd>{" "}
              to exit focus mode
            </button>
          )}
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

      {exportModalOpen && <ExportModal onClose={() => setExportModalOpen(false)} />}
      {importModalOpen && <ImportModal onClose={() => setImportModalOpen(false)} />}
    </div>
  );
}
